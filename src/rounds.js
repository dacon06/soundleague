// ─── Round lifecycle helpers ───
// Rounds advance based on *completion* (everyone submitted / everyone voted)
// or a manual skip — no longer on fixed calendar deadlines.
// The calendar deadlines are still written at creation time so the push-
// notification reminders keep working, but they no longer force transitions.

import { db } from './firebase'
import {
  doc, getDoc, collection, query, where, getDocs,
  addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore'

export function toItem(raw) {
  if (typeof raw === 'string') return { name: raw, description: '' }
  return { name: raw.name || '', description: raw.description || '' }
}

// ─── Kalenderbasierte Deadlines (nur noch für Erinnerungen / Anzeige-Default) ───
// weeksOffset=0 → diese Woche, 1 → nächste Woche, usw.
// Basis ist immer der Montag der AKTUELLEN Woche.
export function getCalendarDeadlines(weeksOffset = 0) {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=So, 1=Mo, ..., 6=Sa

  // Montag dieser Woche (rückwärts rechnen)
  const thisMonday = new Date(now)
  thisMonday.setHours(0, 0, 0, 0)
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  thisMonday.setDate(now.getDate() - daysSinceMonday)

  // Offset anwenden
  thisMonday.setDate(thisMonday.getDate() + weeksOffset * 7)

  // Samstag = Montag + 5
  const saturdayOfRound = new Date(thisMonday)
  saturdayOfRound.setDate(thisMonday.getDate() + 5)

  // Montag danach = Montag + 7
  const mondayAfterVoting = new Date(thisMonday)
  mondayAfterVoting.setDate(thisMonday.getDate() + 7)

  return {
    submissionDeadline: saturdayOfRound,
    votingDeadline: mondayAfterVoting,
  }
}

// ─── Laufzeit-Anzeige ("läuft seit X Tagen") ───
export function phaseStart(round) {
  if (!round) return null
  if (round.status === 'voting')
    return round.votingStartedAt?.toDate?.() || round.createdAt?.toDate?.() || null
  return round.createdAt?.toDate?.() || null
}

export function daysRunning(round) {
  const start = phaseStart(round)
  if (!start) return null
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86_400_000))
}

export function formatRunning(round) {
  const d = daysRunning(round)
  if (d === null) return ''
  if (d === 0) return 'läuft seit heute'
  return `läuft seit ${d} Tag${d === 1 ? '' : 'en'}`
}

// ─── Nächste Runde aus der Warteschlange starten ───
export async function autoStartNext(finishedRound) {
  const groupId = finishedRound.groupId
  const groupRef = doc(db, 'groups', groupId)
  const groupSnap = await getDoc(groupRef)
  const gdata = groupSnap.data() || {}

  // Schutz gegen doppeltes Starten, wenn mehrere Clients gleichzeitig prüfen:
  // Nur weiterschalten, wenn diese Runde noch die aktuelle ist.
  if (gdata.currentRoundId && gdata.currentRoundId !== finishedRound.id) return

  const queue = (gdata.categoryQueue || []).map(toItem)
  if (!queue.length) return

  const next = queue[0]
  const { submissionDeadline, votingDeadline } = getCalendarDeadlines()
  const roundRef = await addDoc(collection(db, 'rounds'), {
    groupId,
    prompt: next.name,
    description: next.description || '',
    status: 'submission',
    submissionDeadline,
    votingDeadline,
    playlistId: null,
    createdBy: finishedRound.createdBy,
    createdAt: serverTimestamp(),
    submissionNotificationSent: false,
    votingNotificationSent: false,
    fromQueue: true,
  })
  await updateDoc(groupRef, {
    currentRoundId: roundRef.id,
    categoryQueue: queue.slice(1),
  })
}

// ─── Fortschritt prüfen und ggf. Phase weiterschalten ───
// Gibt { done, total } zurück, damit der Aufrufer den Fortschritt anzeigen kann.
export async function checkRoundCompletion(round, memberCount) {
  if (round.status === 'submission') {
    const snap = await getDocs(query(collection(db, 'submissions'), where('roundId', '==', round.id)))
    const done = new Set(snap.docs.map(d => d.data().userId)).size
    if (memberCount > 0 && done >= memberCount) {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'voting', votingStartedAt: serverTimestamp() })
    }
    return { done, total: memberCount }
  }
  if (round.status === 'voting') {
    const snap = await getDocs(query(collection(db, 'votes'), where('roundId', '==', round.id)))
    const done = new Set(snap.docs.map(d => d.data().voterId)).size
    if (memberCount > 0 && done >= memberCount) {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
      await autoStartNext(round)
    }
    return { done, total: memberCount }
  }
  return { done: 0, total: memberCount }
}

// Bequemer Wrapper: nach einer Aktion (Einreichen/Abstimmen) aufrufen.
export function maybeAdvanceRound(round, group) {
  if (!round || !group) return Promise.resolve()
  return checkRoundCompletion(round, group.members?.length || 0)
}
