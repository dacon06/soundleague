import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import { useUserEmoji } from '../hooks/useUserEmoji'
import UserAvatar from '../components/UserAvatar'
import {
  collection, query, where, onSnapshot,
  doc, getDoc, updateDoc, setDoc, arrayUnion,
  serverTimestamp, getDocs
} from 'firebase/firestore'

function generateInviteCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

function RoundStatusBadge({ status }) {
  const map = {
    submission: { label: 'Einreichung', cls: 'badge-green' },
    voting:     { label: 'Abstimmung',  cls: 'badge-amber' },
    results:    { label: 'Ergebnisse',  cls: 'badge-dim'   },
  }
  const info = map[status] || { label: status, cls: 'badge-dim' }
  return <span className={`badge ${info.cls}`}>{info.label}</span>
}

// ─── Create Group Modal ───
function CreateGroupModal({ onClose, onCreated }) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [votesPerMember, setVotesPerMember] = useState(3)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    setError('')
    try {
      const inviteCode = generateInviteCode()
      const groupRef = doc(collection(db, 'groups'))
      await setDoc(groupRef, {
        name: name.trim(),
        description: desc.trim(),
        createdBy: user.uid,
        members: [user.uid],
        memberNames: { [user.uid]: user.displayName || 'Anonym' },
        inviteCode,
        votesPerMember: Number(votesPerMember),
        currentRoundId: null,
        createdAt: serverTimestamp(),
      })
      onCreated(groupRef.id)
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
          <h3 style={{ fontSize: 22 }}>Neue Gruppe</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>Gruppenname</label>
              <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Die Musiknerds" required />
            </div>
            <div className="form-group">
              <label>Beschreibung (optional)</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Worum geht's hier?" />
            </div>
            <div className="form-group">
              <label>Stimmen pro Person pro Runde</label>
              <select value={votesPerMember} onChange={e => setVotesPerMember(e.target.value)}>
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <option key={n} value={n}>{n} {n === 1 ? 'Stimme' : 'Stimmen'}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || !name.trim()}>
              {loading ? '…' : 'Gruppe erstellen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Join Group Modal ───
function JoinGroupModal({ onClose, onJoined }) {
  const { user } = useAuth()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const q = query(collection(db, 'groups'), where('inviteCode', '==', code.trim().toUpperCase()))
      const snap = await getDocs(q)
      if (snap.empty) { setError('Ungültiger Einladungscode.'); setLoading(false); return }
      const groupDoc = snap.docs[0]
      const data = groupDoc.data()
      if (data.members.includes(user.uid)) { onJoined(groupDoc.id); return }
      await updateDoc(doc(db, 'groups', groupDoc.id), {
        members: arrayUnion(user.uid),
        [`memberNames.${user.uid}`]: user.displayName || 'Anonym',
      })
      onJoined(groupDoc.id)
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
          <h3 style={{ fontSize: 22 }}>Gruppe beitreten</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}
          <form onSubmit={handleJoin}>
            <div className="form-group">
              <label>Einladungscode</label>
              <input
                autoFocus value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="z.B. ABC123"
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: 20, textAlign: 'center' }}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary btn-full btn-lg" disabled={loading || code.length < 6}>
              {loading ? '…' : 'Beitreten'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Main Home Page ───
export default function Home() {
  const { user } = useAuth()
  const { emoji } = useUserEmoji()
  const navigate = useNavigate()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [roundStatuses, setRoundStatuses] = useState({})

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'groups'), where('members', 'array-contains', user.uid))
    return onSnapshot(q, async (snap) => {
      const gs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setGroups(gs)
      setLoading(false)
      const statuses = {}
      await Promise.all(gs.map(async g => {
        if (g.currentRoundId) {
          const rDoc = await getDoc(doc(db, 'rounds', g.currentRoundId))
          if (rDoc.exists()) statuses[g.id] = rDoc.data().status
        }
      }))
      setRoundStatuses(statuses)
    })
  }, [user])

  const handleCreated = (groupId) => { setModal(null); navigate(`/group/${groupId}`) }
  const handleJoined  = (groupId) => { setModal(null); navigate(`/group/${groupId}`) }

  const firstName = user?.displayName?.split(' ')[0] || 'Musikfan'

  return (
    <div className="page">
      {/* Header with emoji avatar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, paddingTop: 8 }}>
        <div>
          <h1 style={{ fontSize: 28 }}>Soundleague</h1>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 2 }}>
            Hey, {firstName} 👋
          </p>
        </div>
        {/* Large emoji avatar — tap to change */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <UserAvatar uid={user?.uid} name={user?.displayName} size={52} />
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{user?.displayName?.split(' ')[0]}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 28 }}>
        <button onClick={() => setModal('create')} className="btn btn-primary btn-lg" style={{ flexDirection: 'column', gap: 6, height: 72 }}>
          <span style={{ fontSize: 20 }}>+</span>
          <span style={{ fontSize: 12 }}>Gruppe erstellen</span>
        </button>
        <button onClick={() => setModal('join')} className="btn btn-secondary btn-lg" style={{ flexDirection: 'column', gap: 6, height: 72 }}>
          <span style={{ fontSize: 20 }}>⊞</span>
          <span style={{ fontSize: 12 }}>Beitreten</span>
        </button>
      </div>

      {/* Group list */}
      <div className="section-title">Deine Gruppen</div>

      {loading && <div className="loading-center"><div className="spinner" /></div>}

      {!loading && groups.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">🎵</div>
          <h3>Noch keine Gruppen</h3>
          <p>Erstelle eine Gruppe oder tritt einer bei, um loszulegen.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {groups.map(group => (
          <button
            key={group.id}
            onClick={() => navigate(`/group/${group.id}`)}
            className="card card-hover"
            style={{ border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', borderLeft: '3px solid var(--border2)' }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <h3 style={{ fontSize: 17, fontWeight: 400 }}>{group.name}</h3>
                  {roundStatuses[group.id] && <RoundStatusBadge status={roundStatuses[group.id]} />}
                  {!group.currentRoundId && <span className="badge badge-dim">Keine Runde</span>}
                </div>
                {group.description && (
                  <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>{group.description}</p>
                )}
                {/* Member emoji row */}
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                  {group.members.slice(0, 8).map(uid => (
                    <UserAvatar key={uid} uid={uid} name={group.memberNames?.[uid]} size={24} />
                  ))}
                  {group.members.length > 8 && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{group.members.length - 8}</span>
                  )}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {group.members.length} {group.members.length === 1 ? 'Mitglied' : 'Mitglieder'} · {group.votesPerMember} Stimmen/Runde
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 4 }}>
                <polyline points="9,18 15,12 9,6"/>
              </svg>
            </div>
          </button>
        ))}
      </div>

      {modal === 'create' && <CreateGroupModal onClose={() => setModal(null)} onCreated={handleCreated} />}
      {modal === 'join'   && <JoinGroupModal   onClose={() => setModal(null)} onJoined={handleJoined} />}
    </div>
  )
}
