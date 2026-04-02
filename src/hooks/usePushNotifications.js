import { useEffect, useState } from 'react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { doc, setDoc, deleteDoc } from 'firebase/firestore'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export function usePushNotifications() {
  const { user } = useAuth()
  const [permission, setPermission] = useState(Notification.permission)
  const [supported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window)

  useEffect(() => {
    if (!supported || !VAPID_PUBLIC_KEY) return
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  }, [supported])

  const subscribe = async () => {
    if (!supported || !user || !VAPID_PUBLIC_KEY) return false
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false

      const reg = await navigator.serviceWorker.ready
      const existing = await reg.pushManager.getSubscription()
      if (existing) await existing.unsubscribe()

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })

      const subData = sub.toJSON()
      await setDoc(doc(db, 'pushSubscriptions', user.uid), {
        userId: user.uid,
        endpoint: subData.endpoint,
        keys: subData.keys,
        updatedAt: new Date(),
      })
      return true
    } catch (err) {
      console.error('Push subscription error:', err)
      return false
    }
  }

  const unsubscribe = async () => {
    if (!user) return
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await deleteDoc(doc(db, 'pushSubscriptions', user.uid))
    setPermission('default')
  }

  return { supported, permission, subscribe, unsubscribe }
}
