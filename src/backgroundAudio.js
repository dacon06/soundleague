// Weiterspielen im Hintergrund in der Android-App.
// Die App muss wissen, ob gerade Musik läuft: Dann bleibt die Seite beim Minimieren
// "sichtbar" und Android zeigt eine Benachrichtigung mit Pause-Knopf.
// Im Browser (iPhone, PC) passiert hier nichts.
import { Capacitor, registerPlugin } from '@capacitor/core'

const IS_NATIVE = Capacitor.isNativePlatform()
const BackgroundAudio = registerPlugin('BackgroundAudio')

// Alle Player, die gerade spielen: id → { pause, title }
const playing = new Map()
let listenerAdded = false

function update() {
  if (!IS_NATIVE) return
  const current = [...playing.values()].at(-1)
  BackgroundAudio.setPlaying({ playing: playing.size > 0, title: current?.title || '' })
    .catch(() => { /* ältere App-Version ohne Plugin → einfach ignorieren */ })
}

function ensureListener() {
  if (!IS_NATIVE || listenerAdded) return
  listenerAdded = true
  // Pause-Knopf in der Benachrichtigung
  BackgroundAudio.addListener('pause', () => {
    playing.forEach(p => { try { p.pause() } catch { /* ignoriert */ } })
  }).catch(() => { listenerAdded = false })
}

export function reportPlaying(id, isPlaying, { pause, title } = {}) {
  if (!IS_NATIVE) return
  ensureListener()
  if (isPlaying) playing.set(id, { pause, title })
  else if (!playing.delete(id)) return
  update()
}
