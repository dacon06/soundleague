// Avatar component - shows user's chosen emoji or initial letter as fallback
export default function Avatar({ name, uid, emoji, size = 36 }) {
  if (emoji) {
    return (
      <div style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--surface2)',
        border: '2px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.52,
        flexShrink: 0,
        userSelect: 'none',
      }}>
        {emoji}
      </div>
    )
  }

  // Fallback: initial letter
  const initial = (name || '?')[0].toUpperCase()
  const colors = ['#1DB954', '#E8A838', '#7C3AED', '#2563EB', '#DC2626', '#059669', '#D97706']
  const colorIndex = (name || '?').charCodeAt(0) % colors.length
  const bg = colors[colorIndex]

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.4,
      fontWeight: 700,
      color: '#000',
      fontFamily: 'Fraunces, serif',
      flexShrink: 0,
      userSelect: 'none',
      border: '2px solid rgba(0,0,0,0.1)',
    }}>
      {initial}
    </div>
  )
}
