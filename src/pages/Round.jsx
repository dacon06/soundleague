import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import SongSearch from '../components/SongSearch'
import YouTubePlayer from '../components/YouTubePlayer'
import UserAvatar from '../components/UserAvatar'
import { createYouTubePlaylistUrl } from '../youtube'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  addDoc, updateDoc, serverTimestamp, getDocs, deleteDoc
} from 'firebase/firestore'

// ─── Playlist Button ───
function PlaylistButton({ submissions }) {
  const [copied, setCopied] = useState(false)
  if (!submissions.length) return null
  const videoIds = submissions.map(s => s.videoId).filter(Boolean)
  const playlistUrl = createYouTubePlaylistUrl(videoIds)

  const handleCopyLinks = () => {
    const text = submissions.map(s =>
      `${s.songTitle} - ${s.channelTitle}\nhttps://youtube.com/watch?v=${s.videoId}`
    ).join('\n\n')
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
      {playlistUrl && (
        <a href={playlistUrl} target="_blank" rel="noreferrer" className="btn btn-full"
          style={{ background: '#FF0000', color: '#fff', fontWeight: 700, flex: 2 }}>
          ▶ Alle auf YouTube
        </a>
      )}
      <button onClick={handleCopyLinks} className="btn btn-secondary" style={{ flex: 1 }}>
        {copied ? '✓ Kopiert' : '📋 Links'}
      </button>
    </div>
  )
}

// ─── Submission Phase ───
function SubmissionPhase({ round, group, groupId, roundId }) {
  const { user } = useAuth()
  const [showSearch, setShowSearch] = useState(false)
  const [mySubmission, setMySubmission] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [comment, setComment] = useState('')
  const [editingComment, setEditingComment] = useState(false)

  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('roundId', '==', roundId))
    return onSnapshot(q, snap => {
      const subs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSubmissions(subs)
      const mine = subs.find(s => s.userId === user.uid)
      setMySubmission(mine || null)
      if (mine) setComment(mine.submissionComment || '')
      setLoading(false)
    })
  }, [roundId, user.uid])

  const handleSelect = async (song) => {
    setShowSearch(false)
    setSubmitting(true)
    try {
      if (mySubmission) await deleteDoc(doc(db, 'submissions', mySubmission.id))
      await addDoc(collection(db, 'submissions'), {
        roundId, groupId,
        userId: user.uid,
        userName: user.displayName || 'Anonym',
        videoId: song.id,
        songTitle: song.title,
        channelTitle: song.channelTitle,
        thumbnail: song.thumbnail || '',
        videoUrl: song.videoUrl,
        submissionComment: comment,
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      alert('Fehler: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSaveComment = async () => {
    if (!mySubmission) return
    await updateDoc(doc(db, 'submissions', mySubmission.id), { submissionComment: comment })
    setEditingComment(false)
  }

  const totalMembers = group?.members?.length || 0

  return (
    <div>
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'rgba(29,185,84,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)' }}>Eingereichte Songs</span>
          <span style={{ fontSize: 20, fontFamily: 'Fraunces', color: 'var(--accent)' }}>{submissions.length}/{totalMembers}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${totalMembers ? (submissions.length / totalMembers) * 100 : 0}%` }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Songs bleiben bis zur Abstimmung anonym.</p>
      </div>

      {mySubmission ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Dein Song</div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            {mySubmission.thumbnail && <img src={mySubmission.thumbnail} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{mySubmission.songTitle}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{mySubmission.channelTitle}</div>
            </div>
            <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Dein Kommentar (optional)</div>
            {editingComment ? (
              <div>
                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Warum hast du diesen Song gewählt?" rows={3} style={{ fontSize: 13, marginBottom: 8 }} autoFocus />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSaveComment} className="btn btn-primary btn-sm">Speichern</button>
                  <button onClick={() => setEditingComment(false)} className="btn btn-ghost btn-sm">Abbrechen</button>
                </div>
              </div>
            ) : (
              <div onClick={() => setEditingComment(true)} style={{
                padding: '10px 12px', background: 'var(--surface2)', borderRadius: 'var(--radius)',
                border: '1px solid var(--border)', cursor: 'pointer', fontSize: 13,
                color: mySubmission.submissionComment ? 'var(--text)' : 'var(--text-muted)',
                fontStyle: mySubmission.submissionComment ? 'normal' : 'italic',
              }}>
                {mySubmission.submissionComment || 'Kommentar hinzufügen…'}
                <span style={{ float: 'right', fontSize: 11, color: 'var(--text-muted)' }}>✏️</span>
              </div>
            )}
          </div>
          <button onClick={() => setShowSearch(true)} className="btn btn-ghost btn-sm" disabled={submitting}>Song ändern</button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 16 }}>
            <label>Kommentar zu deinem Song (optional)</label>
            <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Warum wählst du diesen Song?" rows={2} style={{ fontSize: 13 }} />
          </div>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
            <h3 style={{ fontSize: 18, marginBottom: 8 }}>Reiche deinen Song ein</h3>
            <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
              Kategorie: „{round.prompt}"
            </p>
            <button onClick={() => setShowSearch(true)} className="btn btn-primary btn-lg" disabled={submitting}>
              {submitting ? '…' : '🔍 Song suchen'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section-title">Mitglieder</div>
        {group?.members?.map(uid => {
          const hasSubmitted = submissions.some(s => s.userId === uid)
          const name = group.memberNames?.[uid] || 'Anonym'
          return (
            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <UserAvatar uid={uid} name={name} size={32} />
              <span style={{ flex: 1, fontSize: 14 }}>{name} {uid === user.uid && '(Du)'}</span>
              {hasSubmitted ? <span className="badge badge-green">✓</span> : <span className="badge badge-dim">Ausstehend</span>}
            </div>
          )
        })}
      </div>

      {showSearch && <SongSearch onSelect={handleSelect} onClose={() => setShowSearch(false)} />}
    </div>
  )
}

// ─── Voting Phase ───
function VotingPhase({ round, group, groupId, roundId }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [myVotes, setMyVotes] = useState({})
  const [myComments, setMyComments] = useState({})
  const [existingVotes, setExistingVotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const totalVotes = group?.votesPerMember || 3
  const usedVotes = Object.values(myVotes).reduce((a, b) => a + b, 0)
  const remainingVotes = totalVotes - usedVotes

  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('roundId', '==', roundId))
    return onSnapshot(q, snap => { setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
  }, [roundId])

  useEffect(() => {
    getDocs(query(collection(db, 'votes'), where('roundId', '==', roundId), where('voterId', '==', user.uid))).then(snap => {
      const votes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setExistingVotes(votes)
      const vmap = {}, cmap = {}
      votes.forEach(v => { vmap[v.submissionId] = v.points; cmap[v.submissionId] = v.comment || '' })
      setMyVotes(vmap); setMyComments(cmap)
    })
  }, [roundId, user.uid])

  const addVote = useCallback((subId) => {
    if (remainingVotes <= 0) return
    setMyVotes(prev => ({ ...prev, [subId]: (prev[subId] || 0) + 1 }))
    setSaved(false)
  }, [remainingVotes])

  const removeVote = useCallback((subId) => {
    setMyVotes(prev => {
      const v = (prev[subId] || 0) - 1
      if (v <= 0) { const { [subId]: _, ...rest } = prev; return rest }
      return { ...prev, [subId]: v }
    })
    setSaved(false)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await Promise.all(existingVotes.map(v => deleteDoc(doc(db, 'votes', v.id))))
      await Promise.all(Object.entries(myVotes).filter(([_, p]) => p > 0).map(([subId, points]) => {
        const sub = submissions.find(s => s.id === subId)
        return addDoc(collection(db, 'votes'), { roundId, groupId, voterId: user.uid, submissionId: subId, submitterUserId: sub?.userId, points, comment: myComments[subId] || '', createdAt: serverTimestamp() })
      }))
      const snap = await getDocs(query(collection(db, 'votes'), where('roundId', '==', roundId), where('voterId', '==', user.uid)))
      setExistingVotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setSaved(true)
    } catch (err) { alert('Fehler: ' + err.message) } finally { setSaving(false) }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const otherSubs = submissions.filter(s => s.userId !== user.uid)
  const mySubmission = submissions.find(s => s.userId === user.uid)

  return (
    <div>
      <PlaylistButton submissions={submissions} />

      <div className="card" style={{ marginBottom: 16, background: 'var(--accent2-dim)', borderColor: 'rgba(232,168,56,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent2)' }}>Deine Stimmen</span>
          <span style={{ fontSize: 24, fontFamily: 'Fraunces', color: 'var(--accent2)' }}>{remainingVotes} <span style={{ fontSize: 13 }}>verbleibend</span></span>
        </div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: `${(usedVotes / totalVotes) * 100}%`, background: 'var(--accent2)' }} /></div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Verteile deine {totalVotes} Stimmen. Mehrere auf einen Song möglich.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {otherSubs.map(sub => (
          <div key={sub.id} className="card">
            <div style={{ marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{sub.songTitle}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{sub.channelTitle}</div>
              </div>
            </div>
            <YouTubePlayer videoId={sub.videoId} title={sub.songTitle} compact={true} />
            <div className="vote-row" style={{ margin: '12px 0' }}>
              <div className="vote-counter">
                <button className="vote-btn" onClick={() => removeVote(sub.id)} disabled={!myVotes[sub.id]}>−</button>
                <span className="vote-number">{myVotes[sub.id] || 0}</span>
                <button className="vote-btn" onClick={() => addVote(sub.id)} disabled={remainingVotes <= 0}>+</button>
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{myVotes[sub.id] ? `${myVotes[sub.id]} Stimme${myVotes[sub.id] !== 1 ? 'n' : ''}` : 'Keine Stimmen'}</span>
            </div>
            <div>
              <label>Kommentar (optional)</label>
              <textarea value={myComments[sub.id] || ''} onChange={e => { setMyComments(prev => ({ ...prev, [sub.id]: e.target.value })); setSaved(false) }} placeholder="Was denkst du über diesen Song?" rows={2} style={{ fontSize: 13 }} />
            </div>
          </div>
        ))}
      </div>

      {mySubmission && (
        <div style={{ marginTop: 16, opacity: 0.6 }}>
          <div className="section-title">Dein Song</div>
          <div style={{ display: 'flex', gap: 12, background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: 12 }}>
            {mySubmission.thumbnail && <img src={mySubmission.thumbnail} alt="" style={{ width: 60, height: 45, borderRadius: 6, objectFit: 'cover' }} />}
            <div><div style={{ fontSize: 14, fontWeight: 700 }}>{mySubmission.songTitle}</div><div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{mySubmission.channelTitle}</div></div>
          </div>
        </div>
      )}

      <div style={{ position: 'sticky', bottom: 'calc(var(--nav-height) + 8px)', marginTop: 20 }}>
        <button onClick={handleSave} className={`btn btn-full btn-lg ${saved ? 'btn-secondary' : 'btn-primary'}`} disabled={saving || usedVotes === 0} style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}>
          {saving ? '…' : saved ? '✓ Gespeichert' : `Stimmen abgeben (${usedVotes}/${totalVotes})`}
        </button>
      </div>
    </div>
  )
}

// ─── Results Phase ───
function ResultsPhase({ round, group, groupId, roundId }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'submissions'), where('roundId', '==', roundId))),
      getDocs(query(collection(db, 'votes'), where('roundId', '==', roundId))),
    ]).then(([s, v]) => { setSubmissions(s.docs.map(d => ({ id: d.id, ...d.data() }))); setVotes(v.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) })
  }, [roundId])

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const results = submissions
    .map(sub => { const subVotes = votes.filter(v => v.submissionId === sub.id); return { ...sub, subVotes, totalPoints: subVotes.reduce((s, v) => s + v.points, 0) } })
    .sort((a, b) => b.totalPoints - a.totalPoints)

  return (
    <div>
      <PlaylistButton submissions={submissions} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {results.map((sub, i) => (
          <div key={sub.id} className="card fade-in" style={{ animationDelay: `${i * 0.08}s`, borderColor: i === 0 ? 'rgba(232,168,56,0.4)' : 'var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 24, fontFamily: 'Fraunces' }}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontFamily: 'Fraunces', color: 'var(--accent)', lineHeight: 1 }}>{sub.totalPoints}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PUNKTE</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              {sub.thumbnail && <img src={sub.thumbnail} alt="" style={{ width: 80, height: 60, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{sub.songTitle}</div>
                <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>{sub.channelTitle}</div>
              </div>
            </div>
            <YouTubePlayer videoId={sub.videoId} title={sub.songTitle} compact={true} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0 8px' }}>
              <UserAvatar uid={sub.userId} name={sub.userName} size={28} />
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>von <strong style={{ color: 'var(--text)' }}>{sub.userName}</strong>{sub.userId === user.uid && ' (Du)'}</span>
            </div>
            {sub.submissionComment && (
              <div style={{ background: 'var(--accent-dim)', border: '1px solid rgba(29,185,84,0.2)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, fontStyle: 'italic', lineHeight: 1.5 }}>
                <span style={{ fontSize: 10, color: 'var(--accent)', fontStyle: 'normal', display: 'block', marginBottom: 2 }}>💬 VOM EINREICHER</span>
                „{sub.submissionComment}"
              </div>
            )}
            {sub.subVotes.length > 0 && (
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div className="section-title">Wer hat abgestimmt</div>
                {sub.subVotes.map(vote => {
                  const voterName = group?.memberNames?.[vote.voterId] || 'Anonym'
                  return (
                    <div key={vote.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <UserAvatar uid={vote.voterId} name={voterName} size={28} />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: vote.comment ? 4 : 0 }}>
                          <span style={{ fontSize: 13 }}><strong>{voterName}</strong>{vote.voterId === user.uid && ' (Du)'}</span>
                          <span className="badge badge-amber" style={{ fontSize: 10 }}>{'♦'.repeat(Math.min(vote.points, 5))} {vote.points}pt</span>
                        </div>
                        {vote.comment && <p style={{ fontSize: 13, color: 'var(--text-dim)', background: 'var(--surface2)', borderRadius: 8, padding: '6px 10px', margin: 0, fontStyle: 'italic', lineHeight: 1.5 }}>„{vote.comment}"</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main ───
export default function RoundPage() {
  const { groupId, roundId } = useParams()
  const navigate = useNavigate()
  const [round, setRound] = useState(null)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return onSnapshot(doc(db, 'rounds', roundId), snap => { if (snap.exists()) setRound({ id: snap.id, ...snap.data() }); setLoading(false) })
  }, [roundId])

  useEffect(() => {
    getDoc(doc(db, 'groups', groupId)).then(snap => { if (snap.exists()) setGroup({ id: snap.id, ...snap.data() }) })
  }, [groupId])

  useEffect(() => {
    if (!round) return
    const now = new Date()
    if (round.status === 'submission' && round.submissionDeadline?.toDate?.() < now)
      updateDoc(doc(db, 'rounds', roundId), { status: 'voting' })
    else if (round.status === 'voting' && round.votingDeadline?.toDate?.() < now)
      updateDoc(doc(db, 'rounds', roundId), { status: 'results' })
  }, [round, roundId])

  const statusInfo = {
    submission: { label: 'Einreichung läuft', badge: 'badge-green', deadline: round?.submissionDeadline },
    voting:     { label: 'Abstimmung läuft',  badge: 'badge-amber', deadline: round?.votingDeadline },
    results:    { label: 'Runde beendet',      badge: 'badge-dim',   deadline: null },
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!round) return <div className="page"><p>Runde nicht gefunden.</p></div>

  const info = statusInfo[round.status] || {}
  const formatDeadline = ts => ts?.toDate ? ts.toDate().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className="page">
      <button onClick={() => navigate(`/group/${groupId}`)} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>← Gruppe</button>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className={`badge ${info.badge}`}>{info.label}</span>
          {info.deadline && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>bis {formatDeadline(info.deadline)}</span>}
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.1 }}>{round.prompt}</h1>
        {round.description && <p style={{ fontSize: 15, color: 'var(--text-dim)', marginTop: 8, fontStyle: 'italic' }}>{round.description}</p>}
        {group && <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>{group.name}</p>}
      </div>
      {round.status === 'submission' && <SubmissionPhase round={round} group={group} groupId={groupId} roundId={roundId} />}
      {round.status === 'voting'     && <VotingPhase     round={round} group={group} groupId={groupId} roundId={roundId} />}
      {round.status === 'results'    && <ResultsPhase    round={round} group={group} groupId={groupId} roundId={roundId} />}
    </div>
  )
}
