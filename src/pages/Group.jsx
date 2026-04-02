import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import Chat from '../components/Chat'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  orderBy, addDoc, updateDoc, serverTimestamp, getDocs
} from 'firebase/firestore'

function Avatar({ name, size = '' }) {
  return <div className={`avatar ${size}`}>{(name || '?')[0].toUpperCase()}</div>
}

function StatusBadge({ status }) {
  const map = {
    submission: { label: '● Einreichung läuft', cls: 'badge-green' },
    voting: { label: '● Abstimmung läuft', cls: 'badge-amber' },
    results: { label: 'Ergebnisse', cls: 'badge-dim' },
  }
  const info = map[status] || { label: status, cls: 'badge-dim' }
  return <span className={`badge ${info.cls}`}>{info.label}</span>
}

// ─── Create Round Modal ───
function CreateRoundModal({ group, onClose, onCreate }) {
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [submissionHours, setSubmissionHours] = useState(72)
  const [votingHours, setVotingHours] = useState(48)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const presets = ['Guilty Pleasure', 'Beste 90er', 'Instrumental', 'Erste Liebe', 'Schlechter Tag', 'Schlafenzeit', 'Road Trip', 'Workout', 'Partyknaller', 'Unbekannter Schatz']

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const now = Date.now()
      const submissionDeadline = new Date(now + submissionHours * 3600_000)
      const votingDeadline = new Date(now + (submissionHours + votingHours) * 3600_000)

      const roundRef = await addDoc(collection(db, 'rounds'), {
        groupId: group.id,
        prompt: prompt.trim(),
        status: 'submission',
        submissionDeadline,
        votingDeadline,
        playlistId: null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      })

      await updateDoc(doc(db, 'groups', group.id), {
        currentRoundId: roundRef.id,
      })

      onCreate(roundRef.id)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 22 }}>Neue Runde</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Kategorie / Prompt</label>
              <input
                autoFocus
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="z.B. Guilty Pleasure"
                required
              />
            </div>

            {/* Preset chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {presets.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="btn btn-ghost btn-sm"
                  style={{ borderRadius: 100, fontSize: 12, padding: '4px 12px' }}
                >
                  {p}
                </button>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Einreichung (Stunden)</label>
                <select value={submissionHours} onChange={e => setSubmissionHours(Number(e.target.value))}>
                  {[24, 48, 72, 96, 120, 168].map(h => (
                    <option key={h} value={h}>{h}h ({Math.round(h/24)}d)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Abstimmung (Stunden)</label>
                <select value={votingHours} onChange={e => setVotingHours(Number(e.target.value))}>
                  {[24, 48, 72, 96, 120].map(h => (
                    <option key={h} value={h}>{h}h ({Math.round(h/24)}d)</option>
                  ))}
                </select>
              </div>
            </div>

            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || !prompt.trim()}>
              {loading ? '…' : 'Runde starten'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Invite Code Modal ───
function InviteModal({ code, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 22 }}>Einladen</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>
            Teile diesen Code mit Freunden, damit sie der Gruppe beitreten können.
          </p>
          <div className="invite-code" onClick={copy}>{code}</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
            {copied ? '✓ Kopiert!' : 'Tippen zum Kopieren'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Main Group Page ───
export default function GroupPage() {
  const { groupId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [group, setGroup] = useState(null)
  const [rounds, setRounds] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('runden') // 'runden' | 'bestenliste' | 'chat'
  const [modal, setModal] = useState(null) // 'createRound' | 'invite'
  const [leaderboard, setLeaderboard] = useState([])
  const [updatingRound, setUpdatingRound] = useState(false)

  // Load group
  useEffect(() => {
    return onSnapshot(doc(db, 'groups', groupId), snap => {
      if (snap.exists()) {
        setGroup({ id: snap.id, ...snap.data() })
      }
      setLoading(false)
    })
  }, [groupId])

  // Load rounds
  useEffect(() => {
    const q = query(
      collection(db, 'rounds'),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc')
    )
    return onSnapshot(q, snap => {
      setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [groupId])

  // Auto-advance round status based on deadlines
  useEffect(() => {
    if (!rounds.length || updatingRound) return
    const checkAndAdvance = async () => {
      for (const round of rounds) {
        const now = new Date()
        if (round.status === 'submission' && round.submissionDeadline?.toDate?.() < now) {
          setUpdatingRound(true)
          await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
          setUpdatingRound(false)
        } else if (round.status === 'voting' && round.votingDeadline?.toDate?.() < now) {
          setUpdatingRound(true)
          await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
          setUpdatingRound(false)
        }
      }
    }
    checkAndAdvance()
  }, [rounds])

  // Build leaderboard from all rounds
  useEffect(() => {
    if (!group || !rounds.length) return
    const buildLeaderboard = async () => {
      const points = {}
      for (const round of rounds.filter(r => r.status === 'results')) {
        const votesSnap = await getDocs(
          query(collection(db, 'votes'), where('roundId', '==', round.id))
        )
        votesSnap.docs.forEach(vd => {
          const vote = vd.data()
          if (!points[vote.submitterUserId]) points[vote.submitterUserId] = 0
          points[vote.submitterUserId] += vote.points
        })
      }
      const board = Object.entries(points)
        .map(([uid, pts]) => ({
          uid,
          name: group.memberNames?.[uid] || 'Anonym',
          points: pts,
        }))
        .sort((a, b) => b.points - a.points)
      setLeaderboard(board)
    }
    buildLeaderboard()
  }, [group, rounds])

  const isAdmin = group?.createdBy === user?.uid

  const formatDeadline = (ts) => {
    if (!ts?.toDate) return ''
    const d = ts.toDate()
    const diff = d - new Date()
    if (diff < 0) return 'Abgelaufen'
    const h = Math.floor(diff / 3600_000)
    if (h < 24) return `Noch ${h}h`
    const days = Math.floor(h / 24)
    return `Noch ${days}d ${h % 24}h`
  }

  const handleForceAdvance = async (round) => {
    if (!isAdmin) return
    if (round.status === 'submission') {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
    } else if (round.status === 'voting') {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!group) return <div className="page"><p>Gruppe nicht gefunden.</p></div>

  return (
    <div className="page">
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <button
          onClick={() => navigate('/')}
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: 12, padding: '6px 10px' }}
        >
          ← Zurück
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: 26 }}>{group.name}</h1>
            {group.description && (
              <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{group.description}</p>
            )}
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
              {group.members.length} Mitglieder · {group.votesPerMember} Stimmen/Runde
            </p>
          </div>
          <button
            onClick={() => setModal('invite')}
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
              <polyline points="16,6 12,2 8,6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Einladen
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['runden', 'bestenliste', 'chat'].map(t => (
          <button
            key={t}
            className={`tab-btn ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'runden' ? '🎵 Runden' : t === 'bestenliste' ? '🏆 Bestenliste' : '💬 Chat'}
          </button>
        ))}
      </div>

      {/* ── Rounds Tab ── */}
      {tab === 'runden' && (
        <div>
          {isAdmin && (
            <button
              onClick={() => setModal('createRound')}
              className="btn btn-primary btn-full"
              style={{ marginBottom: 20 }}
            >
              + Neue Runde starten
            </button>
          )}

          {rounds.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🎶</div>
              <h3>Noch keine Runden</h3>
              <p>{isAdmin ? 'Starte die erste Runde!' : 'Der Admin startet bald die erste Runde.'}</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rounds.map((round, i) => (
              <div
                key={round.id}
                className="card"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/group/${groupId}/round/${round.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'Space Mono' }}>
                        RUNDE {rounds.length - i}
                      </span>
                      <StatusBadge status={round.status} />
                    </div>
                    <h3 style={{ fontSize: 20, marginBottom: 8 }}>{round.prompt}</h3>

                    {round.status === 'submission' && (
                      <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                        Einreichung: {formatDeadline(round.submissionDeadline)}
                      </p>
                    )}
                    {round.status === 'voting' && (
                      <p style={{ fontSize: 12, color: 'var(--accent2)' }}>
                        Abstimmung: {formatDeadline(round.votingDeadline)}
                      </p>
                    )}
                    {round.status === 'results' && round.playlistId && (
                      <a
                        href={`https://open.spotify.com/playlist/${round.playlistId}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="badge badge-green"
                        style={{ marginTop: 4 }}
                      >
                        🎵 Playlist öffnen
                      </a>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="9,18 15,12 9,6"/>
                    </svg>
                    {isAdmin && round.status !== 'results' && (
                      <button
                        onClick={e => { e.stopPropagation(); handleForceAdvance(round) }}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, padding: '4px 8px' }}
                        title="Phase manuell weiterschalten"
                      >
                        ⏭ Skip
                      </button>
                    )}
                  </div>
                </div>

                {round.status !== 'results' && (
                  <div style={{ marginTop: 12 }}>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: round.status === 'submission' ? '33%' : '66%',
                          background: round.status === 'voting' ? 'var(--accent2)' : 'var(--accent)',
                        }}
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span style={{ color: round.status === 'submission' ? 'var(--accent)' : 'var(--text-muted)' }}>Einreichung</span>
                      <span style={{ color: round.status === 'voting' ? 'var(--accent2)' : 'var(--text-muted)' }}>Abstimmung</span>
                      <span>Ergebnisse</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Leaderboard Tab ── */}
      {tab === 'bestenliste' && (
        <div className="card">
          <h3 style={{ fontSize: 20, marginBottom: 16 }}>Bestenliste</h3>
          {leaderboard.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>
              Noch keine abgeschlossenen Runden.
            </p>
          ) : (
            leaderboard.map((entry, i) => (
              <div key={entry.uid} className="leaderboard-row">
                <div className={`leaderboard-rank ${i < 3 ? 'top' : ''}`}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                </div>
                <Avatar name={entry.name} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: entry.uid === user.uid ? 700 : 400 }}>
                    {entry.name} {entry.uid === user.uid && '(Du)'}
                  </div>
                </div>
                <div style={{ fontSize: 20, fontFamily: 'Fraunces', fontWeight: 600, color: 'var(--accent)' }}>
                  {entry.points}
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Space Mono', marginLeft: 4 }}>pts</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Chat Tab ── */}
      {tab === 'chat' && (
        <div className="card">
          <h3 style={{ fontSize: 20, marginBottom: 16 }}>Gruppen-Chat</h3>
          <Chat groupId={groupId} />
        </div>
      )}

      {/* Modals */}
      {modal === 'createRound' && (
        <CreateRoundModal
          group={group}
          onClose={() => setModal(null)}
          onCreate={(id) => { setModal(null); navigate(`/group/${groupId}/round/${id}`) }}
        />
      )}
      {modal === 'invite' && (
        <InviteModal code={group.inviteCode} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
