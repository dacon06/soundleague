// EmojiPicker - a grid of curated emojis to choose from
const EMOJIS = [
  // Music
  '🎵', '🎸', '🎹', '🥁', '🎺', '🎷', '🎻', '🎤', '🎧', '🎼',
  // Animals
  '🦊', '🐼', '🐨', '🦁', '🐯', '🐻', '🐺', '🦝', '🐸', '🦋',
  '🐙', '🦀', '🐠', '🦜', '🦚', '🦩', '🐧', '🦦', '🦥', '🐝',
  // Food & Drinks
  '🍕', '🍣', '🌮', '🍜', '🧇', '🍩', '🍦', '🧋', '☕', '🍺',
  // Nature
  '🌵', '🌸', '🌊', '⛰️', '🌙', '⭐', '🌈', '🔥', '❄️', '⚡',
  // Objects
  '🚀', '🎮', '📷', '🎨', '📚', '🏆', '💎', '🔮', '🎭', '🎪',
  // Faces & People
  '😎', '🤖', '👾', '🧙', '🦸', '🧛', '🧜', '🧝', '🤠', '🥷',
  // Sports
  '⚽', '🏀', '🎾', '🏄', '🧗', '🤸', '⛷️', '🏋️', '🤺', '🎯',
]

export default function EmojiPickerModal({ current, onSelect, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 22 }}>Dein Emoji wählen</h3>
          <button onClick={onClose} className="btn btn-ghost btn-sm">✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16 }}>
            Dein Emoji erscheint überall wo du in der App sichtbar bist.
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 1fr)',
            gap: 8,
            maxHeight: 320,
            overflowY: 'auto',
          }}>
            {EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => onSelect(emoji)}
                style={{
                  background: current === emoji ? 'var(--accent-dim)' : 'var(--surface2)',
                  border: current === emoji ? '2px solid var(--accent)' : '2px solid var(--border)',
                  borderRadius: 10,
                  padding: '8px 4px',
                  fontSize: 24,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  lineHeight: 1,
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
