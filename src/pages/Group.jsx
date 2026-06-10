import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { usePushNotifications } from '../hooks/usePushNotifications'
import UserAvatar from '../components/UserAvatar'
import Chat from '../components/Chat'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  orderBy, addDoc, updateDoc, serverTimestamp, getDocs,
  arrayRemove, deleteField, deleteDoc, writeBatch,
  query as fsQuery,
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

// ─── Kalenderbasierte Deadlines ───
// Einreichung: beginnt Montag 00:00, endet Samstag 00:00 (dieselbe Woche)
// Abstimmung: beginnt Samstag 00:00, endet nächsten Montag 00:00
//
// Gibt { submissionDeadline, votingDeadline } zurück basierend auf dem aktuellen Wochentag:
// - Mo–Fr: Einreichung bis Sa 00:00, Abstimmung bis Mo 00:00 der Folgewoche
// - Sa–So: startet in der nächsten Woche (nächster Montag 00:00 für Einreichung)
function getCalendarDeadlines() {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa

  // Nächsten Montag 00:00 berechnen (oder diesen Montag, falls heute Montag)
  const nextMonday = new Date(now)
  nextMonday.setHours(0, 0, 0, 0)
  // Wie viele Tage bis zum nächsten Montag?
  const daysUntilMonday = dayOfWeek === 1 ? 0 : (8 - dayOfWeek) % 7 || 7
  nextMonday.setDate(now.getDate() + daysUntilMonday)

  // Samstag dieser Runde (5 Tage nach Montag)
  const saturdayOfRound = new Date(nextMonday)
  saturdayOfRound.setDate(nextMonday.getDate() + 5) // Mo + 5 = Sa

  // Montag der Folgewoche (Ende der Abstimmung)
  const mondayAfterVoting = new Date(nextMonday)
  mondayAfterVoting.setDate(nextMonday.getDate() + 7) // Mo + 7 = nächster Mo

  // Falls heute Samstag oder Sonntag: nächste Runde erst ab übernächstem Montag
  if (dayOfWeek === 6 || dayOfWeek === 0) {
    // Nächster Montag ist bereits nextMonday (übernächste Woche),
    // Samstag und Montag danach werden korrekt berechnet
    return {
      submissionDeadline: saturdayOfRound,
      votingDeadline: mondayAfterVoting,
    }
  }

  return {
    submissionDeadline: saturdayOfRound,
    votingDeadline: mondayAfterVoting,
  }
}

// ─── Queue Modal ───
function QueueModal({ group, onClose, onStarted, currentUserId }) {
  const fileRef = useRef()
  const [items, setItems] = useState(() => (group.categoryQueue || []).map(toItem))
  const [saving, setSaving] = useState(false)
  const [importError, setImportError] = useState('')
  const [importCount, setImportCount] = useState(null)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [insertAt, setInsertAt] = useState('end')

  const handleAddManual = () => {
    const name = newName.trim()
    if (!name) return
    const item = { name, description: newDesc.trim() }
    setItems(prev => {
      const arr = [...prev]
      const pos = insertAt === 'end' ? arr.length : Math.max(0, Math.min(parseInt(insertAt, 10), arr.length))
      arr.splice(pos, 0, item)
      return arr
    })
    setNewName('')
    setNewDesc('')
    setInsertAt('end')
  }

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
          setItems(prev => [...prev, ...newItems])
          setImportCount(newItems.length)
          return
        }
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
        const newItems = lines.map(line => {
          const sep = line.includes(';') ? ';' : ','
          const parts = line.split(sep).map(p => p.trim().replace(/^["']|["']$/g, ''))
          return { name: parts[0] || '', description: parts[1] || '' }
        }).filter(i => i.name)
        setItems(prev => [...prev, ...newItems])
        setImportCount(newItems.length)
      } catch (err) {
        setImportError('Fehler: ' + err.message)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const removeItem = (i) => setItems(prev => prev.filter((_, idx) => idx !== i))

  const moveUp = (i) => {
    if (i === 0) return
    setItems(prev => {
      const arr = [...prev]
      ;[arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]
      return arr
    })
  }

  const moveDown = (i) => {
    setItems(prev => {
      if (i >= prev.length - 1) return prev
      const arr = [...prev]
      ;[arr[i], arr[i + 1]] = [arr[i + 1], arr[i]]
      return arr
    })
  }

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
      const { submissionDeadline, votingDeadline } = getCalendarDeadlines()
      const roundRef = await addDoc(collection(db, 'rounds'), {
        groupId: group.id,
        prompt: first.name,
        description: first.description || '',
        status: 'submission',
        submissionDeadline,
        votingDeadline,
        playlistId: null,
        createdBy: currentUserId,
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
          <h3 style={{ fontSize: 22, color: '#F5F4FF' }}>Warteschlange bearbeiten</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          {/* Manuelles Hinzufügen */}
          <div style={{ background: 'var(--surface3)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 14, border: '1px solid var(--border2)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Thema manuell hinzufügen</div>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddManual()} placeholder="Thema (z.B. Guilty Pleasure)" style={{ fontSize: 13, marginBottom: 8 }} />
            <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddManual()} placeholder="Beschreibung (optional)" style={{ fontSize: 13, marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={insertAt} onChange={e => setInsertAt(e.target.value)} style={{ flex: 1, fontSize: 13, padding: '8px 10px', background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif' }}>
                <option value="end">Ans Ende</option>
                <option value="0">An den Anfang</option>
                {items.map((item, i) => <option key={i} value={i + 1}>Nach Position {i + 1} ({item.name})</option>)}
              </select>
              <button onClick={handleAddManual} disabled={!newName.trim()} className="btn btn-primary btn-sm" style={{ flexShrink: 0 }}>+ Hinzufügen</button>
            </div>
          </div>

          {/* Datei-Import */}
          <button onClick={() => fileRef.current.click()} className="btn btn-ghost btn-full" style={{ marginBottom: 10 }}>📁 CSV oder JSON importieren</button>
          <input ref={fileRef} type="file" accept=".csv,.json" onChange={handleFileImport} style={{ display: 'none' }} />
          {importError && <div className="error-msg">{importError}</div>}
          {importCount !== null && (
            <div style={{ background: 'rgba(72,213,151,0.1)', border: '1px solid rgba(72,213,151,0.25)', borderRadius: 'var(--radius)', padding: '8px 14px', marginBottom: 10, fontSize: 13, color: 'var(--success)' }}>
              ✓ {importCount} Kategorien hinzugefügt
            </div>
          )}

          {items.length > 0 ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div className="section-title" style={{ margin: 0 }}>{items.length} Kategorien · ~{items.length * 7} Tage</div>
                <button onClick={() => { if (window.confirm('Alle Kategorien entfernen?')) setItems([]) }} style={{ fontSize: 12, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>Alle löschen</button>
              </div>
              <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface3)', borderRadius: 8, padding: '8px 10px', border: '1px solid var(--border2)' }}>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: 'var(--text-muted)', width: 22, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F4FF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</div>
                      {item.description && <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                      <button onClick={() => moveUp(i)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--text-muted)' : 'var(--text-dim)', fontSize: 12, padding: '1px 4px', lineHeight: 1 }}>▲</button>
                      <button onClick={() => moveDown(i)} disabled={i === items.length - 1} style={{ background: 'none', border: 'none', cursor: i === items.length - 1 ? 'default' : 'pointer', color: i === items.length - 1 ? 'var(--text-muted)' : 'var(--text-dim)', fontSize: 12, padding: '1px 4px', lineHeight: 1 }}>▼</button>
                    </div>
                    <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, padding: '2px 4px', flexShrink: 0, lineHeight: 1, opacity: 0.7 }}>✕</button>
                  </div>
                ))}
              </div>
              <button onClick={handleSave} className="btn btn-primary btn-full btn-lg" disabled={saving}>
                {saving ? '…' : !group.currentRoundId ? '🚀 Speichern & erste Runde starten' : 'Warteschlange speichern'}
              </button>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-dim)', fontSize: 13 }}>
              Noch keine Kategorien — füge oben welche hinzu oder importiere eine Datei.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Deadline Modal ───
// Ermöglicht das direkte Verschieben der Deadlines der aktiven Runde
function DeadlineModal({ round, onClose }) {
  const toInputVal = (ts) => {
    const d = ts?.toDate ? ts.toDate() : new Date(ts)
    return d.toISOString().slice(0, 10) // yyyy-mm-dd
  }
  const [subVal, setSubVal] = useState(() => toInputVal(round.submissionDeadline))
  const [voteVal, setVoteVal] = useState(() => toInputVal(round.votingDeadline))
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDoc(doc(db, 'rounds', round.id), {
        submissionDeadline: new Date(subVal + 'T00:00:00'),
        votingDeadline: new Date(voteVal + 'T00:00:00'),
      })
      onClose()
    } catch (err) { alert('Fehler: ' + err.message) } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 20 }}>📅 Deadlines anpassen</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>„{round.prompt}"</p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Einreichung endet
            </label>
            <input
              type="date"
              value={subVal}
              onChange={e => setSubVal(e.target.value)}
              style={{ fontSize: 14, padding: '10px 12px', background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
              Abstimmung endet
            </label>
            <input
              type="date"
              value={voteVal}
              onChange={e => setVoteVal(e.target.value)}
              style={{ fontSize: 14, padding: '10px 12px', background: 'var(--surface3)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', color: 'var(--text)', fontFamily: 'DM Sans, sans-serif', width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost btn-full">Abbrechen</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary btn-full">{saving ? '…' : 'Speichern'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Skip Modal ───
function SkipModal({ round, onClose, onConfirm }) {
  const isSubmission = round.status === 'submission'
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 20, color: '#F5F4FF' }}>⏭ Schritt überspringen</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'rgba(240,96,96,0.1)', border: '1px solid rgba(240,96,96,0.3)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#F06060', marginBottom: 4 }}>
              ⚠️ {isSubmission ? 'Einreichung wirklich überspringen?' : 'Abstimmung wirklich beenden?'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5 }}>
              {isSubmission
                ? 'Die Einreichungsphase wird sofort beendet und die Abstimmung beginnt. Songs die noch nicht eingereicht wurden können nicht mehr nachgereicht werden.'
                : 'Die Abstimmung wird sofort beendet und die Ergebnisse werden veröffentlicht. Nicht abgegebene Stimmen gehen verloren.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={onClose} className="btn btn-ghost btn-full">Abbrechen</button>
            <button onClick={onConfirm} className="btn btn-full" style={{ background: '#F06060', color: '#fff', border: 'none' }}>
              {isSubmission ? 'Ja, überspringen' : 'Ja, beenden'}
            </button>
          </div>
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
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [localPerm, setLocalPerm] = useState(() => {
    try { return Notification.permission } catch { return 'unsupported' }
  })

  const notifAvailable = typeof Notification !== 'undefined'

  if (!notifAvailable) return null
  if (localPerm === 'granted' && !success) return null

  const handleEnable = async () => {
    setLoading(true)
    try {
      // Try push notifications first if supported
      if (supported) {
        const ok = await subscribe()
        if (ok) { setSuccess(true); setLocalPerm('granted'); setLoading(false); return }
      }
      // Fallback: just request browser notification permission
      const perm = await Notification.requestPermission()
      setLocalPerm(perm)
      if (perm === 'granted') setSuccess(true)
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  if (success) return (
    <div style={{ background: 'rgba(72,213,151,0.1)', border: '1px solid rgba(72,213,151,0.25)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, fontSize: 13, color: 'var(--success)' }}>
      ✓ Benachrichtigungen aktiviert!
    </div>
  )

  if (localPerm === 'denied') return (
    <div style={{ background: 'rgba(240,96,96,0.08)', border: '1px solid rgba(240,96,96,0.2)', borderRadius: 'var(--radius)', padding: '10px 14px', marginBottom: 16, fontSize: 12, color: 'var(--text-dim)' }}>
      🔕 Benachrichtigungen blockiert — in den Browsereinstellungen erlauben
    </div>
  )

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#F5F4FF', marginBottom: 2 }}>🔔 Benachrichtigungen aktivieren</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>Erinnerung 24h vor Ende der Einreichung & Abstimmung</div>
        </div>
        <button onClick={handleEnable} className="btn btn-primary btn-sm" disabled={loading} style={{ flexShrink: 0 }}>
          {loading ? '…' : 'Aktivieren'}
        </button>
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
  const [unreadCount, setUnreadCount] = useState(0)
  const lastSeenRef = useRef(localStorage.getItem(`chat_seen_${groupId}`) || '0')

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

  // Track unread chat messages
  useEffect(() => {
    if (tab === 'chat') {
      // Mark as seen when chat tab is open
      const now = Date.now().toString()
      localStorage.setItem(`chat_seen_${groupId}`, now)
      lastSeenRef.current = now
      setUnreadCount(0)
      return
    }
    const lastSeen = Number(lastSeenRef.current || '0')
    const q = query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('createdAt', 'desc'),
      where('createdAt', '>', new Date(lastSeen))
    )
    // Use onSnapshot to count new messages
    const unsub = onSnapshot(
      collection(db, 'groups', groupId, 'messages'),
      snap => {
        const lastSeen = Number(localStorage.getItem(`chat_seen_${groupId}`) || '0')
        const unread = snap.docs.filter(d => {
          const ts = d.data().createdAt?.toMillis?.() || 0
          return ts > lastSeen && d.data().userId !== user.uid
        }).length
        setUnreadCount(unread)
      }
    )
    return unsub
  }, [groupId, tab, user.uid])

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
    const { submissionDeadline, votingDeadline } = getCalendarDeadlines()
    const roundRef = await addDoc(collection(db, 'rounds'), {
      groupId,
      prompt: next.name,
      description: next.description || '',
      status: 'submission',
      submissionDeadline,
      votingDeadline,
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
    const target = ts.toDate()
    const diff = target - new Date()
    if (diff < 0) return 'Abgelaufen'
    const days = Math.floor(diff / 86_400_000)
    const hours = Math.floor((diff % 86_400_000) / 3_600_000)
    const dateStr = target.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
    if (days === 0) return `Heute bis ${target.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} (noch ${hours}h)`
    return `${dateStr} (noch ${days}d ${hours}h)`
  }

  const [skipRound, setSkipRound] = useState(null)
  const [deadlineRound, setDeadlineRound] = useState(null)

  const handleSkip = (round) => {
    if (!isAdmin) return
    setSkipRound(round)
  }

  const handleSkipConfirm = async () => {
    const round = skipRound
    setSkipRound(null)
    if (!round) return
    if (round.status === 'submission') {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'voting' })
    } else if (round.status === 'voting') {
      await updateDoc(doc(db, 'rounds', round.id), { status: 'results' })
      await autoStartNext(round)
    }
  }

  const handleDeleteRound = async (roundId) => {
    if (!window.confirm('Diese Runde und alle Songs & Abstimmungen dazu löschen?')) return
    try {
      const batch = writeBatch(db)
      const subsSnap = await getDocs(fsQuery(collection(db, 'submissions'), where('roundId', '==', roundId)))
      subsSnap.docs.forEach(d => batch.delete(d.ref))
      const votesSnap = await getDocs(fsQuery(collection(db, 'votes'), where('roundId', '==', roundId)))
      votesSnap.docs.forEach(d => batch.delete(d.ref))
      batch.delete(doc(db, 'rounds', roundId))
      await batch.commit()
    } catch (err) {
      alert('Fehler: ' + err.message)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Gruppe wirklich löschen? Alle Runden, Songs und Abstimmungen werden unwiderruflich gelöscht.')) return
    if (!window.confirm('Bist du sicher? Das kann nicht rückgängig gemacht werden.')) return
    try {
      // Delete all subcollections + documents
      const batch = writeBatch(db)
      // Delete rounds
      const roundsSnap = await getDocs(query(collection(db, 'rounds'), where('groupId', '==', groupId)))
      for (const r of roundsSnap.docs) {
        // Delete submissions and votes for each round
        const subsSnap = await getDocs(fsQuery(collection(db, 'submissions'), where('roundId', '==', r.id)))
        subsSnap.docs.forEach(d => batch.delete(d.ref))
        const votesSnap = await getDocs(fsQuery(collection(db, 'votes'), where('roundId', '==', r.id)))
        votesSnap.docs.forEach(d => batch.delete(d.ref))
        batch.delete(r.ref)
      }
      // Delete chat messages
      const msgsSnap = await getDocs(collection(db, 'groups', groupId, 'messages'))
      msgsSnap.docs.forEach(d => batch.delete(d.ref))
      // Delete group itself
      batch.delete(doc(db, 'groups', groupId))
      await batch.commit()
      navigate('/')
    } catch (err) {
      alert('Fehler beim Löschen: ' + err.message)
    }
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
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button onClick={() => setModal('invite')} className="btn btn-ghost btn-sm">
            📨 Einladen
          </button>
          {isAdmin && (
            <button onClick={handleDelete} style={{
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
              🗑 Löschen
            </button>
          )}
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
          <button key={t.key} className={`tab-btn ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)} style={{ position: 'relative' }}>
            {t.label}
            {t.key === 'chat' && unreadCount > 0 && tab !== 'chat' && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                background: 'var(--danger)',
                color: '#fff',
                borderRadius: '50%',
                width: 16, height: 16,
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Rounds ── */}
      {tab === 'runden' && (
        <div>
          <button onClick={() => setModal('queue')} className="btn btn-primary btn-full" style={{ marginBottom: 16 }}>⏭ Warteschlange bearbeiten</button>
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
                    {round.status === 'submission' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 12, color: 'var(--text-dim)', margin: 0 }}>Einreichung: {formatDeadline(round.submissionDeadline)}</p>
                        {isAdmin && <button onClick={e => { e.stopPropagation(); setDeadlineRound(round) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }} title="Datum anpassen">✏️</button>}
                      </div>
                    )}
                    {round.status === 'voting' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <p style={{ fontSize: 12, color: 'var(--accent2)', margin: 0 }}>Abstimmung: {formatDeadline(round.votingDeadline)}</p>
                        {isAdmin && <button onClick={e => { e.stopPropagation(); setDeadlineRound(round) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)', padding: '0 2px', lineHeight: 1 }} title="Datum anpassen">✏️</button>}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9,18 15,12 9,6"/></svg>
                    {isAdmin && round.status !== 'results' && (
                      <button onClick={e => { e.stopPropagation(); handleSkip(round) }} className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '4px 8px' }}>⏭ Skip</button>
                    )}
                    {isAdmin && round.status === 'results' && (
                      <button onClick={e => { e.stopPropagation(); handleDeleteRound(round.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 16, padding: '4px', opacity: 0.7 }} title="Runde löschen">🗑</button>
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
          <button onClick={() => setModal('queue')} className="btn btn-primary btn-full" style={{ marginBottom: 20 }}>⏭ Warteschlange bearbeiten</button>
          {queueLength === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">⏭</div>
              <h3>Warteschlange leer</h3>
              <p>{'Noch keine Kategorien — importiere eine CSV oder JSON Datei.'}</p>
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

      {modal === 'queue'  && <QueueModal group={group} onClose={() => setModal(null)} onStarted={id => { setModal(null); navigate(`/group/${groupId}/round/${id}`) }} currentUserId={user.uid} />}
      {modal === 'invite' && <InviteModal code={group.inviteCode} onClose={() => setModal(null)} />}
      {skipRound && <SkipModal round={skipRound} onClose={() => setSkipRound(null)} onConfirm={handleSkipConfirm} />}
      {deadlineRound && <DeadlineModal round={deadlineRound} onClose={() => setDeadlineRound(null)} />}
    </div>
  )
}
