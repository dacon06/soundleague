import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
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

        <div className="nav-item">
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
          <span style={{ fontSize: 10 }}>{user?.displayName?.split(' ')[0] || 'Profil'}</span>
        </div>

        <button onClick={handleLogout} className="nav-item" style={{ border: 'none', cursor: 'pointer' }}>
          <span style={{ fontSize: 22 }}>🚪</span>
          Logout
        </button>
      </nav>
    </div>
  )
}
