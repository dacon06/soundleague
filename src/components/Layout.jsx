import { useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
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
      <Outlet />

      <nav className="bottom-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span style={{ fontSize: 22 }}>🏠</span>
          Gruppen
        </NavLink>

        <button
          className="nav-item"
          style={{ border: 'none', cursor: 'pointer' }}
          onClick={() => setShowEmojiPicker(true)}
        >
          {emoji ? (
            <span style={{ fontSize: 26, lineHeight: 1 }}>{emoji}</span>
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
          <span style={{ fontSize: 10 }}>{user?.displayName?.split(' ')[0] || 'Profil'}</span>
        </button>

        <button onClick={handleLogout} className="nav-item" style={{ border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>🚪</span>
          Logout
        </button>
      </nav>

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
