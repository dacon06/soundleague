// api/_push.js
// Gemeinsame Helfer für alle Push-Endpunkte (nicht als Route erreichbar, weil "_"-Präfix).

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'

let vapidReady = false

export function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
    })
  }
  return getFirestore()
}

function initVapid() {
  if (vapidReady) return
  webpush.setVapidDetails(
    'mailto:' + (process.env.VAPID_EMAIL || 'admin@soundleague.app'),
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )
  vapidReady = true
}

// Firestore erlaubt max. 30 Werte pro "in"-Query.
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// Alle Push-Abos der angegebenen Nutzer laden (ein Nutzer kann mehrere Geräte haben).
export async function getSubscriptionsForUsers(db, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return []
  const snaps = await Promise.all(
    chunk(ids, 30).map(part =>
      db.collection('pushSubscriptions').where('userId', 'in', part).get()
    )
  )
  return snaps.flatMap(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
}

/**
 * Schickt payload an alle übergebenen Abos und räumt abgelaufene Abos auf.
 * Gibt { sent, removed } zurück.
 */
export async function sendToSubscriptions(db, subs, payload) {
  initVapid()
  const body = JSON.stringify(payload)
  let sent = 0
  const dead = []

  await Promise.all(
    subs.map(async sub => {
      if (!sub.endpoint || !sub.keys) { dead.push(sub.id); return }
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body)
        sent++
      } catch (err) {
        // 404/410 = Abo existiert beim Push-Dienst nicht mehr → löschen
        if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.id)
        else console.error('Push error:', sub.id, err.statusCode, err.message)
      }
    })
  )

  if (dead.length) {
    const batch = db.batch()
    dead.forEach(id => batch.delete(db.collection('pushSubscriptions').doc(id)))
    await batch.commit()
  }

  return { sent, removed: dead.length }
}
