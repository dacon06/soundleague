// netlify/functions/send-notifications.js
// Runs every hour via Netlify Scheduled Functions
// Sends push notifications 24h before submission/voting deadlines

const { schedule } = require('@netlify/functions')
const webpush = require('web-push')
const { initializeApp, cert, getApps } = require('firebase-admin/app')
const { getFirestore } = require('firebase-admin/firestore')

// Init Firebase Admin (only once)
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

const WINDOW_MS = 60 * 60 * 1000 // 1 hour (how often this runs)
const NOTIFY_BEFORE_MS = 24 * 60 * 60 * 1000 // notify 24h before

async function sendNotification(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload)
    )
    return true
  } catch (err) {
    if (err.statusCode === 410) {
      // Subscription expired - clean it up
      return 'expired'
    }
    console.error('Push send error:', err.message)
    return false
  }
}

const handler = async () => {
  const db = getDb()
  const now = Date.now()

  try {
    // Get all active rounds
    const roundsSnap = await db.collection('rounds')
      .where('status', 'in', ['submission', 'voting'])
      .get()

    if (roundsSnap.empty) return { statusCode: 200, body: 'No active rounds' }

    // Get all push subscriptions
    const subsSnap = await db.collection('pushSubscriptions').get()
    const allSubs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    if (allSubs.length === 0) return { statusCode: 200, body: 'No subscriptions' }

    let notificationsSent = 0
    const batch = db.batch()

    for (const roundDoc of roundsSnap.docs) {
      const round = roundDoc.data()
      const roundId = roundDoc.id

      // Get group info for the notification URL
      const groupDoc = await db.collection('groups').doc(round.groupId).get()
      const groupName = groupDoc.data()?.name || 'deine Gruppe'
      const url = `/group/${round.groupId}/round/${roundId}`

      // Check submission deadline (only for submission phase)
      if (round.status === 'submission' && !round.submissionNotificationSent) {
        const deadline = round.submissionDeadline?.toMillis?.() || round.submissionDeadline
        const timeUntil = deadline - now
        if (timeUntil > 0 && timeUntil <= NOTIFY_BEFORE_MS + WINDOW_MS && timeUntil > NOTIFY_BEFORE_MS - WINDOW_MS) {
          // Within the 24h window → send notification
          for (const sub of allSubs) {
            const result = await sendNotification(sub, {
              title: '🎵 Song einreichen endet bald!',
              body: `Noch 24 Stunden für „${round.prompt}" in ${groupName}`,
              tag: `submission-${roundId}`,
              url,
            })
            if (result === 'expired') {
              batch.delete(db.collection('pushSubscriptions').doc(sub.id))
            }
            if (result === true) notificationsSent++
          }
          batch.update(roundDoc.ref, { submissionNotificationSent: true })
        }
      }

      // Check voting deadline (only for voting phase)
      if (round.status === 'voting' && !round.votingNotificationSent) {
        const deadline = round.votingDeadline?.toMillis?.() || round.votingDeadline
        const timeUntil = deadline - now
        if (timeUntil > 0 && timeUntil <= NOTIFY_BEFORE_MS + WINDOW_MS && timeUntil > NOTIFY_BEFORE_MS - WINDOW_MS) {
          for (const sub of allSubs) {
            const result = await sendNotification(sub, {
              title: '🗳️ Abstimmung endet bald!',
              body: `Noch 24 Stunden zum Abstimmen für „${round.prompt}" in ${groupName}`,
              tag: `voting-${roundId}`,
              url,
            })
            if (result === 'expired') {
              batch.delete(db.collection('pushSubscriptions').doc(sub.id))
            }
            if (result === true) notificationsSent++
          }
          batch.update(roundDoc.ref, { votingNotificationSent: true })
        }
      }
    }

    await batch.commit()
    console.log(`Sent ${notificationsSent} notifications`)
    return { statusCode: 200, body: `Sent ${notificationsSent} notifications` }

  } catch (err) {
    console.error('Notification function error:', err)
    return { statusCode: 500, body: err.message }
  }
}

exports.handler = schedule('0 * * * *', handler) // every hour
