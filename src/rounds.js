// ─── Round lifecycle helpers ───
// Rounds advance based on *completion* (everyone submitted / everyone voted)
// or a manual skip — no longer on fixed calendar deadlines.
// The calendar deadlines are still written at creation time so the push-
// notification reminders keep working, but they no longer force transitions.

import { db, auth } from './firebase'
import {
  doc, getDoc, collection, query, where, getDocs,
  addDoc, updateDoc, serverTimestamp, runTransaction,
} from 'firebase/firestore'
import { notifyRound } from './notify'

const actor = () => auth.currentUser?.uid || null

// ─── Saisons ───
// Eine Saison besteht aus SEASON_LENGTH abgeschlossenen Runden. Danach wird der
// Punktbeste zum Champion gekürt, das Ergebnis im Archiv (Collection `seasons`)
// gespeichert und die nächste Saison beginnt.
// Runden ohne `seasonNumber` (aus der Zeit vor den Saisons) zählen zu Saison 1.
export const SEASON_LENGTH = 20
export const seasonOf = (round) => round?.seasonNumber || 1

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

// ─── Runde anlegen ───
// Legt die Runde an, macht sie zur aktuellen Runde der Gruppe und benachrichtigt
// die übrigen Mitglieder. Gibt die neue roundId zurück.
export async function createRound(groupId, item, createdBy, remainingQueue) {
  const { submissionDeadline, votingDeadline } = getCalendarDeadlines()
  const groupSnap = await getDoc(doc(db, 'groups', groupId))
  const seasonNumber = groupSnap.data()?.seasonNumber || 1
  const roundRef = await addDoc(collection(db, 'rounds'), {
    groupId,
    seasonNumber,
    prompt: item.name,
    description: item.description || '',
    status: 'submission',
    submissionDeadline,
    votingDeadline,
    playlistId: null,
    createdBy,
    createdAt: serverTimestamp(),
    submissionNotificationSent: false,
    votingNotificationSent: false,
    fromQueue: true,
  })
  await updateDoc(doc(db, 'groups', groupId), {
    currentRoundId: roundRef.id,
    categoryQueue: remainingQueue,
  })
  notifyRound(roundRef.id, 'round-start', actor())
  return roundRef.id
}

// ─── Nächste Runde aus der Warteschlange starten ───
// Gibt true zurück, wenn tatsächlich eine Folgerunde gestartet wurde.
export async function autoStartNext(finishedRound) {
  const groupId = finishedRound.groupId
  const groupSnap = await getDoc(doc(db, 'groups', groupId))
  const gdata = groupSnap.data() || {}

  // Schutz gegen doppeltes Starten, wenn mehrere Clients gleichzeitig prüfen:
  // Nur weiterschalten, wenn diese Runde noch die aktuelle ist.
  if (gdata.currentRoundId && gdata.currentRoundId !== finishedRound.id) return false

  const queue = (gdata.categoryQueue || []).map(toItem)
  if (!queue.length) return false

  await createRound(groupId, queue[0], finishedRound.createdBy, queue.slice(1))
  return true
}

// ─── Phasenwechsel (auch vom manuellen Überspringen genutzt) ───
export async function advanceToVoting(round) {
  await updateDoc(doc(db, 'rounds', round.id), {
    status: 'voting',
    votingStartedAt: serverTimestamp(),
  })
  notifyRound(round.id, 'voting', actor())
}

export async function finishRound(round) {
  await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
  // War das die letzte Runde der Saison? Dann Champion küren — VOR dem Start der
  // nächsten Runde, damit diese schon zur neuen Saison gehört. Ein Fehler hier darf
  // den Rundenwechsel nie blockieren; der Abschluss wird sonst bei der nächsten
  // beendeten Runde nachgeholt.
  try {
    await closeSeasonIfComplete(round)
  } catch (err) {
    console.error('Saison-Abschluss fehlgeschlagen:', err)
  }
  const nextStarted = await autoStartNext(round)
  // Startet direkt eine neue Runde, reicht deren Benachrichtigung — sonst gäbe es
  // zwei Pushes im selben Moment.
  if (!nextStarted) notifyRound(round.id, 'results', actor())
}

// ─── Saison-Ergebnis berechnen ───
// Punkte pro Einreicher wie in der Bestenliste (Summe aller vergebenen Stimmen),
// dazu je Runde der Gewinner-Song.
async function buildSeasonResult(group, seasonRounds) {
  const ordered = [...seasonRounds].sort(
    (a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0)
  )
  const points = {}
  const knownNames = {}
  const roundSummaries = []

  for (const r of ordered) {
    const [votesSnap, subsSnap] = await Promise.all([
      getDocs(query(collection(db, 'votes'), where('roundId', '==', r.id))),
      getDocs(query(collection(db, 'submissions'), where('roundId', '==', r.id))),
    ])
    const subs = subsSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    subs.forEach(s => { if (s.userName) knownNames[s.userId] = s.userName })

    const perSong = {}
    votesSnap.docs.forEach(d => {
      const v = d.data()
      if (!v.submitterUserId) return
      points[v.submitterUserId] = (points[v.submitterUserId] || 0) + (v.points || 0)
      perSong[v.submissionId] = (perSong[v.submissionId] || 0) + (v.points || 0)
    })

    const top = Math.max(0, ...Object.values(perSong))
    roundSummaries.push({
      roundId: r.id,
      prompt: r.prompt || '',
      points: top,
      winners: top > 0
        ? subs.filter(s => perSong[s.id] === top).map(s => ({
            userId: s.userId,
            name: group.memberNames?.[s.userId] || s.userName || 'Anonym',
            songTitle: s.songTitle || '',
          }))
        : [],
    })
  }

  // Namen als Momentaufnahme speichern — Mitglieder können die Gruppe später verlassen.
  const nameOf = (uid) => group.memberNames?.[uid] || knownNames[uid] || 'Anonym'
  const standings = Object.entries(points)
    .map(([userId, pts]) => ({ userId, name: nameOf(userId), points: pts }))
    .sort((a, b) => b.points - a.points)
  const best = standings[0]?.points || 0

  return {
    roundCount: ordered.length,
    // Punktgleichstand an der Spitze → mehrere Champions (geteilter Sieg)
    champions: best > 0 ? standings.filter(s => s.points === best) : [],
    standings,
    rounds: roundSummaries,
  }
}

// ─── Saison abschließen, wenn SEASON_LENGTH Runden voll sind ───
// Gibt die abgeschlossene Saisonnummer zurück (sonst null).
// Mehrere Clients dürfen gleichzeitig aufrufen: Die Transaktion prüft die Saisonnummer
// der Gruppe, sodass genau ein Client das Archiv schreibt und die Nummer erhöht.
export async function closeSeasonIfComplete(finishedRound) {
  const groupId = finishedRound.groupId
  const groupRef = doc(db, 'groups', groupId)
  const groupSnap = await getDoc(groupRef)
  if (!groupSnap.exists()) return null
  const group = groupSnap.data()
  const season = group.seasonNumber || 1

  const roundsSnap = await getDocs(query(collection(db, 'rounds'), where('groupId', '==', groupId)))
  const seasonRounds = roundsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(r => seasonOf(r) === season && r.status === 'results')
  if (seasonRounds.length < SEASON_LENGTH) return null

  const result = await buildSeasonResult(group, seasonRounds)

  const closed = await runTransaction(db, async (tx) => {
    const fresh = await tx.get(groupRef)
    if (!fresh.exists() || (fresh.data().seasonNumber || 1) !== season) return false
    tx.set(doc(db, 'seasons', `${groupId}_${season}`), {
      ...result,
      groupId,
      seasonNumber: season,
      closedAt: serverTimestamp(),
    })
    tx.update(groupRef, { seasonNumber: season + 1 })
    // Markiert die letzte Runde → dort wird der Champion auf der Ergebnisseite gezeigt
    tx.update(doc(db, 'rounds', finishedRound.id), { endsSeason: season })
    return true
  })
  return closed ? season : null
}

// ─── Fortschritt prüfen und ggf. Phase weiterschalten ───
// Gibt { done, total } zurück, damit der Aufrufer den Fortschritt anzeigen kann.
export async function checkRoundCompletion(round, memberCount) {
  if (round.status === 'submission') {
    const snap = await getDocs(query(collection(db, 'submissions'), where('roundId', '==', round.id)))
    const done = new Set(snap.docs.map(d => d.data().userId)).size
    if (memberCount > 0 && done >= memberCount) await advanceToVoting(round)
    return { done, total: memberCount }
  }
  if (round.status === 'voting') {
    const snap = await getDocs(query(collection(db, 'votes'), where('roundId', '==', round.id)))
    const done = new Set(snap.docs.map(d => d.data().voterId)).size
    if (memberCount > 0 && done >= memberCount) await finishRound(round)
    return { done, total: memberCount }
  }
  return { done: 0, total: memberCount }
}

// Bequemer Wrapper: nach einer Aktion (Einreichen/Abstimmen) aufrufen.
export function maybeAdvanceRound(round, group) {
  if (!round || !group) return Promise.resolve()
  return checkRoundCompletion(round, group.members?.length || 0)
}
