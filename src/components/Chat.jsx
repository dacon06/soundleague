import { useState, useEffect, useRef } from 'react'
import { db } from '../firebase'
import { useAuth } from '../contexts/AuthContext'
import {
  collection, query, orderBy, limit, onSnapshot,
  addDoc, serverTimestamp
} from 'firebase/firestore'

function Avatar({ name }) {
  return <div className="avatar avatar-sm">{(name || '?')[0].toUpperCase()}</div>
}

export default function Chat({ groupId }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    const q = query(
      collection(db, 'groups', groupId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    )
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
  }, [groupId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (e) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await addDoc(collection(db, 'groups', groupId, 'messages'), {
        text: text.trim(),
        userId: user.uid,
        userName: user.displayName || 'Anonym',
        createdAt: serverTimestamp(),
      })
      setText('')
    } finally {
      setSending(false)
    }
  }

  const formatTime = (ts) => {
    if (!ts?.toDate) return ''
    const d = ts.toDate()
    return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>
            Noch keine Nachrichten — fang an zu chatten!
          </p>
        )}
        {messages.map(msg => {
          const isOwn = msg.userId === user.uid
          return (
            <div key={msg.id} className={`chat-msg ${isOwn ? 'chat-msg-own' : ''}`}>
              {!isOwn && <Avatar name={msg.userName} />}
              <div style={{ maxWidth: '75%' }}>
                {!isOwn && (
                  <div className="chat-name">
                    {msg.userName} · {formatTime(msg.createdAt)}
                  </div>
                )}
                <div className="chat-bubble">{msg.text}</div>
                {isOwn && (
                  <div className="chat-name" style={{ textAlign: 'right', marginTop: 3 }}>
                    {formatTime(msg.createdAt)}
                  </div>
                )}
              </div>
              {isOwn && <Avatar name={msg.userName} />}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="chat-input-row">
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Nachricht schreiben…"
          maxLength={500}
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!text.trim() || sending}
          style={{ flexShrink: 0 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/>
          </svg>
        </button>
      </form>
    </div>
  )
}
