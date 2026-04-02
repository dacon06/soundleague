import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import Chat from '../components/Chat'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  orderBy, addDoc, updateDoc, serverTimestamp, getDocs,
} from 'firebase/firestore'

function Avatar({ name, size = '' }) {
  return <div className={`avatar ${size}`}>{(name || '?')[0].toUpperCase()}</div>
}

function StatusBadge({ status }) {
  const map = {
    submission: { label: '● Einreichung', cls: 'badge-green' },
    voting:     { label: '● Abstimmung',  cls: 'badge-amber' },
    results:    { label: 'Ergebnisse',    cls: 'badge-dim'   },
  }
  const info = map[status] || { label: status, cls: 'badge-dim' }
  return <span className={`badge ${info.cls}`}>{info.label}</span>
}

// ─── Normalize queue item: always return {name, description} ───
function toItem(raw) {
  if (typeof raw === 'string') return { name: raw, description: '' }
  return { name: raw.name || '', description: raw.description || '' }
}

// ─── Queue Modal ───
function QueueModal({ group, onClose }) {
  const fileRef = useRef()
  const [items, setItems] = useState(() =>
    (group.categoryQueue || []).map(toItem)
  )
  const [saving, setSaving] = useState(false)
  const [importError, setImportError] = useState('')

  const presets = [
    { name: 'Guilty Pleasure',        description: 'Ein Song den du heimlich liebst aber nie zugeben würdest' },
    { name: 'Beste 90er',             description: 'Der beste Song aus den Neunzigern' },
    { name: 'Instrumental',           description: 'Kein Text erlaubt — nur Musik' },
    { name: 'Erste Liebe',            description: 'Der Song der dich an deine erste Liebe erinnert' },
    { name: 'Schlechter Tag',         description: 'Was hörst du wenn alles schief läuft?' },
    { name: 'Schlafenzeit',           description: 'Perfekt zum Einschlafen oder Träumen' },
    { name: 'Road Trip',              description: 'Fenster runter, laut aufdrehen' },
    { name: 'Workout',                description: 'Bringt dich in Bewegung' },
    { name: 'Partyknaller',           description: 'Bringt jeden zum Tanzen' },
    { name: 'Unbekannter Schatz',     description: 'Ein Song den wahrscheinlich niemand kennt' },
    { name: 'Film-Soundtrack',        description: 'Aus einem Film, einer Serie oder einem Spiel' },
    { name: 'Kindheitserinnerung',    description: 'Klingt nach deiner Kindheit' },
    { name: 'Breakup Song',           description: 'Herzschmerz in Musikform' },
    { name: 'Sommer-Hit',             description: 'Klingt nach Sonne und Urlaub' },
    { name: 'Nur die Basslinie zählt',description: 'Der Groove muss sitzen' },
  ]

  // ─── Parse CSV or JSON file ───
  const handleFileImport = (e) => {
    setImportError('')
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result.trim()
      try {
        // Try JSON first
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text)
          if (!Array.isArray(parsed)) throw new Error('JSON muss ein Array sein')
          const newItems = parsed.map(item => {
            if (typeof item === 'string') return { name: item, description: '' }
            return { name: item.name || item.kategorie || '', description: item.description || item.beschreibung || '' }
          }).filter(i => i.name)
          setItems(prev => [...prev, ...newItems])
          return
        }
        // CSV: name,description (comma or semicolon separated)
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        const newItems = lines.map(line => {
          // Support comma and semicolon as separator
          const sep = line.includes(';') ? ';' : ','
          const parts = line.split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
          return { name: parts[0] || '', description: parts[1] || '' }
        }).filter(i => i.name)
        setItems(prev => [...prev, ...newItems])
      } catch (err) {
        setImportError('Fehler beim Lesen: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // reset so same file can be re-imported
  }

  const updateItem = (i, field, value) => {
    setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [field]: value } : item))
  }

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const addPreset = (preset) => {
    if (!items.find(it => it.name === preset.name)) {
      setItems(prev => [...prev, preset])
    }
  }

  const addEmpty = () => setItems(prev => [...prev, { name: '', description: '' }])

  const handleSave = async () => {
    setSaving(true)
    const clean = items.filter(i => i.name.trim())
    await updateDoc(doc(db, 'groups', group.id), { categoryQueue: clean })
    setSaving(false)
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxHeight: '95dvh' }}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 22 }}>Warteschlange</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">

          {/* Import buttons */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => fileRef.current.click()} className="btn btn-secondary btn-sm" style={{ flex: 1 }}>
              📁 CSV / JSON importieren
            </button>
            <button onClick={addEmpty} className="btn btn-ghost btn-sm" style={{ flex: 1 }}>
              + Zeile hinzufügen
            </button>
            <input ref={fileRef} type="file" accept=".csv,.json" onChange={handleFileImport} style={{ display: 'none' }} />
          </div>

          {importError && <div className="error-msg">{importError}</div>}

          {/* Format hint */}
          <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '10px 12px', marginBottom: 16, fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7 }}>
            <strong style={{ color: 'var(--text)' }}>CSV Format:</strong><br />
            <code style={{ color: 'var(--accent)' }}>Guilty Pleasure,Ein Song den du heimlich liebst</code><br />
            <code style={{ color: 'var(--accent)' }}>Beste 90er,Der beste Song aus den Neunzigern</code><br />
            <span style={{ marginTop: 4, display: 'block' }}>Oder <strong style={{ color: 'var(--text)' }}>JSON</strong>: {`[{"name":"...","description":"..."}]`}</span>
          </div>

          {/* Item list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {items.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: 16 }}>
                Noch keine Kategorien — importiere eine Datei oder füge Zeilen hinzu.
              </p>
            )}
            {items.map((item, i) => (
              <div key={i} style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontFamily: 'Fraunces', fontSize: 18, color: 'var(--text-muted)', paddingTop: 8, minWidth: 24, textAlign: 'center' }}>{i + 1}</span>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <input
                      value={item.name}
                      onChange={e => updateItem(i, 'name', e.target.value)}
                      placeholder="Kategoriename"
                      style={{ fontSize: 14, fontWeight: 700 }}
                    />
                    <input
                      value={item.description}
                      onChange={e => updateItem(i, 'description', e.target.value)}
                      placeholder="Beschreibung (optional)"
                      style={{ fontSize: 13 }}
                    />
                  </div>
                  <button onClick={() => removeItem(i)} className="btn btn-ghost btn-sm" style={{ padding: '6px 8px', flexShrink: 0, color: 'var(--danger)' }}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          {items.length > 0 && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              {items.filter(i => i.name).length} Kategorien · ~{items.filter(i => i.name).length * 7} Tage Gesamtdauer
            </p>
          )}

          {/* Presets */}
          <div className="section-title" style={{ marginBottom: 8 }}>Vorschläge</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
            {presets.map(p => (
              <button
                key={p.name}
                onClick={() => addPreset(p)}
                className="btn btn-ghost btn-sm"
                disabled={!!items.find(it => it.name === p.name)}
                style={{ borderRadius: 100, fontSize: 11, padding: '3px 10px' }}
              >
                {items.find(it => it.name === p.name) ? '✓' : '+'} {p.name}
              </button>
            ))}
          </div>

          <button onClick={handleSave} className="btn btn-primary btn-full" disabled={saving}>
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
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const now = Date.now()
      const roundRef = await addDoc(collection(db, 'rounds'), {
        groupId: group.id,
        prompt: name.trim(),
        description: description.trim(),
        status: 'submission',
        submissionDeadline: new Date(now + 120 * 3600_000),
        votingDeadline:     new Date(now + 168 * 3600_000),
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
            <label>Kategoriename</label>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Guilty Pleasure" required />
          </div>
          <div className="form-group">
            <label>Beschreibung (optional)</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="z.B. Ein Song den du heimlich liebst…" />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>⏱ 5 Tage Einreichung · 2 Tage Abstimmung</p>
          <button onClick={handleCreate} className="btn btn-primary btn-full btn-lg" disabled={loading || !name.trim()}>
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

  // Auto-advance phases + auto-start next from queue
  useEffect(() => {
    if (!rounds.length || !group) return
    const check = async () => {
      const now = new Date()
      for (const round of rounds) {
        if (round.status === 'submission' && round.submissionDeadline?.toDate?.() < now) {
          await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
        } else if (round.status === 'voting' && round.votingDeadline?.toDate?.() < now) {
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

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!group) return <div className="page"><p>Gruppe nicht gefunden.</p></div>

  return (
    <div className="page">
      <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}>← Zurück</button>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 26 }}>{group.name}</h1>
          {group.description && <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{group.description}</p>}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6 }}>{group.members.length} Mitglieder · {group.votesPerMember} Stimmen/Runde</p>
        </div>
        <button onClick={() => setModal('invite')} className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
          Einladen
        </button>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <button onClick={() => setModal('createRound')} className="btn btn-primary">+ Manuelle Runde</button>
              <button onClick={() => setModal('queue')} className="btn btn-secondary">⏭ Warteschlange</button>
            </div>
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
                    <h3 style={{ fontSize: 20, marginBottom: round.description ? 4 : 8 }}>{round.prompt}</h3>
                    {round.description && (
                      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8, fontStyle: 'italic' }}>{round.description}</p>
                    )}
                    {round.status === 'submission' && <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>Einreichung: {formatDeadline(round.submissionDeadline)}</p>}
                    {round.status === 'voting'     && <p style={{ fontSize: 12, color: 'var(--accent2)' }}>Abstimmung: {formatDeadline(round.votingDeadline)}</p>}
                    {round.status === 'results' && round.playlistId && (
                      <a href={`https://open.spotify.com/playlist/${round.playlistId}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="badge badge-green">🎵 Playlist öffnen</a>
                    )}
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

      {/* ── Queue Tab ── */}
      {tab === 'warteschlange' && (
        <div>
          {isAdmin && <button onClick={() => setModal('queue')} className="btn btn-primary btn-full" style={{ marginBottom: 20 }}>Warteschlange bearbeiten</button>}
          {queueLength === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏭</div>
              <h3>Warteschlange leer</h3>
              <p>{isAdmin ? 'Füge Kategorien hinzu oder importiere eine CSV-Datei.' : 'Keine Kategorien in der Warteschlange.'}</p>
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
                <Avatar name={entry.name} />
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

      {modal === 'createRound' && <CreateRoundModal group={group} onClose={() => setModal(null)} onCreate={id => { setModal(null); navigate(`/group/${groupId}/round/${id}`) }} />}
      {modal === 'queue'       && <QueueModal group={group} onClose={() => setModal(null)} />}
      {modal === 'invite'      && <InviteModal code={group.inviteCode} onClose={() => setModal(null)} />}
    </div>
  )
}
