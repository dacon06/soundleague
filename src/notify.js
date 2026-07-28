// Löst serverseitige Push-Benachrichtigungen aus, wenn eine Runde weiterschaltet.
// Der Server prüft selbst, ob das Ereignis wirklich eingetreten ist, und verschickt
// jede Benachrichtigung nur einmal — mehrfache Aufrufe sind also unschädlich.

export function notifyRound(roundId, event, actorUid) {
  if (!roundId || !event) return Promise.resolve()
  return fetch('/api/notify-round', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roundId, event, actorUid }),
    keepalive: true, // geht auch noch raus, wenn die Seite gerade geschlossen wird
  }).catch(() => {}) // Benachrichtigung ist Beiwerk – Fehler nie an den Nutzer durchreichen
}
