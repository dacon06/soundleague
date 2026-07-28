// api/send-notifications.js
// Vercel Cron (siehe vercel.json) — Erinnerungen für laufende Runden.
//
// Runden schalten inzwischen über Vollständigkeit weiter (alle eingereicht / alle
// abgestimmt), die Deadlines sind nur noch Orientierung. Dieser Job erinnert deshalb
// gezielt die Mitglieder, die noch NICHT dran waren, sobald weniger als 24h bis zur
// Deadline übrig sind — pro Runde und Phase genau einmal.

import { getDb, getSubscriptionsForUsers, sendToSubscriptions } from './_push.js'

const DAY_MS = 24 * 60 * 60 * 1000

function toMillis(value) {
  if (!value) return null
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

// uids der Mitglieder, die in dieser Phase noch nichts gemacht haben
async function pendingMembers(db, round, members) {
  const isVoting = round.status === 'voting'
  const snap = await db
    .collection(isVoting ? 'votes' : 'submissions')
    .where('roundId', '==', round.id)
    .get()
  const doneField = isVoting ? 'voterId' : 'userId'
  const done = new Set(snap.docs.map(d => d.data()[doneField]))
  return members.filter(uid => !done.has(uid))
}

export default async function handler(req, res) {
  // Vercel Cron schickt automatisch "Authorization: Bearer $CRON_SECRET", sobald das
  // Secret in den Projekt-Env-Vars gesetzt ist. Ohne Secret läuft der Job ungeschützt.
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const db = getDb()
  const now = Date.now()

  try {
    const roundsSnap = await db
      .collection('rounds')
      .where('status', 'in', ['submission', 'voting'])
      .get()

    if (roundsSnap.empty) return res.json({ sent: 0, message: 'Keine laufenden Runden' })

    let sent = 0
    let removed = 0

    for (const roundDoc of roundsSnap.docs) {
      const round = { id: roundDoc.id, ...roundDoc.data() }
      const isVoting = round.status === 'voting'
      // Merker-Felder aus der bisherigen Version beibehalten
      const sentFlag = isVoting ? 'votingNotificationSent' : 'submissionNotificationSent'
      if (round[sentFlag]) continue

      const deadline = toMillis(isVoting ? round.votingDeadline : round.submissionDeadline)
      if (!deadline) continue

      const remaining = deadline - now
      // Erinnern, sobald weniger als 24h übrig sind (auch wenn die Deadline schon
      // vorbei ist, solange die Runde noch läuft — sie blockiert dann ja alle anderen).
      if (remaining > DAY_MS) continue

      const groupSnap = await db.collection('groups').doc(round.groupId).get()
      const group = groupSnap.data() || {}
      const members = group.members || []

      const pending = await pendingMembers(db, round, members)
      if (!pending.length) {
        await roundDoc.ref.update({ [sentFlag]: true })
        continue
      }

      const subs = await getSubscriptionsForUsers(db, pending)
      if (subs.length) {
        const overdue = remaining <= 0
        const result = await sendToSubscriptions(db, subs, {
          title: isVoting ? '🗳️ Du hast noch nicht abgestimmt' : '🎵 Du hast noch keinen Song',
          body: overdue
            ? `Die Gruppe ${group.name || ''} wartet auf dich — „${round.prompt}"`
            : `Noch 24h für „${round.prompt}" in ${group.name || 'deiner Gruppe'}`,
          tag: `${round.status}-reminder-${round.id}`,
          url: `/group/${round.groupId}/round/${round.id}`,
        })
        sent += result.sent
        removed += result.removed
      }

      await roundDoc.ref.update({ [sentFlag]: true })
    }

    return res.json({ sent, removed })
  } catch (err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}
