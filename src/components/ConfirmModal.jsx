// Kleine Rückfrage als Modal (nutzt die vorhandenen .modal-Styles).
// Der "primäre" Button ist die Empfehlung (z.B. „Kommentar schreiben"),
// der "sekundäre" Button führt die Aktion trotzdem aus.
// Ein Tipp auf den Hintergrund zählt wie „primär" — so wird nie versehentlich abgegeben.
export default function ConfirmModal({
  title,
  message,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
}) {
  return (
    <div className="modal-overlay" onClick={onPrimary} style={{ zIndex: 300 }}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-header">
          <h3 style={{ fontSize: 20, color: '#F5F4FF' }}>{title}</h3>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6, marginBottom: 20 }}>
            {message}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={onPrimary} className="btn btn-primary btn-full">{primaryLabel}</button>
            <button onClick={onSecondary} className="btn btn-ghost btn-full">{secondaryLabel}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
