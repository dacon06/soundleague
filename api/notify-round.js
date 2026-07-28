// api/notify-round.js
// Ereignisbasierte Push-Benachrichtigungen: wird vom Client aufgerufen, sobald eine
// Runde weiterschaltet (alle eingereicht / alle abgestimmt / neue Runde gestartet).
//
// Der Client schickt nur roundId + event — welcher Zustand tatsächlich gilt, prüft
// der Server selbst in Firestore. Ein Merker im Runden-Dokument (in einer Transaktion
// gesetzt) sorgt dafür, dass dieselbe Benachrichtigung nur einmal rausgeht, auch wenn
// mehrere Clients gleichzeitig weiterschalten.

import { getDb, getSubscriptionsForUsers, sendToSubscriptions } from './_push.js'

// event → erwarteter Rundenstatus + Merker-Feld + Text
const EVENTS = {
  'round-start': {
    status: 'submission',
    flag: 'notifiedRoundStart',
    build: (round, groupName) => ({
      title: '🎵 Neue Runde gestartet!',
      body: `„${round.prompt}" in ${groupName} — jetzt Song einreichen`,
    }),
  },
  voting: {
    status: 'voting',
    flag: 'notifiedVotingStart',
    build: (round, groupName) => ({
      title: '🗳️ Abstimmung läuft!',
      body: `Alle haben eingereicht — jetzt abstimmen bei „${round.prompt}" in ${groupName}`,
    }),
  },
  results: {
    status: 'results',
    flag: 'notifiedResults',
    build: (round, groupName) => ({
      title: '🏆 Ergebnisse sind da!',
      body: `„${round.prompt}" in ${groupName} ist beendet — schau dir das Ergebnis an`,
    }),
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const { roundId, event, actorUid } = body

  const cfg = EVENTS[event]
  if (!roundId || !cfg) return res.status(400).json({ error: 'roundId und gültiges event nötig' })

  try {
    const db = getDb()
    const roundRef = db.collection('rounds').doc(roundId)

    // Zustand prüfen + Merker setzen — atomar, damit parallele Aufrufe nicht doppelt senden.
    const round = await db.runTransaction(async tx => {
      const snap = await tx.get(roundRef)
      if (!snap.exists) return null
      const data = snap.data()
      if (data.status !== cfg.status) return null   // Ereignis passt nicht zum echten Zustand
      if (data[cfg.flag]) return null               // schon verschickt
      tx.update(roundRef, { [cfg.flag]: true })
      return { id: snap.id, ...data }
    })

    if (!round) return res.json({ sent: 0, skipped: true })

    const groupSnap = await db.collection('groups').doc(round.groupId).get()
    const group = groupSnap.data() || {}
    const members = (group.members || []).filter(uid => uid !== actorUid)

    const subs = await getSubscriptionsForUsers(db, members)
    if (!subs.length) return res.json({ sent: 0, message: 'Keine Abos' })

    const { title, body: text } = cfg.build(round, group.name || 'deiner Gruppe')
    const { sent, removed } = await sendToSubscriptions(db, subs, {
      title,
      body: text,
      tag: `${event}-${round.id}`,
      url: `/group/${round.groupId}/round/${round.id}`,
    })

    return res.json({ sent, removed })
  } catch (err) {
    console.error('notify-round error:', err)
    return res.status(500).json({ error: err.message })
  }
}
