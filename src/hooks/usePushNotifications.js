import { useState, useEffect, useCallback } from 'react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)))
}

// Dokument-ID aus dem Endpoint ableiten: ein Nutzer kann mehrere Geräte haben,
// aber dasselbe Gerät soll beim erneuten Abonnieren kein Duplikat anlegen.
async function subscriptionId(endpoint) {
  const bytes = new TextEncoder().encode(endpoint)
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

export function usePushNotifications() {
  const { user } = useAuth()
  const [permission, setPermission] = useState(() => {
    try { return Notification.permission } catch { return 'denied' }
  })
  const [enabled, setEnabled] = useState(false)

  const supported = typeof Notification !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    !!VAPID_PUBLIC_KEY

  // Bestehendes Abo erkennen und in Firestore auffrischen. Browser können Abos
  // eigenständig erneuern — ohne diesen Abgleich zeigt der Server ins Leere.
  useEffect(() => {
    if (!supported || !user) return
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
