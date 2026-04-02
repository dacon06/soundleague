import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { login, register, loginWithGoogle } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        if (!name.trim()) { setError('Bitte gib einen Namen ein.'); setLoading(false); return }
        await register(email, password, name.trim())
      } else {
        await login(email, password)
      }
      navigate('/')
    } catch (err) {
      const msgs = {
        'auth/user-not-found': 'Kein Account mit dieser E-Mail gefunden.',
        'auth/wrong-password': 'Falsches Passwort.',
        'auth/email-already-in-use': 'Diese E-Mail ist bereits registriert.',
        'auth/weak-password': 'Passwort muss mindestens 6 Zeichen haben.',
        'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
        'auth/invalid-credential': 'E-Mail oder Passwort falsch.',
      }
      setError(msgs[err.code] || err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
      navigate('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
    }}>
      {/* Logo */}
      <div style={{ marginBottom: 40, textAlign: 'center' }}>
        <div style={{
          width: 72,
          height: 72,
          borderRadius: '50%',
          background: 'conic-gradient(from 180deg, #1DB954, #E8A838, #1DB954)',
          margin: '0 auto 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 40px rgba(29,185,84,0.3)',
        }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--bg)',
          }} />
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 300, letterSpacing: '-0.03em' }}>
          Soundleague
        </h1>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 6 }}>
          Musik teilen. Abstimmen. Gewinnen.
        </p>
      </div>

      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Tab switcher */}
        <div className="tabs" style={{ marginBottom: 24 }}>
          <button
            className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); setError('') }}
          >
            Anmelden
          </button>
          <button
            className={`tab-btn ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); setError('') }}
          >
            Registrieren
          </button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Dein Anzeigename"
                autoComplete="name"
                required
              />
            </div>
          )}
          <div className="form-group">
            <label>E-Mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@beispiel.de"
              autoComplete="email"
              required
            />
          </div>
          <div className="form-group">
            <label>Passwort</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Mind. 6 Zeichen' : '••••••••'}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-full btn-lg"
            disabled={loading}
            style={{ marginTop: 8 }}
          >
            {loading ? '…' : mode === 'login' ? 'Anmelden' : 'Account erstellen'}
          </button>
        </form>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          margin: '20px 0',
          color: 'var(--text-muted)',
          fontSize: 12,
        }}>
          <hr style={{ flex: 1, margin: 0 }} />
          oder
          <hr style={{ flex: 1, margin: 0 }} />
        </div>

        <button
          onClick={handleGoogle}
          className="btn btn-secondary btn-full btn-lg"
          disabled={loading}
          style={{ gap: 10 }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Mit Google fortfahren
        </button>
      </div>
    </div>
  )
}
