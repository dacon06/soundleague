import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import Chat from '../components/Chat'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  orderBy, addDoc, updateDoc, serverTimestamp, getDocs, arrayRemove
} from 'firebase/firestore'

function Avatar({ name, size = '' }) {
  return <div className={`avatar ${size}`}>{(name || '?')[0].toUpperCase()}</div>
}

function StatusBadge({ status }) {
  const map = {
    submission: { label: '● Einreichung', cls: 'badge-green' },
    voting:     { label: '● Abstimmung', cls: 'badge-amber' },
    results:    { label: 'Ergebnisse', cls: 'badge-dim' },
  }
  const info = map[status] || { label: status, cls: 'badge-dim' }
  return <span className={`badge ${info.cls}`}>{info.label}</span>
}

// ─── Queue Import Modal ───
function QueueModal({ group, onClose }) {
  const [text, setText] = useState(group.categoryQueue?.join('\n') || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    const categories = text
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
    await updateDoc(doc(db, 'groups', group.id), { categoryQueue: categories })
    setSaving(false)
    onClose()
  }

  const presets = [
    'Guilty Pleasure', 'Beste 90er', 'Instrumental', 'Erste Liebe',
    'Schlechter Tag', 'Schlafenzeit', 'Road Trip', 'Workout',
    'Partyknaller', 'Unbekannter Schatz', 'Film-Soundtrack',
    'Kindheitserinnerung', 'Breakup Song', 'Sommer-Hit',
    'Wintermelancholie', 'Tanzen um 3 Uhr nachts', 'Eigentlich peinlich',
    'Für die Ewigkeit', 'Akustisch und ruhig', 'Nur die Basslinie zählt',
  ]

  const addPreset = (p) => setText(prev => prev ? prev + '\n' + p : p)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 22 }}>Kategorie-Warteschlange</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.6 }}>
            Eine Kategorie pro Zeile. Runden starten automatisch durch — jeweils 5 Tage Einreichung, 2 Tage Abstimmung.
          </p>

          <div className="form-group">
            <label>Kategorien (eine pro Zeile)</label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              rows={10}
              placeholder={'Guilty Pleasure\nBeste 90er\nInstrumental\n...'}
              style={{ fontFamily: 'Space Mono', fontSize: 13 }}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {text.split('\n').filter(Boolean).length} Kategorien · ~
              {Math.round(text.split('\n').filter(Boolean).length * 7)} Tage Gesamtdauer
            </p>
          </div>

          <div className="section-title" style={{ marginBottom: 8 }}>Vorschläge</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
            {presets.map(p => (
              <button
                key={p}
                onClick={() => addPreset(p)}
                className="btn btn-ghost btn-sm"
                style={{ borderRadius: 100, fontSize: 11, padding: '3px 10px' }}
              >
                + {p}
              </button>
            ))}
          </div>

          <button
            onClick={handleSave}
            className="btn btn-primary btn-full"
            disabled={saving}
          >
            {saving ? '…' : 'Warteschlange speichern'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Create Round Modal (manual) ───
function CreateRoundModal({ group, onClose, onCreate }) {
  const { user } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const DEFAULT_SUB_HOURS = 120 // 5 days
  const DEFAULT_VOTE_HOURS = 48  // 2 days

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!prompt.trim()) return
    setLoading(true)
    setError('')
    try {
      const now = Date.now()
      const roundRef = await addDoc(collection(db, 'rounds'), {
        groupId: group.id,
        prompt: prompt.trim(),
        status: 'submission',
        submissionDeadline: new Date(now + DEFAULT_SUB_HOURS * 3600_000),
        votingDeadline: new Date(now + (DEFAULT_SUB_HOURS + DEFAULT_VOTE_HOURS) * 3600_000),
        playlistId: null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        submissionNotificationSent: false,
        votingNotificationSent: false,
      })
      await updateDoc(doc(db, 'groups', group.id), { currentRoundId: roundRef.id })
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
          <h3 style={{ fontSize: 22 }}>Runde manuell starten</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <div className="form-group">
            <label>Kategorie</label>
            <input
              autoFocus
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="z.B. Guilty Pleasure"
              required
            />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>
            ⏱ 5 Tage Einreichung · 2 Tage Abstimmung
          </p>
          <button
            onClick={handleCreate}
            className="btn btn-primary btn-full btn-lg"
            disabled={loading || !prompt.trim()}
          >
            {loading ? '…' : 'Runde starten'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Invite Modal ───
function InviteModal({ code, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }
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
            Teile diesen Code mit Freunden.
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

// ─── Notification Banner ───
function NotificationBanner() {
  const { supported, permission, subscribe } = usePushNotifications()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('notif_dismissed') === '1'
  )
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!supported || permission === 'granted' || permission === 'denied' || dismissed) return null

  const handleEnable = async () => {
    setLoading(true)
    const ok = await subscribe()
    setLoading(false)
    if (ok) setSuccess(true)
  }

  const handleDismiss = () => {
    localStorage.setItem('notif_dismissed', '1')
    setDismissed(true)
  }

  if (success) return (
    <div style={{
      background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.2)',
      borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16,
      display: 'flex', alignItems: 'center', gap: 10, fontSize: 13,
    }}>
      <span>✓</span> Benachrichtigungen aktiviert!
    </div>
  )

  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>🔔 Benachrichtigungen</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
            Wir erinnern dich 24h vor Ende der Einreichung & Abstimmung.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={handleDismiss} className="btn btn-ghost btn-sm">Nein</button>
          <button onClick={handleEnable} className="btn btn-primary btn-sm" disabled={loading}>
            {loading ? '…' : 'Aktivieren'}
          </button>
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
  const [tab, setTab] = useState('runden')
  const [modal, setModal] = useState(null) // 'createRound' | 'invite' | 'queue'
  const [leaderboard, setLeaderboard] = useState([])

  // Load group
  useEffect(() => {
    return onSnapshot(doc(db, 'groups', groupId), snap => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
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

  // Auto-advance round status + auto-start next from queue
  useEffect(() => {
    if (!rounds.length || !group) return
    const checkAndAdvance = async () => {
      const now = new Date()
      for (const round of rounds) {
        if (round.status === 'submission' && round.submissionDeadline?.toDate?.() < now) {
          await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
        } else if (round.status === 'voting' && round.votingDeadline?.toDate?.() < now) {
          await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
          // Auto-start next round from queue
          await autoStartNextRound(round)
        }
      }
    }
    checkAndAdvance()
  }, [rounds, group])

  const autoStartNextRound = async (finishedRound) => {
    const groupDoc = await getDoc(doc(db, 'groups', groupId))
    const gData = groupDoc.data()
    const queue = gData?.categoryQueue || []
    if (queue.length === 0) return

    const nextCategory = queue[0]
    const remaining = queue.slice(1)

    const now = Date.now()
    const SUB_HOURS = 120
    const VOTE_HOURS = 48

    const roundRef = await addDoc(collection(db, 'rounds'), {
      groupId,
      prompt: nextCategory,
      status: 'submission',
      submissionDeadline: new Date(now + SUB_HOURS * 3600_000),
      votingDeadline: new Date(now + (SUB_HOURS + VOTE_HOURS) * 3600_000),
      playlistId: null,
      createdBy: finishedRound.createdBy,
      createdAt: serverTimestamp(),
      submissionNotificationSent: false,
      votingNotificationSent: false,
      fromQueue: true,
    })

    await updateDoc(doc(db, 'groups', groupId), {
      currentRoundId: roundRef.id,
      categoryQueue: remaining,
    })
  }

  // Build leaderboard
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
      setLeaderboard(
        Object.entries(points)
          .map(([uid, pts]) => ({ uid, name: group.memberNames?.[uid] || 'Anonym', points: pts }))
          .sort((a, b) => b.points - a.points)
      )
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
    return `Noch ${Math.floor(h / 24)}d ${h % 24}h`
  }

  const handleForceAdvance = async (round) => {
    if (!isAdmin) return
    if (round.status === 'submission') {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
    } else if (round.status === 'voting') {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
      await autoStartNextRound(round)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!group) return <div className="page"><p>Gruppe nicht gefunden.</p></div>

  const queueLength = group.categoryQueue?.length || 0

  return (
    <div className="page">
      {/* Back */}
      <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>
        ← Zurück
      </button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>{group.name}</h1>
          {group.description && <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{group.description}</p>}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>
            {group.members.length} Mitglieder · {group.votesPerMember} Stimmen/Runde
          </p>
        </div>
        <button onClick={() => setModal('invite')} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Einladen
        </button>
      </div>

      {/* Notification banner */}
      <NotificationBanner />

      {/* Tabs */}
      <div className="tabs">
        {['runden', 'warteschlange', 'bestenliste', 'chat'].map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'runden' ? '🎵 Runden'
              : t === 'warteschlange' ? `⏭ Queue ${queueLength > 0 ? `(${queueLength})` : ''}`
              : t === 'bestenliste' ? '🏆 Punkte'
              : '💬 Chat'}
          </button>
        ))}
      </div>

      {/* ── Rounds Tab ── */}
      {tab === 'runden' && (
        <div>
          {isAdmin && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              <button onClick={() => setModal('createRound')} className="btn btn-primary">
                + Manuelle Runde
              </button>
              <button onClick={() => setModal('queue')} className="btn btn-secondary">
                ⏭ Warteschlange
              </button>
            </div>
          )}

          {/* Queue info bar */}
          {queueLength > 0 && (
            <div style={{
              background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.2)',
              borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16,
              fontSize: 13, color: 'var(--accent)',
            }}>
              ⏭ {queueLength} Kategorie{queueLength !== 1 ? 'n' : ''} in der Warteschlange — nächste startet automatisch
            </div>
          )}

          {rounds.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🎶</div>
              <h3>Noch keine Runden</h3>
              <p>{isAdmin ? 'Starte eine Runde oder füge Kategorien zur Warteschlange hinzu.' : 'Der Admin startet bald die erste Runde.'}</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rounds.map((round, i) => (
              <div key={round.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/group/${groupId}/round/${round.id}`)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>RUNDE {rounds.length - i}</span>
                      <StatusBadge status={round.status} />
                      {round.fromQueue && <span className="badge badge-dim">Queue</span>}
                    </div>
                    <h3 style={{ fontSize: 20, marginBottom: 8 }}>{round.prompt}</h3>
                    {round.status === 'submission' && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Einreichung: {formatDeadline(round.submissionDeadline)}</p>}
                    {round.status === 'voting' && <p style={{ fontSize: 12, color: 'var(--accent2)' }}>Abstimmung: {formatDeadline(round.votingDeadline)}</p>}
                    {round.status === 'results' && round.playlistId && (
                      <a href={`https://open.spotify.com/playlist/${round.playlistId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="badge badge-green">🎵 Playlist öffnen</a>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
                    {isAdmin && round.status !== 'results' && (
                      <button onClick={e => { e.stopPropagation(); handleForceAdvance(round) }} className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '4px 8px' }}>⏭ Skip</button>
                    )}
                  </div>
                </div>

                {round.status !== 'results' && (
                  <div style={{ marginTop: 12 }}>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: round.status === 'submission' ? '33%' : '66%', background: round.status === 'voting' ? 'var(--accent2)' : 'var(--accent)' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                      <span style={{ color: round.status === 'submission' ? 'var(--accent)' : undefined }}>Einreichung</span>
                      <span style={{ color: round.status === 'voting' ? 'var(--accent2)' : undefined }}>Abstimmung</span>
                      <span>Ergebnisse</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Queue Tab ── */}
      {tab === 'warteschlange' && (
        <div>
          {isAdmin && (
            <button onClick={() => setModal('queue')} className="btn btn-primary btn-full" style={{ marginBottom: 20 }}>
              Warteschlange bearbeiten
            </button>
          )}

          {queueLength === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏭</div>
              <h3>Warteschlange leer</h3>
              <p>{isAdmin ? 'Füge Kategorien hinzu — Runden starten dann automatisch durch.' : 'Keine Kategorien in der Warteschlange.'}</p>
            </div>
          ) : (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18 }}>Nächste Runden</h3>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>~{queueLength * 7} Tage gesamt</span>
              </div>
              {group.categoryQueue.map((cat, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < queueLength - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily: 'Fraunces', fontSize: 20, color: 'var(--text-muted)', width: 28, textAlign: 'center' }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 14 }}>{cat}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>5d + 2d</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Leaderboard Tab ── */}
      {tab === 'bestenliste' && (
        <div className="card">
          <h3 style={{ fontSize: 20, marginBottom: 16 }}>Bestenliste</h3>
          {leaderboard.length === 0 ? (
            <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Noch keine abgeschlossenen Runden.</p>
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
                  {entry.points}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Space Mono', marginLeft: 4 }}>pts</span>
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
        <CreateRoundModal group={group} onClose={() => setModal(null)} onCreate={(id) => { setModal(null); navigate(`/group/${groupId}/round/${id}`) }} />
      )}
      {modal === 'queue' && (
        <QueueModal group={group} onClose={() => setModal(null)} />
      )}
      {modal === 'invite' && (
        <InviteModal code={group.inviteCode} onClose={() => setModal(null)} />
      )}
    </div>
  )
}
