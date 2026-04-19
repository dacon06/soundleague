// api/send-notifications.js
// Vercel Serverless Function - runs every hour via Vercel Cron
// Configure in vercel.json: { "crons": [{ "path": "/api/send-notifications", "schedule": "0 * * * *" }] }

import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import webpush from 'web-push'

function getDb() {
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

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'admin@soundleague.app'),
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

const WINDOW_MS = 60 * 60 * 1000
const NOTIFY_BEFORE_MS = 24 * 60 * 60 * 1000

async function sendPush(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    )
    return true
  } catch (err) {
    if (err.statusCode === 410) return 'expired'
    console.error('Push error:', err.message)
    return false
  }
}

export default async function handler(req, res) {
  // Verify this is called by Vercel Cron (or manually for testing)
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getDb()
  const now = Date.now()

  try {
    const roundsSnap = await db.collection('rounds')
      .where('status', 'in', ['submission', 'voting'])
      .get()

    if (roundsSnap.empty) return res.json({ sent: 0, message: 'No active rounds' })

    const subsSnap = await db.collection('pushSubscriptions').get()
    const allSubs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    if (!allSubs.length) return res.json({ sent: 0, message: 'No subscriptions' })

    const batch = db.batch()
    let sent = 0

    for (const roundDoc of roundsSnap.docs) {
      const round = roundDoc.data()
      const roundId = roundDoc.id

      const groupDoc = await db.collection('groups').doc(round.groupId).get()
      const groupName = groupDoc.data()?.name || 'deine Gruppe'
      const url = `/group/${round.groupId}/round/${roundId}`

      if (round.status === 'submission' && !round.submissionNotificationSent) {
        const deadline = round.submissionDeadline?.toMillis?.() || round.submissionDeadline
        const timeUntil = deadline - now
        if (timeUntil > 0 && timeUntil <= NOTIFY_BEFORE_MS + WINDOW_MS && timeUntil > NOTIFY_BEFORE_MS - WINDOW_MS) {
          for (const sub of allSubs) {
            const result = await sendPush(sub, {
              title: '🎵 Song einreichen endet bald!',
              body: `Noch 24h für „${round.prompt}" in ${groupName}`,
              tag: `submission-${roundId}`,
              url,
            })
            if (result === 'expired') batch.delete(db.collection('pushSubscriptions').doc(sub.id))
            if (result === true) sent++
          }
          batch.update(roundDoc.ref, { submissionNotificationSent: true })
        }
      }

      if (round.status === 'voting' && !round.votingNotificationSent) {
        const deadline = round.votingDeadline?.toMillis?.() || round.votingDeadline
        const timeUntil = deadline - now
        if (timeUntil > 0 && timeUntil <= NOTIFY_BEFORE_MS + WINDOW_MS && timeUntil > NOTIFY_BEFORE_MS - WINDOW_MS) {
          for (const sub of allSubs) {
            const result = await sendPush(sub, {
              title: '🗳️ Abstimmung endet bald!',
              body: `Noch 24h zum Abstimmen für „${round.prompt}" in ${groupName}`,
              tag: `voting-${roundId}`,
              url,
            })
            if (result === 'expired') batch.delete(db.collection('pushSubscriptions').doc(sub.id))
            if (result === true) sent++
          }
          batch.update(roundDoc.ref, { votingNotificationSent: true })
        }
      }
    }

    await batch.commit()
    return res.json({ sent, message: `Sent ${sent} notifications` })
  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}
