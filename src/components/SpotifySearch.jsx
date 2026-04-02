import { useState, useCallback } from 'react'
import { searchTracks, isSpotifyConnected, initiateSpotifyAuth } from '../spotify'

function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export default function SpotifySearch({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const connected = isSpotifyConnected()

  const doSearch = useCallback(
    debounce(async (q) => {
      if (!q.trim()) { setResults([]); return }
      setLoading(true)
      setError('')
      try {
        const tracks = await searchTracks(q)
        setResults(tracks)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 400),
    []
  )

  const handleQuery = (e) => {
    setQuery(e.target.value)
    doSearch(e.target.value)
  }

  const handleSelect = (track) => setSelected(track)

  const handleConfirm = () => {
    if (selected) onSelect(selected)
  }

  if (!connected) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-handle" />
          <div className="modal-header">
            <h3 style={{ fontSize: 20 }}>Spotify verbinden</h3>
            <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
          </div>
          <div className="modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🎵</div>
            <p style={{ color: 'var(--text-dim)', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
              Verbinde deinen Spotify-Account um Songs zu suchen und einzureichen.
            </p>
            <button
              onClick={initiateSpotifyAuth}
              className="btn btn-spotify btn-full btn-lg"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
              </svg>
              Mit Spotify verbinden
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 20 }}>Song auswählen</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <input
            autoFocus
            value={query}
            onChange={handleQuery}
            placeholder="Song oder Künstler suchen…"
            style={{ marginBottom: 16 }}
          />

          {error && <div className="error-msg">{error}</div>}

          {loading && (
            <div className="loading-center" style={{ minHeight: 80 }}>
              <div className="spinner" />
            </div>
          )}

          {!loading && results.length === 0 && query && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24 }}>
              Keine Ergebnisse für „{query}"
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
            {results.map(track => (
              <button
                key={track.id}
                onClick={() => handleSelect(track)}
                className={`track-card ${selected?.id === track.id ? 'selected' : ''}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
              >
                {track.album?.images?.[2]?.url ? (
                  <img src={track.album.images[2].url} alt="" className="track-art" />
                ) : (
                  <div className="track-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🎵</div>
                )}
                <div className="track-info">
                  <div className="track-name">{track.name}</div>
                  <div className="track-artist">{track.artists.map(a => a.name).join(', ')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{track.album?.name}</div>
                </div>
                {selected?.id === track.id && (
                  <span style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
          </div>

          {selected && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>AUSGEWÄHLT</div>
              <div className="track-card selected" style={{ marginBottom: 14 }}>
                {selected.album?.images?.[2]?.url && (
                  <img src={selected.album.images[2].url} alt="" className="track-art" />
                )}
                <div className="track-info">
                  <div className="track-name">{selected.name}</div>
                  <div className="track-artist">{selected.artists.map(a => a.name).join(', ')}</div>
                </div>
              </div>
              <button onClick={handleConfirm} className="btn btn-primary btn-full">
                Song einreichen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
