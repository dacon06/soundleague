import { useState } from 'react'

export default function YouTubePlayer({ videoId, title, compact = false }) {
  const [playing, setPlaying] = useState(false)
  const [expanded, setExpanded] = useState(false)

  if (!videoId) return null

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#FF0000',
          border: 'none',
          borderRadius: 8,
          padding: '6px 12px',
          cursor: 'pointer',
          color: '#fff',
          fontSize: 12,
          fontFamily: 'Space Mono, monospace',
          fontWeight: 700,
        }}
      >
        <span style={{ fontSize: 16 }}>▶</span>
        Abspielen
      </button>
    )
  }

  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', background: '#000', marginTop: 10 }}>
      {compact && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            width: '100%', background: '#111', border: 'none', padding: '6px 12px',
            color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', textAlign: 'right',
            fontFamily: 'Space Mono, monospace',
          }}
        >
          ✕ Schließen
        </button>
      )}
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0 }}>
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${compact ? 1 : 0}&rel=0&modestbranding=1`}
          title={title || 'YouTube Video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={{
            position: 'absolute', top: 0, left: 0,
            width: '100%', height: '100%',
            border: 'none',
          }}
        />
      </div>
    </div>
  )
}
