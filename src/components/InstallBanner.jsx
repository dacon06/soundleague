import { useState, useEffect } from 'react'
import { Capacitor } from '@capacitor/core'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [prompt, setPrompt] = useState(null)
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('pwa_dismissed') === '1'
  )

  useEffect(() => {
    if (dismissed) return
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (Capacitor.isNativePlatform()) return // läuft schon als App

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream
    setIsIOS(ios)

    // Capture install prompt if available
    const handler = (e) => {
      e.preventDefault()
      setPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)

    // Show banner after 2 seconds regardless
    const timer = setTimeout(() => setShow(true), 2000)

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
      clearTimeout(timer)
    }
  }, [dismissed])

  const handleInstall = async () => {
    if (prompt) {
      prompt.prompt()
      const { outcome } = await prompt.userChoice
      if (outcome === 'accepted') { setShow(false); return }
    } else {
      // Fallback: show browser instructions
      alert('Klicke in Chrome oben rechts auf ⋮ → "App installieren" oder "Zum Startbildschirm hinzufügen"')
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa_dismissed', '1')
    setDismissed(true)
    setShow(false)
  }

  if (!show || dismissed) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(env(safe-area-inset-bottom) + 16px)',
      left: 12, right: 12,
      zIndex: 150,
      background: 'var(--surface)',
      border: '1px solid var(--border2)',
      borderRadius: 'var(--radius-lg)',
      padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: 'var(--accent-dim)',
          border: '1px solid rgba(124,106,245,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24,
        }}>
          🎵
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#F5F4FF', marginBottom: 2 }}>
            Als App installieren
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
            {isIOS
              ? '↑ Teilen → "Zum Home-Bildschirm"'
              : 'Schnellzugriff ohne Browser'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <button onClick={handleDismiss} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1
          }}>✕</button>
          {!isIOS && (
            <button onClick={handleInstall} className="btn btn-primary btn-sm">
              Installieren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
