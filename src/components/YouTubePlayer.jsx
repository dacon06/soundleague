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

export default function YouTubePlayer({ videoId, title }) {
  const containerRef = useRef(null)
  const playerRef = useRef(null)
  const intervalRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)
  const [dragging, setDragging] = useState(false)

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
          },
          onStateChange: (e) => {
            const YT = window.YT.PlayerState
            if (e.data === YT.PLAYING) {
              setPlaying(true)
              setDuration(playerRef.current.getDuration())
              intervalRef.current = setInterval(() => {
                if (playerRef.current && !dragging) {
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

  const seek = (e) => {
    if (!playerRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    const newTime = x * duration
    playerRef.current.seekTo(newTime, true)
    setProgress(newTime)
  }

  const fmt = (s) => {
    if (!s || isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const pct = duration ? (progress / duration) * 100 : 0

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '10px 14px',
      marginBottom: 10,
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
          {/* Progress bar */}
          <div
            onClick={seek}
            style={{ height: 4, background: 'var(--border)', borderRadius: 2, cursor: 'pointer', marginBottom: 4, position: 'relative' }}
          >
            <div style={{ height: '100%', width: `${pct}%`, background: '#FF0000', borderRadius: 2, transition: dragging ? 'none' : 'width 0.5s linear' }} />
            <div style={{
              position: 'absolute',
              left: `${pct}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#FF0000',
              opacity: playing || progress > 0 ? 1 : 0,
            }} />
          </div>
          {/* Time */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'Space Mono' }}>
            <span>{fmt(progress)}</span>
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
