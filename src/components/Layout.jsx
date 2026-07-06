import { useState } from 'react'
import { Outlet, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useUserEmoji } from '../hooks/useUserEmoji'
import EmojiPickerModal from './EmojiPicker'
import InstallBanner from './InstallBanner'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { emoji, updateEmoji } = useUserEmoji()
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleSelectEmoji = async (newEmoji) => {
    await updateEmoji(newEmoji)
    setShowEmojiPicker(false)
  }

  const initial = (user?.displayName || '?')[0].toUpperCase()

  return (
    <div style={{ minHeight: '100dvh' }}>
      <header className="top-bar">
        <Link to="/" className="top-bar-brand">
          <img src="/favicon.svg" alt="" width={26} height={26} />
          <span>SoundLeague</span>
        </Link>

        <div className="top-bar-actions">
          <button
            className="top-bar-btn"
            onClick={() => setShowEmojiPicker(true)}
            title="Emoji ändern"
            aria-label="Emoji ändern"
          >
            {emoji ? (
              <span style={{ fontSize: 24, lineHeight: 1 }}>{emoji}</span>
            ) : (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
                color: '#000',
                fontFamily: 'Fraunces, serif',
              }}>
                {initial}
              </div>
            )}
          </button>

          <button
            className="top-bar-btn"
            onClick={handleLogout}
            title="Logout"
            aria-label="Logout"
          >
            🚪
          </button>
        </div>
      </header>

      <Outlet />

      <InstallBanner />

      {showEmojiPicker && (
        <EmojiPickerModal
          current={emoji}
          onSelect={handleSelectEmoji}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}
    </div>
  )
}
