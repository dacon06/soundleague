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
        </div>
      </div>
    </div>
  )
}
