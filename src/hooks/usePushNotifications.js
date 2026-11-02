import { useState, useEffect, useCallback } from 'react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
// In der Android-App läuft Push über FCM statt über Web Push
const IS_NATIVE = Capacitor.isNativePlatform()

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Dokument-ID aus dem Endpoint ableiten: ein Nutzer kann mehrere Geräte haben,
// aber dasselbe Gerät soll beim erneuten Abonnieren kein Duplikat anlegen.
async function subscriptionId(key) {
  const bytes = new TextEncoder().encode(key)
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

async function saveSubscription(sub, uid) {
  const data = sub.toJSON()
  const id = await subscriptionId(data.endpoint)
  await setDoc(doc(db, 'pushSubscriptions', id), {
    userId: uid,
    endpoint: data.endpoint,
    keys: data.keys,
    updatedAt: serverTimestamp(),
  })
}

async function saveNativeToken(token, uid) {
  const id = await subscriptionId(token)
  await setDoc(doc(db, 'pushSubscriptions', id), {
    userId: uid,
    type: 'fcm',
    token,
    updatedAt: serverTimestamp(),
  })
}

// Liefert den FCM-Token des Geräts. register() meldet das Ergebnis nur per Event.
function registerNative() {
  return new Promise((resolve, reject) => {
    let handles = []
    const done = (fn, value) => {
      handles.forEach(h => h.remove())
      fn(value)
    }
    Promise.all([
      PushNotifications.addListener('registration', t => done(resolve, t.value)),
      PushNotifications.addListener('registrationError', e => done(reject, new Error(e.error))),
    ]).then(h => {
      handles = h
      return PushNotifications.register()
    }).catch(reject)
  })
}

// Tippen auf eine Benachrichtigung öffnet die passende Runde
if (IS_NATIVE) {
  PushNotifications.addListener('pushNotificationActionPerformed', action => {
    const url = action.notification.data?.url
    if (url) window.location.assign(url)
  })
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [permission, setPermission] = useState(() => {
    if (IS_NATIVE) return 'default' // wird unten asynchron abgefragt
    try { return Notification.permission } catch { return 'unsupported' }
  })
  const [enabled, setEnabled] = useState(false)

  const supported = IS_NATIVE || (
    typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY
  )

  // App: Berechtigung abfragen und bei Erlaubnis den Token auffrischen — FCM
  // kann Tokens jederzeit rotieren.
  useEffect(() => {
    if (!IS_NATIVE || !user) return
    let cancelled = false
    PushNotifications.checkPermissions()
      .then(async ({ receive }) => {
        const perm = receive === 'prompt' || receive === 'prompt-with-rationale' ? 'default' : receive
        if (cancelled) return
        setPermission(perm)
        if (perm !== 'granted') return
        await saveNativeToken(await registerNative(), user.uid)
        if (!cancelled) setEnabled(true)
      })
      .catch(err => console.error('Push check error:', err))
    return () => { cancelled = true }
  }, [user])

  // Bestehendes Abo erkennen und in Firestore auffrischen. Browser können Abos
  // eigenständig erneuern — ohne diesen Abgleich zeigt der Server ins Leere.
  useEffect(() => {
    if (IS_NATIVE || !supported || !user) return
    let cancelled = false
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(async sub => {
        if (cancelled || !sub) return
        await saveSubscription(sub, user.uid)
        if (!cancelled) setEnabled(true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [supported, user])

  const subscribe = useCallback(async () => {
    if (!supported || !user) return false

    if (IS_NATIVE) {
      try {
        const { receive } = await PushNotifications.requestPermissions()
        const perm = receive === 'granted' ? 'granted' : 'denied'
        setPermission(perm)
        if (perm !== 'granted') return false
        await saveNativeToken(await registerNative(), user.uid)
        setEnabled(true)
        return true
      } catch (err) {
        console.error('Native push error:', err)
        return false
      }
    }

    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false

      const reg = await navigator.serviceWorker.ready

      // Vorhandenes Abo weiterverwenden — erneutes subscribe() mit gleichem Key
      // liefert sonst je nach Browser einen Fehler.
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })
      }

      await saveSubscription(sub, user.uid)
      setEnabled(true)
      return true
    } catch (err) {
      console.error('Push subscribe error:', err)
      return false
    }
  }, [supported, user])

  const unsubscribe = useCallback(async () => {
    if (!user) return
    try {
      if (IS_NATIVE) {
        await PushNotifications.unregister()
        setEnabled(false)
        return
      }
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const id = await subscriptionId(sub.endpoint)
        await sub.unsubscribe()
        await deleteDoc(doc(db, 'pushSubscriptions', id))
      }
      setEnabled(false)
    } catch (err) {
      console.error('Unsubscribe error:', err)
    }
  }, [user])

  return { supported, permission, enabled, subscribe, unsubscribe }
}
