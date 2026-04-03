// Illustrated avatars from DiceBear — consistent per user name/id
// Docs: https://www.dicebear.com/styles/adventurer

export default function Avatar({ name, uid, size = 36 }) {
  const seed = encodeURIComponent(uid || name || 'unknown')
  const url = `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=1DB954,E8A838,7C3AED,2563EB,DC2626&backgroundType=solid`

  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: '50%',
      overflow: 'hidden',
      flexShrink: 0,
      background: 'var(--surface2)',
      border: '2px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <img
        src={url}
        alt={name || 'Avatar'}
        width={size}
        height={size}
        style={{ display: 'block' }}
        loading="lazy"
        onError={e => {
          // Fallback to initial letter if DiceBear fails
          e.target.style.display = 'none'
          e.target.parentNode.style.background = 'linear-gradient(135deg, var(--accent), var(--accent2))'
          e.target.parentNode.innerHTML = `<span style="font-size:${Math.round(size * 0.4)}px;font-family:Fraunces,serif;font-weight:600;color:#000">${(name||'?')[0].toUpperCase()}</span>`
        }}
      />
    </div>
  )
}
