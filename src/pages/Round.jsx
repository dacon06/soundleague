import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import SpotifySearch from '../components/SpotifySearch'
import Avatar from '../components/Avatar'
import { isSpotifyConnected, initiateSpotifyAuth, getSpotifyUser, createPlaylist, addTracksToPlaylist } from '../spotify'
import {
  doc, getDoc, onSnapshot, collection, query, where,
  addDoc, updateDoc, serverTimestamp, getDocs, deleteDoc
} from 'firebase/firestore'



// ─── Shared Playlist Button ───
function PlaylistButton({ round, roundId, submissions }) {
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!isSpotifyConnected()) {
      sessionStorage.setItem("spotify_return_to", window.location.pathname)
      initiateSpotifyAuth()
      return
    }
    setCreating(true)
    try {
      const spotifyUser = await getSpotifyUser()
      const playlist = await createPlaylist(
        spotifyUser.id,
        `Soundleague: ${round.prompt}`,
        `Playlist fuer die Runde "${round.prompt}"`
      )
      await addTracksToPlaylist(playlist.id, submissions.map(s => s.trackUri))
      await updateDoc(doc(db, "rounds", roundId), { playlistId: playlist.id })
      window.open(`https://open.spotify.com/playlist/${playlist.id}`, "_blank")
    } catch (err) {
      alert("Fehler: " + err.message)
    } finally {
      setCreating(false)
    }
  }

  if (round.playlistId) return (
    <a href={`https://open.spotify.com/playlist/${round.playlistId}`} target="_blank" rel="noreferrer" className="btn btn-spotify btn-full btn-lg" style={{ marginBottom: 16 }}>🎵 Playlist auf Spotify oeffnen</a>
  )

  return (
    <button onClick={handleCreate} className="btn btn-spotify btn-full btn-lg" disabled={creating || submissions.length === 0} style={{ marginBottom: 16 }}>
      {creating ? "..." : "🎵 Spotify Playlist erstellen"}
    </button>
  )
}

// ─── Phase: Submission ───
function SubmissionPhase({ round, group, groupId, roundId }) {
  const { user } = useAuth()
  const [showSearch, setShowSearch] = useState(false)
  const [mySubmission, setMySubmission] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const connected = isSpotifyConnected()

  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('roundId', '==', roundId))
    return onSnapshot(q, snap => {
      const subs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setSubmissions(subs)
      setMySubmission(subs.find(s => s.userId === user.uid) || null)
      setLoading(false)
    })
  }, [roundId, user.uid])

  const handleSelect = async (track) => {
    setShowSearch(false)
    setSubmitting(true)
    try {
      // Remove previous submission
      if (mySubmission) {
        await deleteDoc(doc(db, 'submissions', mySubmission.id))
      }
      await addDoc(collection(db, 'submissions'), {
        roundId,
        groupId,
        userId: user.uid,
        userName: user.displayName || 'Anonym',
        trackId: track.id,
        trackUri: track.uri,
        trackName: track.name,
        artistName: track.artists.map(a => a.name).join(', '),
        albumName: track.album?.name || '',
        albumArt: track.album?.images?.[1]?.url || track.album?.images?.[0]?.url || '',
        previewUrl: track.preview_url || null,
        createdAt: serverTimestamp(),
      })
    } catch (err) {
      alert('Fehler: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSpotifyConnect = () => {
    sessionStorage.setItem('spotify_return_to', window.location.pathname)
    initiateSpotifyAuth()
  }

  const totalMembers = group?.members?.length || 0
  const submitted = submissions.length

  return (
    <div>
      {/* Progress indicator */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent-dim)', borderColor: 'rgba(29,185,84,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)' }}>Eingereichte Songs</span>
          <span style={{ fontSize: 20, fontFamily: 'Fraunces', color: 'var(--accent)' }}>
            {submitted}/{totalMembers}
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(submitted / totalMembers) * 100}%` }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Die Songs bleiben bis zur Abstimmung anonym.
        </p>
      </div>

      {/* My submission */}
      {mySubmission ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="section-title">Dein Song</div>
          <div className="track-card selected" style={{ marginBottom: 12 }}>
            {mySubmission.albumArt && <img src={mySubmission.albumArt} alt="" className="track-art" />}
            <div className="track-info">
              <div className="track-name">{mySubmission.trackName}</div>
              <div className="track-artist">{mySubmission.artistName}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{mySubmission.albumName}</div>
            </div>
            <span style={{ color: 'var(--accent)', fontSize: 18 }}>✓</span>
          </div>
          <button
            onClick={() => setShowSearch(true)}
            className="btn btn-ghost btn-sm"
            disabled={submitting}
          >
            Song ändern
          </button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎵</div>
          <h3 style={{ fontSize: 18, marginBottom: 8 }}>Reiche deinen Song ein</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            Wähle einen Song der Kategorie „{round.prompt}" — er bleibt bis zur Abstimmung anonym.
          </p>

          {connected ? (
            <button
              onClick={() => setShowSearch(true)}
              className="btn btn-spotify btn-lg"
              disabled={submitting}
            >
              {submitting ? 'Wird eingereicht…' : '🎵 Song auf Spotify suchen'}
            </button>
          ) : (
            <button onClick={handleSpotifyConnect} className="btn btn-spotify btn-lg">
              Mit Spotify verbinden
            </button>
          )}
        </div>
      )}

      {/* Who has submitted (anonymous count) */}
      <div className="card">
        <div className="section-title">Mitglieder</div>
        {group?.members?.map(uid => {
          const hasSubmitted = submissions.some(s => s.userId === uid)
          const name = group.memberNames?.[uid] || 'Anonym'
          return (
            <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <Avatar name={name} size={36} />
              <span style={{ flex: 1, fontSize: 14 }}>{name} {uid === user.uid && '(Du)'}</span>
              {hasSubmitted
                ? <span className="badge badge-green">✓ Eingereicht</span>
                : <span className="badge badge-dim">Ausstehend</span>
              }
            </div>
          )
        })}
      </div>

      {showSearch && <SpotifySearch onSelect={handleSelect} onClose={() => setShowSearch(false)} />}
    </div>
  )
}

// ─── Phase: Voting ───
function VotingPhase({ round, group, groupId, roundId }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [myVotes, setMyVotes] = useState({}) // submissionId -> points
  const [myComments, setMyComments] = useState({}) // submissionId -> comment
  const [existingVotes, setExistingVotes] = useState([]) // my existing vote docs
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const totalVotes = group?.votesPerMember || 3
  const usedVotes = Object.values(myVotes).reduce((a, b) => a + b, 0)
  const remainingVotes = totalVotes - usedVotes

  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('roundId', '==', roundId))
    return onSnapshot(q, snap => {
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [roundId])

  // Load existing votes
  useEffect(() => {
    const q = query(
      collection(db, 'votes'),
      where('roundId', '==', roundId),
      where('voterId', '==', user.uid)
    )
    getDocs(q).then(snap => {
      const votes = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setExistingVotes(votes)
      const vmap = {}
      const cmap = {}
      votes.forEach(v => {
        vmap[v.submissionId] = v.points
        cmap[v.submissionId] = v.comment || ''
      })
      setMyVotes(vmap)
      setMyComments(cmap)
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
      // Delete existing votes
      await Promise.all(existingVotes.map(v => deleteDoc(doc(db, 'votes', v.id))))

      // Write new votes
      const promises = Object.entries(myVotes).map(([subId, points]) => {
        if (points <= 0) return
        const sub = submissions.find(s => s.id === subId)
        return addDoc(collection(db, 'votes'), {
          roundId,
          groupId,
          voterId: user.uid,
          submissionId: subId,
          submitterUserId: sub?.userId,
          points,
          comment: myComments[subId] || '',
          createdAt: serverTimestamp(),
        })
      })
      await Promise.all(promises)

      // Update existing votes ref
      const q = query(collection(db, 'votes'), where('roundId', '==', roundId), where('voterId', '==', user.uid))
      const snap = await getDocs(q)
      setExistingVotes(snap.docs.map(d => ({ id: d.id, ...d.data() })))

      setSaved(true)
    } catch (err) {
      alert('Fehler beim Speichern: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  const mySubmission = submissions.find(s => s.userId === user.uid)
  const otherSubs = submissions.filter(s => s.userId !== user.uid)

  return (
    <div>
      <PlaylistButton round={round} roundId={roundId} submissions={submissions} />

      {/* Vote counter */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--accent2-dim)', borderColor: 'rgba(232,168,56,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--accent2)' }}>Deine Stimmen</span>
          <span style={{ fontSize: 24, fontFamily: 'Fraunces', color: 'var(--accent2)' }}>
            {remainingVotes} <span style={{ fontSize: 13 }}>verbleibend</span>
          </span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${(usedVotes / totalVotes) * 100}%`, background: 'var(--accent2)' }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
          Verteile deine {totalVotes} Stimmen auf die Songs. Du kannst mehrere Stimmen auf einen Song setzen.
        </p>
      </div>

      {/* Songs to vote on */}
      {otherSubs.length === 0 ? (
        <div className="empty-state">
          <p>Keine Songs zum Abstimmen.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {otherSubs.map(sub => (
            <div key={sub.id} className="card">
              <div className="track-card" style={{ marginBottom: 12, border: 'none', padding: 0, background: 'transparent' }}>
                {sub.albumArt && <img src={sub.albumArt} alt="" className="track-art" />}
                <div className="track-info">
                  <div className="track-name">{sub.trackName}</div>
                  <div className="track-artist">{sub.artistName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub.albumName}</div>
                </div>
              </div>

              {/* Vote controls */}
              <div className="vote-row" style={{ marginBottom: 12 }}>
                <div className="vote-counter">
                  <button
                    className="vote-btn"
                    onClick={() => removeVote(sub.id)}
                    disabled={!myVotes[sub.id]}
                  >−</button>
                  <span className="vote-number">{myVotes[sub.id] || 0}</span>
                  <button
                    className="vote-btn"
                    onClick={() => addVote(sub.id)}
                    disabled={remainingVotes <= 0}
                  >+</button>
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {myVotes[sub.id] ? `${myVotes[sub.id]} Stimme${myVotes[sub.id] !== 1 ? 'n' : ''}` : 'Keine Stimmen'}
                </span>
              </div>

              {/* Comment field */}
              <div>
                <label>Kommentar (optional)</label>
                <textarea
                  value={myComments[sub.id] || ''}
                  onChange={e => {
                    setMyComments(prev => ({ ...prev, [sub.id]: e.target.value }))
                    setSaved(false)
                  }}
                  placeholder="Was denkst du über diesen Song?"
                  rows={2}
                  style={{ fontSize: 13 }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* My submitted song */}
      {mySubmission && (
        <div style={{ marginTop: 16, opacity: 0.6 }}>
          <div className="section-title">Dein eingereichteter Song</div>
          <div className="track-card">
            {mySubmission.albumArt && <img src={mySubmission.albumArt} alt="" className="track-art" />}
            <div className="track-info">
              <div className="track-name">{mySubmission.trackName}</div>
              <div className="track-artist">{mySubmission.artistName}</div>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Du kannst nicht für deinen eigenen Song abstimmen.
          </p>
        </div>
      )}

      {/* Save button */}
      <div style={{ position: 'sticky', bottom: 'calc(var(--nav-height) + 8px)', marginTop: 20 }}>
        <button
          onClick={handleSave}
          className={`btn btn-full btn-lg ${saved ? 'btn-secondary' : 'btn-primary'}`}
          disabled={saving || usedVotes === 0}
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.5)' }}
        >
          {saving ? '…' : saved ? '✓ Gespeichert' : `Stimmen abgeben (${usedVotes}/${totalVotes})`}
        </button>
      </div>
    </div>
  )
}

// ─── Phase: Results ───
function ResultsPhase({ round, group, groupId, roundId }) {
  const { user } = useAuth()
  const [submissions, setSubmissions] = useState([])
  const [votes, setVotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'submissions'), where('roundId', '==', roundId))),
      getDocs(query(collection(db, 'votes'), where('roundId', '==', roundId))),
    ]).then(([subsSnap, votesSnap]) => {
      setSubmissions(subsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setVotes(votesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
  }, [roundId])

  const handleCreatePlaylist = async () => {
    if (!isSpotifyConnected()) {
      sessionStorage.setItem('spotify_return_to', window.location.pathname)
      initiateSpotifyAuth()
      return
    }
    setCreatingPlaylist(true)
    try {
      const spotifyUser = await getSpotifyUser()
      const playlist = await createPlaylist(
        spotifyUser.id,
        `Soundleague: ${round.prompt}`,
        `Playlist erstellt von Soundleague für die Runde "${round.prompt}"`
      )
      const sorted = [...submissions].sort((a, b) => {
        const aVotes = votes.filter(v => v.submissionId === a.id).reduce((s, v) => s + v.points, 0)
        const bVotes = votes.filter(v => v.submissionId === b.id).reduce((s, v) => s + v.points, 0)
        return bVotes - aVotes
      })
      await addTracksToPlaylist(playlist.id, sorted.map(s => s.trackUri))
      await updateDoc(doc(db, 'rounds', roundId), { playlistId: playlist.id })
      window.open(`https://open.spotify.com/playlist/${playlist.id}`, '_blank')
    } catch (err) {
      alert('Fehler: ' + err.message)
    } finally {
      setCreatingPlaylist(false)
    }
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>

  // Build results: submissions with total votes, sorted desc
  const results = submissions
    .map(sub => {
      const subVotes = votes.filter(v => v.submissionId === sub.id)
      const totalPoints = subVotes.reduce((s, v) => s + v.points, 0)
      return { ...sub, subVotes, totalPoints }
    })
    .sort((a, b) => b.totalPoints - a.totalPoints)

  return (
    <div>
      <PlaylistButton round={round} roundId={roundId} submissions={submissions} />

      {/* Results */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {results.map((sub, i) => {
          const isOwn = sub.userId === user.uid
          const commentsForThis = sub.subVotes.filter(v => v.comment)
          return (
            <div
              key={sub.id}
              className="card fade-in"
              style={{ animationDelay: `${i * 0.08}s`, borderColor: i === 0 ? 'rgba(232,168,56,0.4)' : 'var(--border)' }}
            >
              {/* Rank + Points */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 24, fontFamily: 'Fraunces' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 28, fontFamily: 'Fraunces', color: 'var(--accent)', lineHeight: 1 }}>
                    {sub.totalPoints}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>PUNKTE</div>
                </div>
              </div>

              {/* Track */}
              <div className="track-card" style={{ border: 'none', padding: 0, background: 'transparent', marginBottom: 12 }}>
                {sub.albumArt && <img src={sub.albumArt} alt="" className="track-art" />}
                <div className="track-info">
                  <div className="track-name">{sub.trackName}</div>
                  <div className="track-artist">{sub.artistName}</div>
                </div>
              </div>

              {/* Submitter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <Avatar name={sub.userName} size={28} />
                <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                  Eingereicht von <strong style={{ color: 'var(--text)' }}>{sub.userName}</strong>
                  {isOwn && ' (Du)'}
                </span>
              </div>

              {/* Who voted */}
              {sub.subVotes.length > 0 && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div className="section-title">Wer hat abgestimmt</div>
                  {sub.subVotes.map(vote => {
                    const voterName = group?.memberNames?.[vote.voterId] || 'Anonym'
                    return (
                      <div key={vote.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                        <Avatar name={voterName} size={28} />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <span style={{ fontSize: 13 }}>
                              <strong>{voterName}</strong>
                              {vote.voterId === user.uid && ' (Du)'}
                            </span>
                            <span className="badge badge-amber" style={{ fontSize: 10 }}>
                              {'♦'.repeat(vote.points)} {vote.points}pt
                            </span>
                          </div>
                          {vote.comment && (
                            <p style={{
                              fontSize: 13,
                              color: 'var(--text-dim)',
                              background: 'var(--surface2)',
                              borderRadius: 8,
                              padding: '6px 10px',
                              margin: 0,
                              fontStyle: 'italic',
                              lineHeight: 1.5,
                            }}>
                              "{vote.comment}"
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {sub.subVotes.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Keine Stimmen erhalten.
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Round Page ───
export default function RoundPage() {
  const { groupId, roundId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [round, setRound] = useState(null)
  const [group, setGroup] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubRound = onSnapshot(doc(db, 'rounds', roundId), snap => {
      if (snap.exists()) setRound({ id: snap.id, ...snap.data() })
      setLoading(false)
    })
    return unsubRound
  }, [roundId])

  useEffect(() => {
    getDoc(doc(db, 'groups', groupId)).then(snap => {
      if (snap.exists()) setGroup({ id: snap.id, ...snap.data() })
    })
  }, [groupId])

  // Auto-advance if deadline passed
  useEffect(() => {
    if (!round) return
    const now = new Date()
    if (round.status === 'submission' && round.submissionDeadline?.toDate?.() < now) {
      updateDoc(doc(db, 'rounds', roundId), { status: 'voting' })
    } else if (round.status === 'voting' && round.votingDeadline?.toDate?.() < now) {
      updateDoc(doc(db, 'rounds', roundId), { status: 'results' })
    }
  }, [round, roundId])

  const formatDeadline = (ts) => {
    if (!ts?.toDate) return ''
    return ts.toDate().toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    })
  }

  const statusInfo = {
    submission: { label: 'Einreichung läuft', badge: 'badge-green', deadline: round?.submissionDeadline },
    voting: { label: 'Abstimmung läuft', badge: 'badge-amber', deadline: round?.votingDeadline },
    results: { label: 'Runde beendet', badge: 'badge-dim', deadline: null },
  }

  if (loading) return <div className="loading-center"><div className="spinner" /></div>
  if (!round) return <div className="page"><p>Runde nicht gefunden.</p></div>

  const info = statusInfo[round.status] || {}

  return (
    <div className="page">
      {/* Back */}
      <button
        onClick={() => navigate(`/group/${groupId}`)}
        className="btn btn-ghost btn-sm"
        style={{ marginBottom: 16 }}
      >
        ← Gruppe
      </button>

      {/* Round header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span className={`badge ${info.badge}`}>{info.label}</span>
          {info.deadline && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              bis {formatDeadline(info.deadline)}
            </span>
          )}
        </div>
        <h1 style={{ fontSize: 32, lineHeight: 1.1 }}>{round.prompt}</h1>
        {round.description && (
          <p style={{ fontSize: 15, color: 'var(--text-dim)', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
            {round.description}
          </p>
        )}
        {group && (
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>{group.name}</p>
        )}
      </div>

      {/* Phase content */}
      {round.status === 'submission' && (
        <SubmissionPhase round={round} group={group} groupId={groupId} roundId={roundId} />
      )}
      {round.status === 'voting' && (
        <VotingPhase round={round} group={group} groupId={groupId} roundId={roundId} />
      )}
      {round.status === 'results' && (
        <ResultsPhase round={round} group={group} groupId={groupId} roundId={roundId} />
      )}
    </div>
  )
}
