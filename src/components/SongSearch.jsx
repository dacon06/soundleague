import { useState, useCallback } from 'react'
import { searchSongs } from '../youtube'

function debounce(fn, delay) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), delay)
  }
}

// Clean up YouTube title to extract song + artist
function parseTitle(title, channelTitle) {
  // Remove common suffixes
  let clean = title
    .replace(/\(official (video|audio|music video|lyric video|visualizer)\)/gi, '')
    .replace(/\[official (video|audio|music video|lyric video|visualizer)\]/gi, '')
    .replace(/official (video|audio|music video|lyric video|visualizer)/gi, '')
    .replace(/\(lyrics?\)/gi, '')
    .replace(/\[lyrics?\]/gi, '')
    .replace(/\(hd\)/gi, '')
    .replace(/\(4k\)/gi, '')
    .replace(/\bvevo\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()

  return clean
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

          {loading && <div className="loading-center" style={{ minHeight: 80 }}><div className="spinner" /></div>}

          {!loading && results.length === 0 && query.length >= 3 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24 }}>
              Keine Ergebnisse für „{query}"
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {results.map(song => {
              const cleanTitle = parseTitle(song.title, song.channelTitle)
              const isSelected = selected?.id === song.id
              return (
                <button
                  key={song.id}
                  onClick={() => setSelected(isSelected ? null : song)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    background: isSelected ? 'var(--accent-dim)' : 'var(--surface3)',
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border2)',
                    borderRadius: 'var(--radius)',
                    padding: '10px 14px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {cleanTitle}
                    </div>
                    <div style={{ fontSize: 12, color: '#7A7A9A', marginTop: 3 }}>
                      {song.channelTitle}
                    </div>
                  </div>
                  {isSelected && <span style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>✓</span>}
                </button>
              )
            })}
          </div>

          {selected && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ausgewählt</div>
              <div style={{
                background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.3)',
                borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 14,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{parseTitle(selected.title, selected.channelTitle)}</div>
                <div style={{ fontSize: 12, color: '#7A7A9A', marginTop: 3 }}>{selected.channelTitle}</div>
              </div>
              <button onClick={() => onSelect(selected)} className="btn btn-primary btn-full">
                Song einreichen
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
