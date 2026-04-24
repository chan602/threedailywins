// ── SHARED ACCOMPLISHMENTS COMPONENTS ────────────────────
// Used by ProfileTab (own profile) and UserProfile (public profile)

import { useState } from 'react'

export function accomplishmentLabel(a) {
  if (a.type === 'challenge_completed') return `Completed: "${a.taskText}"`
  if (a.type === 'streak_milestone')    return `${a.streakCount}-day streak`
  if (a.type === 'three_win_day')       return `Three win day — ${a.date}`
  if (a.type === 'perfect_week')        return `Perfect week — ${a.weekKey}`
  return a.label || 'Achievement'
}

export function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(diff / 3600000)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(diff / 86400000)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function AccomplishmentIcon({ type }) {
  if (type === 'challenge_completed') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  )
  if (type === 'streak_milestone') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" fill="rgba(245,158,11,0.15)"/>
      <path d="M12 6v6l4 2"/>
    </svg>
  )
  if (type === 'three_win_day') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
  if (type === 'perfect_week') return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}

export function KudosIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
    </svg>
  )
}

export function AccomplishmentCard({ a, onKudos, kudosSent }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: 'var(--bg-card)', borderRadius: 10, padding: '0.6rem 0.75rem',
      border: '1px solid var(--border)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
        <AccomplishmentIcon type={a.type} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {accomplishmentLabel(a)}
          </p>
          {a.challengerName && (
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-faint)' }}>from @{a.challengerName}</p>
          )}
          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-faint)' }}>{timeAgo(a.createdAt)}</p>
        </div>
      </div>
      {onKudos && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
          {(a.kudosCount > 0) && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>{a.kudosCount}</span>
          )}
          <button
            className="profile-cancel-btn"
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem', opacity: kudosSent ? 0.4 : 1 }}
            onClick={() => onKudos(a)}
            disabled={!!kudosSent}
            title={kudosSent ? 'Kudos sent!' : 'Give kudos'}
          >
            <KudosIcon />
          </button>
        </div>
      )}
    </div>
  )
}

export function PillBox({ title, count, preview, children }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: open ? '10px 10px 0 0' : 10, padding: '0.6rem 0.75rem',
          cursor: 'pointer', color: 'var(--text)', textAlign: 'left'
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{title}</span>
          {!open && preview && (
            <p style={{ margin: '0.1rem 0 0', fontSize: '0.72rem', color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {preview}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0, marginLeft: '0.5rem' }}>
          {count > 0 && (
            <span style={{ fontSize: '0.72rem', background: 'var(--accent-light)', color: 'var(--accent-text)', borderRadius: 20, padding: '0.1rem 0.5rem' }}>{count}</span>
          )}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </button>
      {open && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 10px 10px', padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// AccomplishmentsSection — used identically in ProfileTab and UserProfile
// onKudos: function(accomplishment) — pass null/undefined to hide kudos buttons (own profile)
// kudosSent: { [id]: bool } — tracks sent state
export function AccomplishmentsSection({ accomplishments, onKudos, kudosSent = {} }) {
  const milestones = (accomplishments || []).filter(a => a.type !== 'challenge_completed')
  const challenges = (accomplishments || []).filter(a => a.type === 'challenge_completed')

  return (
    <div className="profile-section">
      <p className="profile-section-title">Accomplishments</p>
      <p className="profile-section-sub" style={{ marginBottom: '0.75rem' }}>Milestones and completed challenges.</p>

      <PillBox title="Trophy Case" count={milestones.length} preview={milestones[0] ? accomplishmentLabel(milestones[0]) : null}>
        {milestones.length === 0
          ? <p className="empty-msg" style={{ padding: '0.25rem 0' }}>Hit streaks and three-win days to earn trophies.</p>
          : milestones.slice(0, 20).map(a => (
              <AccomplishmentCard key={a.id} a={a} onKudos={onKudos} kudosSent={kudosSent[a.id]} />
            ))
        }
      </PillBox>

      <PillBox title="Challenges" count={challenges.length} preview={challenges[0] ? accomplishmentLabel(challenges[0]) : null}>
        {challenges.length === 0
          ? <p className="empty-msg" style={{ padding: '0.25rem 0' }}>Complete challenges from friends to earn cards here.</p>
          : challenges.slice(0, 20).map(a => (
              <AccomplishmentCard key={a.id} a={a} onKudos={onKudos} kudosSent={kudosSent[a.id]} />
            ))
        }
      </PillBox>
    </div>
  )
}
