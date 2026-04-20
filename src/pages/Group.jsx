import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import UserAvatar from '../components/UserAvatar'
import Chat from '../components/Chat'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  orderBy, addDoc, updateDoc, serverTimestamp, getDocs,
  arrayRemove, deleteField,
} from 'firebase/firestore'

function StatusBadge({ status }) {
  const map = {
    submission: { label: '● Einreichung', cls: 'badge-green' },
    voting:     { label: '● Abstimmung',  cls: 'badge-amber' },
    results:    { label: 'Ergebnisse',    cls: 'badge-dim'   },
  }
  const info = map[status] || { label: status, cls: 'badge-dim' }
  return <span className={`badge ${info.cls}`}>{info.label}</span>
}

function toItem(raw) {
  if (typeof raw === 'string') return { name: raw, description: '' }
  return { name: raw.name || '', description: raw.description || '' }
}

// ─── Queue Modal ───
function QueueModal({ group, onClose, onStarted }) {
  const { user } = useAuth()
  const fileRef = useRef()
  const [items, setItems] = useState(() => (group.categoryQueue || []).map(toItem))
  const [saving, setSaving] = useState(false)
  const [importError, setImportError] = useState('')
  const [importCount, setImportCount] = useState(null)

  const handleFileImport = (e) => {
    setImportError('')
    setImportCount(null)
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result.trim()
      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text)
          if (!Array.isArray(parsed)) throw new Error('JSON muss ein Array sein')
          const newItems = parsed.map(item =>
            typeof item === 'string'
              ? { name: item, description: '' }
              : { name: item.name || item.kategorie || '', description: item.description || item.beschreibung || '' }
          ).filter(i => i.name)
          setItems(newItems)
          setImportCount(newItems.length)
          return
        }
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        const newItems = lines.map(line => {
          const sep = line.includes(';') ? ';' : ','
          const parts = line.split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
          return { name: parts[0] || '', description: parts[1] || '' }
        }).filter(i => i.name)
        setItems(newItems)
        setImportCount(newItems.length)
      } catch (err) {
        setImportError('Fehler: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    setSaving(true)
    const clean = items.filter(i => i.name.trim())
    const groupSnap = await getDoc(doc(db, 'groups', group.id))
    const currentRoundId = groupSnap.data()?.currentRoundId
    let shouldAutoStart = false
    if (clean.length > 0) {
      if (!currentRoundId) {
        shouldAutoStart = true
      } else {
        const roundSnap = await getDoc(doc(db, 'rounds', currentRoundId))
        if (!roundSnap.exists() || roundSnap.data()?.status === 'results') shouldAutoStart = true
      }
    }
    if (shouldAutoStart) {
      const first = clean[0]
      const now = Date.now()
      const roundRef = await addDoc(collection(db, 'rounds'), {
        groupId: group.id,
        prompt: first.name,
        description: first.description || '',
        status: 'submission',
        submissionDeadline: new Date(now + 120 * 3600_000),
        votingDeadline:     new Date(now + 168 * 3600_000),
        playlistId: null,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        submissionNotificationSent: false,
        votingNotificationSent: false,
        fromQueue: true,
      })
      await updateDoc(doc(db, 'groups', group.id), {
        currentRoundId: roundRef.id,
        categoryQueue: clean.slice(1),
      })
      setSaving(false)
      onStarted(roundRef.id)
      return
    }
    await updateDoc(doc(db, 'groups', group.id), { categoryQueue: clean })
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '95dvh' }}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 22 }}>Warteschlange importieren</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.8 }}>
            <strong style={{ color: 'var(--text)' }}>CSV Format</strong>:<br />
            <code style={{ color: 'var(--accent)' }}>Guilty Pleasure,Ein Song den du heimlich liebst</code><br />
            <strong style={{ color: 'var(--text)' }}>JSON Format</strong>:<br />
            <code style={{ color: 'var(--accent)' }}>{`[{"name":"...","description":"..."}]`}</code>
          </div>

          <button onClick={() => fileRef.current.click()} className="btn btn-primary btn-full btn-lg" style={{ marginBottom: 12 }}>
            📁 CSV oder JSON importieren
          </button>
          <input ref={fileRef} type="file" accept=".csv,.json" onChange={handleFileImport} style={{ display: 'none' }} />

          {importError && <div className="error-msg">{importError}</div>}
          {importCount !== null && (
            <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 12, fontSize: 13, color: 'var(--accent)' }}>
              ✓ {importCount} Kategorien importiert
            </div>
          )}

          {items.length > 0 && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>Vorschau</div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{items.length} · ~{items.length * 7} Tage</span>
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface2)', borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)' }}>
                    <span style={{ fontFamily: 'Fraunces', fontSize: 16, color: 'var(--text-muted)', width: 24, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>{item.description}</div>}
                    </div>
                    <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14, padding: 4, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={handleSave} className="btn btn-primary btn-full btn-lg" disabled={saving || items.length === 0}>
                {saving ? '…' : !group.currentRoundId ? '🚀 Speichern & erste Runde starten' : 'Warteschlange speichern'}
              </button>
            </>
          )}
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
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20 }}>Teile diesen Code mit Freunden.</p>
          <div className="invite-code" onClick={copy}>{code}</div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>{copied ? '✓ Kopiert!' : 'Tippen zum Kopieren'}</p>
        </div>
      </div>
    </div>
  )
}

// ─── Notification Banner ───
function NotificationBanner() {
  const { supported, permission, subscribe } = usePushNotifications()
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('notif_dismissed') === '1')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  if (!supported || permission === 'granted' || permission === 'denied' || dismissed) return null

  const handleEnable = async () => {
    setLoading(true)
    const ok = await subscribe()
    setLoading(false)
    if (ok) setSuccess(true)
  }

  if (success) return (
    <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--accent)' }}>
      ✓ Benachrichtigungen aktiviert!
    </div>
  )

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>🔔 Benachrichtigungen</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Erinnerung 24h vor Ende der Einreichung & Abstimmung.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => { localStorage.setItem('notif_dismissed', '1'); setDismissed(true) }} className="btn btn-ghost btn-sm">Nein</button>
          <button onClick={handleEnable} className="btn btn-primary btn-sm" disabled={loading}>{loading ? '…' : 'Ja'}</button>
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
  const [modal, setModal] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])

  useEffect(() => {
    return onSnapshot(doc(db, 'groups', groupId), snap => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
  }, [groupId])

  useEffect(() => {
    const q = query(collection(db, 'rounds'), where('groupId', '==', groupId), orderBy('createdAt', 'desc'))
    return onSnapshot(q, snap => setRounds(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
  }, [groupId])

  // Auto-advance + auto-start next
  useEffect(() => {
    if (!rounds.length || !group) return
    const check = async () => {
      const now = new Date()
      for (const round of rounds) {
        if (round.status === 'submission' && round.submissionDeadline?.toDate?.() < now)
          await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
        else if (round.status === 'voting' && round.votingDeadline?.toDate?.() < now) {
          await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
          await autoStartNext(round)
        }
      }
    }
    check()
  }, [rounds, group])

  const autoStartNext = async (finishedRound) => {
    const groupSnap = await getDoc(doc(db, 'groups', groupId))
    const queue = (groupSnap.data()?.categoryQueue || []).map(toItem)
    if (!queue.length) return
    const next = queue[0]
    const now = Date.now()
    const roundRef = await addDoc(collection(db, 'rounds'), {
      groupId,
      prompt: next.name,
      description: next.description || '',
      status: 'submission',
      submissionDeadline: new Date(now + 120 * 3600_000),
      votingDeadline:     new Date(now + 168 * 3600_000),
      playlistId: null,
      createdBy: finishedRound.createdBy,
      createdAt: serverTimestamp(),
      submissionNotificationSent: false,
      votingNotificationSent: false,
      fromQueue: true,
    })
    await updateDoc(doc(db, 'groups', groupId), {
      currentRoundId: roundRef.id,
      categoryQueue: queue.slice(1),
    })
  }

  // Leaderboard
  useEffect(() => {
    if (!group || !rounds.length) return
    const build = async () => {
      const points = {}
      for (const round of rounds.filter(r => r.status === 'results')) {
        const snap = await getDocs(query(collection(db, 'votes'), where('roundId', '==', round.id)))
        snap.docs.forEach(d => {
          const v = d.data()
          points[v.submitterUserId] = (points[v.submitterUserId] || 0) + v.points
        })
      }
      setLeaderboard(
        Object.entries(points)
          .map(([uid, pts]) => ({ uid, name: group.memberNames?.[uid] || 'Anonym', points: pts }))
          .sort((a, b) => b.points - a.points)
      )
    }
    build()
  }, [group, rounds])

  const isAdmin = group?.createdBy === user?.uid
  const queueLength = (group?.categoryQueue || []).length

  const formatDeadline = (ts) => {
    if (!ts?.toDate) return ''
    const diff = ts.toDate() - new Date()
    if (diff < 0) return 'Abgelaufen'
    const h = Math.floor(diff / 3600_000)
    return h < 24 ? `Noch ${h}h` : `Noch ${Math.floor(h / 24)}d ${h % 24}h`
  }

  const handleSkip = async (round) => {
    if (!isAdmin) return
    if (round.status === 'submission') await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
    else if (round.status === 'voting') { await updateDoc(doc(db, 'rounds', round.id), { status: 'results' }); await autoStartNext(round) }
  }

  const handleLeave = async () => {
    if (!window.confirm('Gruppe wirklich verlassen?')) return
    await updateDoc(doc(db, 'groups', groupId), {
      members: arrayRemove(user.uid),
      [`memberNames.${user.uid}`]: deleteField(),
    })
    navigate('/')
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!group) return <div className="page"><p>Gruppe nicht gefunden.</p></div>

  return (
    <div className="page">
      <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>← Zurück</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>{group.name}</h1>
          {group.description && <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{group.description}</p>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button onClick={() => setModal('invite')} className="btn btn-ghost btn-sm">
            📨 Einladen
          </button>
          {!isAdmin && (
            <button onClick={handleLeave} style={{
              background: 'rgba(240,96,96,0.12)',
              border: '1px solid rgba(240,96,96,0.3)',
              borderRadius: 'var(--radius)',
              color: 'var(--danger)',
              padding: '7px 12px',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'DM Sans, sans-serif',
              flexShrink: 0,
            }}>
              🚪 Verlassen
            </button>
          )}
        </div>
      </div>

      {/* Members row */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {group.members.map(uid => (
          <div key={uid} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <UserAvatar name={group.memberNames?.[uid] || 'Anonym'} uid={uid} size={44} />
            <span style={{ fontSize: 10, color: uid === user.uid ? 'var(--accent)' : 'var(--text-dim)', maxWidth: 52, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {uid === user.uid ? 'Du' : (group.memberNames?.[uid] || 'Anonym').split(' ')[0]}
            </span>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {group.votesPerMember} Stimmen/Runde
        </div>
      </div>

      <NotificationBanner />

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: 'runden',        label: '🎵 Runden' },
          { key: 'warteschlange', label: `⏭ Queue${queueLength > 0 ? ` (${queueLength})` : ''}` },
          { key: 'bestenliste',   label: '🏆 Punkte' },
          { key: 'chat',          label: '💬 Chat' },
        ].map(t => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Rounds ── */}
      {tab === 'runden' && (
        <div>
          {isAdmin && (
            <button onClick={() => setModal('queue')} className="btn btn-primary btn-full" style={{ marginBottom: 16 }}>
              ⏭ Warteschlange importieren
            </button>
          )}
          {queueLength > 0 && (
            <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 13, color: 'var(--accent)' }}>
              ⏭ {queueLength} Kategorie{queueLength !== 1 ? 'n' : ''} in der Warteschlange
            </div>
          )}
          {rounds.length === 0 && (
            <div className="empty-state">
              <div className="empty-state-icon">🎶</div>
              <h3>Noch keine Runden</h3>
              <p>{isAdmin ? 'Importiere Kategorien — die erste Runde startet automatisch.' : 'Der Admin startet bald die erste Runde.'}</p>
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
                    </div>
                    <h3 style={{ fontSize: 20, marginBottom: round.description ? 4 : 8 }}>{round.prompt}</h3>
                    {round.description && <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8, fontStyle: 'italic' }}>{round.description}</p>}
                    {round.status === 'submission' && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Einreichung: {formatDeadline(round.submissionDeadline)}</p>}
                    {round.status === 'voting'     && <p style={{ fontSize: 12, color: 'var(--accent2)' }}>Abstimmung: {formatDeadline(round.votingDeadline)}</p>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
                    {isAdmin && round.status !== 'results' && (
                      <button onClick={e => { e.stopPropagation(); handleSkip(round) }} className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '4px 8px' }}>⏭ Skip</button>
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

      {/* ── Queue ── */}
      {tab === 'warteschlange' && (
        <div>
          {isAdmin && <button onClick={() => setModal('queue')} className="btn btn-primary btn-full" style={{ marginBottom: 20 }}>Warteschlange importieren</button>}
          {queueLength === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏭</div>
              <h3>Warteschlange leer</h3>
              <p>{isAdmin ? 'Importiere eine CSV oder JSON Datei.' : 'Keine Kategorien in der Warteschlange.'}</p>
            </div>
          ) : (
            <div className="card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18 }}>Nächste Runden</h3>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>~{queueLength * 7} Tage gesamt</span>
              </div>
              {(group.categoryQueue || []).map(toItem).map((item, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: i < queueLength - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontFamily: 'Fraunces', fontSize: 20, color: 'var(--text-muted)', width: 28, textAlign: 'center' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2, fontStyle: 'italic' }}>{item.description}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>5d + 2d</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Leaderboard ── */}
      {tab === 'bestenliste' && (
        <div className="card">
          <h3 style={{ fontSize: 20, marginBottom: 16 }}>Bestenliste</h3>
          {leaderboard.length === 0 ? <p style={{ color: 'var(--text-dim)', fontSize: 13 }}>Noch keine abgeschlossenen Runden.</p> : (
            leaderboard.map((entry, i) => (
              <div key={entry.uid} className="leaderboard-row">
                <div className={`leaderboard-rank ${i < 3 ? 'top' : ''}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
                <UserAvatar name={entry.name} uid={entry.uid} size={36} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: entry.uid === user.uid ? 700 : 400 }}>{entry.name} {entry.uid === user.uid && '(Du)'}</div>
                </div>
                <div style={{ fontSize: 20, fontFamily: 'Fraunces', fontWeight: 600, color: 'var(--accent)' }}>
                  {entry.points}<span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'Space Mono', marginLeft: 4 }}>pts</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Chat ── */}
      {tab === 'chat' && (
        <div className="card">
          <h3 style={{ fontSize: 20, marginBottom: 16 }}>Gruppen-Chat</h3>
          <Chat groupId={groupId} />
        </div>
      )}

      {modal === 'queue'  && <QueueModal group={group} onClose={() => setModal(null)} onStarted={id => { setModal(null); navigate(`/group/${groupId}/round/${id}`) }} />}
      {modal === 'invite' && <InviteModal code={group.inviteCode} onClose={() => setModal(null)} />}
    </div>
  )
}
