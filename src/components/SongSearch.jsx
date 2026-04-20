import { useState, useCallback } from 'react'
import { searchSongs } from '../youtube'

function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

export default function SongSearch({ onSelect, onClose }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)

  const doSearch = useCallback(
    debounce(async (q) => {
      if (!q || q.trim().length < 3) { setResults([]); return }
      setLoading(true)
      setError('')
      try {
        const songs = await searchSongs(q)
        setResults(songs)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 500),
    []
  )

  const handleQuery = (e) => {
    setQuery(e.target.value)
    doSearch(e.target.value)
  }

  const handleConfirm = () => {
    if (selected) onSelect(selected)
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
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <input
              autoFocus
              value={query}
              onChange={handleQuery}
              placeholder="Song oder Künstler suchen…"
            />
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18 }}>
              🎵
            </div>
          </div>

          {error && <div className="error-msg">{error}</div>}

          {loading && (
            <div className="loading-center" style={{ minHeight: 80 }}>
              <div className="spinner" />
            </div>
          )}

          {!loading && results.length === 0 && query.length >= 3 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24 }}>
              Keine Ergebnisse für „{query}"
            </p>
          )}

          {!loading && query.length < 3 && query.length > 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 16 }}>
              Mindestens 3 Zeichen eingeben…
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 340, overflowY: 'auto' }}>
            {results.map(song => (
              <button
                key={song.id}
                onClick={() => setSelected(song)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: selected?.id === song.id ? 'var(--accent-dim)' : 'var(--surface2)',
                  border: selected?.id === song.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  padding: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  width: '100%',
                  transition: 'all 0.15s',
                }}
              >
                {song.thumbnail ? (
                  <img
                    src={song.thumbnail}
                    alt=""
                    style={{ width: 52, height: 39, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
                  />
                ) : (
                  <div style={{ width: 52, height: 39, borderRadius: 6, background: 'var(--surface3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    🎵
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {song.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                    {song.channelTitle}
                  </div>
                </div>
                {selected?.id === song.id && (
                  <span style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>✓</span>
                )}
              </button>
            ))}
          </div>

          {selected && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>AUSGEWÄHLT</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.3)',
                borderRadius: 'var(--radius)', padding: 10, marginBottom: 14,
              }}>
                {selected.thumbnail && (
                  <img src={selected.thumbnail} alt="" style={{ width: 52, height: 39, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selected.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>{selected.channelTitle}</div>
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
