import { useState, useCallback, useEffect, useRef } from 'react'
import { searchSongs, extractVideoId, getVideoById } from '../youtube'
import YouTubePlayer from './YouTubePlayer'
import { db } from '../firebase'
import { collection, query as fsQuery, where, getDocs, doc, getDoc } from 'firebase/firestore'

function debounce(fn, delay) {
  let timer
  const debounced = (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay) }
  debounced.cancel = () => clearTimeout(timer)
  return debounced
}

function parseTitle(title) {
  return title
    .replace(/\(official (video|audio|music video|lyric video|visualizer)\)/gi, '')
    .replace(/\[official (video|audio|music video|lyric video|visualizer)\]/gi, '')
    .replace(/official (video|audio|music video|lyric video|visualizer)/gi, '')
    .replace(/\(lyrics?\)/gi, '').replace(/\[lyrics?\]/gi, '')
    .replace(/\(hd\)/gi, '').replace(/\(4k\)/gi, '')
    .replace(/\bvevo\b/gi, '').replace(/\s+/g, ' ').trim()
}

export default function SongSearch({ onSelect, onClose, groupId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [preview, setPreview] = useState(null) // videoId, das gerade vorgehört wird
  const [usedSongs, setUsedSongs] = useState({})

  useEffect(() => {
    if (!groupId) return
    const loadUsed = async () => {
      const subsSnap = await getDocs(fsQuery(collection(db, 'submissions'), where('groupId', '==', groupId)))
      const roundIds = [...new Set(subsSnap.docs.map(d => d.data().roundId))]
      if (!roundIds.length) return
      const roundPrompts = {}
      await Promise.all(roundIds.map(async (roundId) => {
        const roundDoc = await getDoc(doc(db, 'rounds', roundId))
        if (roundDoc.exists()) roundPrompts[roundId] = roundDoc.data().prompt
      }))
      const used = {}
      subsSnap.docs.forEach(d => {
        const { videoId, roundId } = d.data()
        if (videoId && roundPrompts[roundId]) used[videoId] = roundPrompts[roundId]
      })
      setUsedSongs(used)
    }
    loadUsed()
  }, [groupId])

  // Verhindert, dass eine ältere, langsamere Anfrage neuere Ergebnisse überschreibt
  const requestId = useRef(0)

  const doSearch = useCallback(
    debounce(async (q) => {
      const id = ++requestId.current
      if (!q || q.trim().length < 3) { setResults([]); return }
      setLoading(true); setError(''); setPreview(null)
      try {
        const songs = await searchSongs(q)
        if (id === requestId.current) setResults(songs)
      } catch (e) { if (id === requestId.current) setError(e.message) }
      finally { if (id === requestId.current) setLoading(false) }
    }, 500), []
  )

  // Kompletter YouTube-Link → Video direkt laden und auswählen (wie bei w2g)
  const loadLink = async (videoId) => {
    const id = ++requestId.current
    setLoading(true); setError(''); setResults([]); setPreview(null)
    try {
      const song = await getVideoById(videoId)
      if (id === requestId.current) { setResults([song]); setSelected(song) }
    } catch (e) { if (id === requestId.current) setError(e.message) }
    finally { if (id === requestId.current) setLoading(false) }
  }

  const handleQuery = (e) => {
    const value = e.target.value
    setQuery(value)
    const videoId = extractVideoId(value)
    if (videoId) { doSearch.cancel(); loadLink(videoId) }
    else doSearch(value)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 20, color: '#F5F4FF' }}>Song auswählen</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <input autoFocus value={query} onChange={handleQuery} placeholder="Song, Künstler oder YouTube-Link…" style={{ marginBottom: 16 }} />
          {error && <div className="error-msg">{error}</div>}
          {loading && <div className="loading-center" style={{ minHeight: 80 }}><div className="spinner" /></div>}
          {!loading && !error && results.length === 0 && query.length >= 3 && (
            <p style={{ color: 'var(--text-dim)', fontSize: 13, textAlign: 'center', padding: 24 }}>Keine Ergebnisse für „{query}"</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 380, overflowY: 'auto' }}>
            {results.map(song => {
              const isSelected = selected?.id === song.id
              const isPreview = preview === song.id
              const wasUsed = usedSongs[song.id]
              return (
                <div key={song.id} style={{
                  background: isSelected ? 'var(--accent-dim)' : wasUsed ? 'rgba(245,166,35,0.07)' : 'var(--surface3)',
                  border: isSelected ? '2px solid var(--accent)' : wasUsed ? '1px solid rgba(245,166,35,0.3)' : '1px solid var(--border2)',
                  borderRadius: 'var(--radius)', padding: '10px 14px', transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Vorhören – unabhängig vom Auswählen */}
                    <button
                      onClick={() => setPreview(isPreview ? null : song.id)}
                      title={isPreview ? 'Vorhören beenden' : 'Vorhören'}
                      style={{
                        width: 30, height: 30, borderRadius: '50%', flexShrink: 0, padding: 0,
                        background: isPreview ? '#FF0000' : 'var(--surface2)',
                        border: '1px solid var(--border2)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {isPreview ? (
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="#fff"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                      ) : (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="#F5F4FF" style={{ marginLeft: 2 }}><polygon points="5,3 19,12 5,21" /></svg>
                      )}
                    </button>

                    <button onClick={() => setSelected(isSelected ? null : song)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                      textAlign: 'left', flex: 1, minWidth: 0,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {parseTitle(song.title)}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, color: '#7A7A9A' }}>{song.channelTitle}</span>
                          {wasUsed && (
                            <span style={{ fontSize: 10, background: 'rgba(245,166,35,0.15)', color: 'var(--accent2)', border: '1px solid rgba(245,166,35,0.3)', borderRadius: 100, padding: '1px 7px', fontWeight: 600 }}>
                              ↩ {wasUsed}
                            </span>
                          )}
                        </div>
                      </div>
                      {isSelected && <span style={{ color: 'var(--accent)', fontSize: 18, flexShrink: 0 }}>✓</span>}
                    </button>
                  </div>

                  {isPreview && <YouTubePlayer videoId={song.id} compact autoPlay />}
                </div>
              )
            })}
          </div>

          {selected && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Ausgewählt</div>
              <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(124,106,245,0.3)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F4FF' }}>{parseTitle(selected.title)}</div>
                <div style={{ fontSize: 12, color: '#7A7A9A', marginTop: 2 }}>{selected.channelTitle}</div>
                {preview !== selected.id && <YouTubePlayer videoId={selected.id} compact />}
              </div>
              <button onClick={() => onSelect(selected)} className="btn btn-primary btn-full">Song einreichen</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
