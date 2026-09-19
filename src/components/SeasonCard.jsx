import { useState } from 'react'
import UserAvatar from './UserAvatar'

// Zeigt eine abgeschlossene Saison aus der Collection `seasons`:
// Champion(s) oben, per Klick aufklappbar: Endstand und Rundensieger.
export default function SeasonCard({ season, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const champions = season.champions || []
  const standings = season.standings || []
  const rounds = season.rounds || []
  const closedAt = season.closedAt?.toDate?.()

  // Bei Punktgleichheit teilen sich Nutzer den Rang
  const rankOf = (i) => standings.findIndex(s => s.points === standings[i].points)
  const medal = (rank) => (rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : rank + 1)

  return (
    <div className="card" style={{ borderColor: champions.length ? 'rgba(232,168,56,0.4)' : 'var(--border2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Saison {season.seasonNumber}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {season.roundCount} Runden{closedAt ? ` · beendet am ${closedAt.toLocaleDateString('de-DE')}` : ''}
        </span>
      </div>

      {champions.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: '12px 0 0' }}>
          Kein Champion — in dieser Saison wurden keine Stimmen vergeben.
        </p>
      ) : (
        champions.map(c => (
          <div key={c.userId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14 }}>
            <span style={{ fontSize: 28 }}>🏆</span>
            <UserAvatar uid={c.userId} name={c.name} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontFamily: 'Fraunces', fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                {champions.length > 1 ? 'Geteilter Sieg' : 'Champion'}
              </div>
            </div>
            <div style={{ fontSize: 22, fontFamily: 'Fraunces', color: 'var(--accent)' }}>
              {c.points}<span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 3 }}>pts</span>
            </div>
          </div>
        ))
      )}

      <button onClick={() => setOpen(o => !o)} className="btn btn-ghost btn-sm" style={{ marginTop: 14 }}>
        {open ? 'Details ausblenden' : 'Endstand & Rundensieger'}
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          {standings.length > 0 && (
            <>
              <div className="section-title">Endstand</div>
              {standings.map((s, i) => (
                <div key={s.userId} className="leaderboard-row">
                  <div className={`leaderboard-rank ${rankOf(i) < 3 ? 'top' : ''}`}>{medal(rankOf(i))}</div>
                  <UserAvatar uid={s.userId} name={s.name} size={30} />
                  <div style={{ flex: 1, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 16, fontFamily: 'Fraunces', color: 'var(--accent)' }}>{s.points}</div>
                </div>
              ))}
            </>
          )}

          {rounds.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div className="section-title">Rundensieger</div>
              {rounds.map((r, i) => (
                <div key={r.roundId} style={{ padding: '8px 0', borderBottom: i < rounds.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                    Runde {i + 1} · {r.prompt}
                  </div>
                  {r.winners?.length ? (
                    r.winners.map(w => (
                      <div key={w.userId + w.songTitle} style={{ fontSize: 13 }}>
                        <strong>{w.name}</strong>
                        {w.songTitle && <span style={{ color: 'var(--text-dim)' }}> — {w.songTitle}</span>}
                        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · {r.points} pts</span>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Keine Stimmen vergeben</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
