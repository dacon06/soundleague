import { useState, useRef, useEffect } from 'react'

let ytApiReady = false
let ytApiCallbacks = []

function loadYTApi() {
  if (ytApiReady) return Promise.resolve()
  return new Promise((resolve) => {
    ytApiCallbacks.push(resolve)
    if (!window.YT) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      window.onYouTubeIframeAPIReady = () => {
        ytApiReady = true
        ytApiCallbacks.forEach(cb => cb())
        ytApiCallbacks = []
      }
    }
  })
}

export default function YouTubePlayer({ videoId, compact = false, autoPlay = false }) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const intervalRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  // Während des Ziehens zeigt die Leiste die gezogene Position, nicht die des Players.
  const [scrub, setScrub] = useState(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    if (!videoId) return
    let player

    loadYTApi().then(() => {
      if (!containerRef.current) return
      player = new window.YT.Player(containerRef.current, {
        videoId,
        height: '0',
        width: '0',
        playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1 },
        events: {
          onReady: (e) => {
            playerRef.current = e.target
            setDuration(e.target.getDuration())
            setReady(true)
            // Vorhören startet direkt; blockt der Browser das, bleibt der Play-Button da.
            if (autoPlay) { try { e.target.playVideo() } catch { /* ignoriert */ } }
          },
          onStateChange: (e) => {
            const YT = window.YT.PlayerState
            if (e.data === YT.PLAYING) {
              setPlaying(true)
              setDuration(playerRef.current.getDuration())
              intervalRef.current = setInterval(() => {
                if (playerRef.current && !draggingRef.current) {
                  setProgress(playerRef.current.getCurrentTime())
                }
              }, 500)
            } else {
              setPlaying(false)
              clearInterval(intervalRef.current)
            }
            if (e.data === YT.ENDED) {
              setProgress(0)
              setPlaying(false)
            }
          },
        },
      })
      playerRef.current = player
    })

    return () => {
      clearInterval(intervalRef.current)
      try { player?.destroy() } catch {}
      playerRef.current = null
      setReady(false)
      setPlaying(false)
      setProgress(0)
    }
  }, [videoId])

  const togglePlay = () => {
    if (!playerRef.current || !ready) return
    playing ? playerRef.current.pauseVideo() : playerRef.current.playVideo()
  }

  // ─── Seekbar: tippen ODER ziehen ───
  const ratioFromEvent = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
  }

  const handlePointerDown = (e) => {
    if (!playerRef.current || !duration) return
    draggingRef.current = true
    // Pointer einfangen: so kommen Move/Up auch an, wenn der Finger die Leiste verlässt.
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setScrub(ratioFromEvent(e))
  }

  const handlePointerMove = (e) => {
    if (!draggingRef.current) return
    setScrub(ratioFromEvent(e))
  }

  const handlePointerUp = (e) => {
    if (!draggingRef.current) return
    draggingRef.current = false
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    const newTime = ratioFromEvent(e) * duration
    playerRef.current?.seekTo(newTime, true)
    setProgress(newTime)
    setScrub(null)
  }

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const dragging = scrub !== null
  const shownTime = dragging ? scrub * duration : progress
  const pct = duration ? (shownTime / duration) * 100 : 0

  return (
    <div style={{
      background: compact ? 'transparent' : 'var(--surface2)',
      border: compact ? 'none' : '1px solid var(--border)',
      borderRadius: 12,
      padding: compact ? '4px 0 0' : '10px 14px',
      marginBottom: compact ? 0 : 10,
    }}>
      {/* Hidden YouTube player div */}
      <div ref={containerRef} style={{ display: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          disabled={!ready}
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: ready ? '#FF0000' : 'var(--surface3)',
            border: 'none',
            cursor: ready ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          {!ready ? (
            <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid #666', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
          ) : playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff">
              <rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" style={{ marginLeft: 2 }}>
              <polygon points="5,3 19,12 5,21"/>
            </svg>
          )}
        </button>

        {/* Progress bar + time */}
        <div style={{ flex: 1 }}>
          {/* Progress bar — antippen oder ziehen. Der padding-Streifen vergrößert
              die Trefferfläche, ohne die Leiste optisch dicker zu machen. */}
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              padding: '9px 0',
              margin: '-9px 0 -5px',
              cursor: ready ? 'pointer' : 'default',
              touchAction: 'none', // sonst scrollt die Seite statt zu ziehen
            }}
          >
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, position: 'relative' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: '#FF0000', borderRadius: 2, transition: dragging ? 'none' : 'width 0.5s linear' }} />
              <div style={{
                position: 'absolute',
                left: `${pct}%`,
                top: '50%',
                transform: `translate(-50%, -50%) scale(${dragging ? 1.5 : 1})`,
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: '#FF0000',
                opacity: dragging || playing || progress > 0 ? 1 : 0,
                transition: dragging ? 'none' : 'transform 0.15s, left 0.5s linear',
              }} />
            </div>
          </div>
          {/* Time */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Space Mono', marginTop: 4 }}>
            <span>{fmt(shownTime)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* YouTube link */}
        <a
          href={`https://youtube.com/watch?v=${videoId}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--text-muted)', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
          title="Auf YouTube öffnen"
        >
          ↗
        </a>
      </div>
    </div>
  )
}
