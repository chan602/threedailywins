// ── PROFILE TAB ──────────────────────────────────────────
// Extracted from Home.jsx. All state and logic lives in Home;
// this component receives props and renders only.

import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'

function AccomplishmentIcon({ type }) {
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

function accomplishmentLabel(a) {
  if (a.type === 'challenge_completed') return `Completed: "${a.taskText}"`
  if (a.type === 'streak_milestone')    return `${a.streakCount}-day streak`
  if (a.type === 'three_win_day')       return `Three win day — ${a.date}`
  if (a.type === 'perfect_week')        return `Perfect week — ${a.weekKey}`
  return a.label || 'Achievement'
}

function timeAgo(ts) {
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

function KudosIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
      <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
    </svg>
  )
}

function AccomplishmentCard({ a, onKudos }) {
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
            style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
            onClick={() => onKudos(a)}
            title="Give kudos"
          >
            <KudosIcon />
          </button>
        </div>
      )}
    </div>
  )
}

function PillBox({ title, count, preview, children }) {
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

function AccomplishmentsSection({ accomplishments, onKudos }) {
  const milestones = (accomplishments || []).filter(a => a.type !== 'challenge_completed')
  const challenges = (accomplishments || []).filter(a => a.type === 'challenge_completed')

  return (
    <div className="profile-section">
      <p className="profile-section-title">Accomplishments</p>
      <p className="profile-section-sub" style={{ marginBottom: '0.75rem' }}>Milestones and completed challenges.</p>

      <PillBox title="Trophy Case" count={milestones.length} preview={milestones[0] ? accomplishmentLabel(milestones[0]) : null}>
        {milestones.length === 0
          ? <p className="empty-msg" style={{ padding: '0.25rem 0' }}>Hit streaks and three-win days to earn trophies.</p>
          : milestones.slice(0, 20).map(a => <AccomplishmentCard key={a.id} a={a} onKudos={onKudos} />)
        }
      </PillBox>

      <PillBox title="Challenges" count={challenges.length} preview={challenges[0] ? accomplishmentLabel(challenges[0]) : null}>
        {challenges.length === 0
          ? <p className="empty-msg" style={{ padding: '0.25rem 0' }}>Complete challenges from friends to earn cards here.</p>
          : challenges.slice(0, 20).map(a => <AccomplishmentCard key={a.id} a={a} onKudos={onKudos} />)
        }
      </PillBox>
    </div>
  )
}

export default function ProfileTab({
  user,
  userProfile,
  streak,
  accomplishments,
  onKudos,
  editBio,
  setEditBio,
  bioSaved,
  saveBio,
  editPhysical,
  setEditPhysical,
  editMental,
  setEditMental,
  editSpiritual,
  setEditSpiritual,
  evalMode,
  setEvalMode,
  defsLoading,
  defsSaved,
  saveWinDefinitions,
  visTodo,
  setVisTodo,
  visStats,
  setVisStats,
  visSaved,
  setVisSaved,
  saveVisibility,
  theme,
  setTheme,
  dataActionSuccess,
  dataActionError,
  setDataActionError,
  setDataActionSuccess,
  clearArchiveConfirm,
  setClearArchiveConfirm,
  clearArchiveLoading,
  clearArchive,
  resetConfirm,
  setResetConfirm,
  resetLoading,
  resetAllData,
  deleteConfirm,
  setDeleteConfirm,
  deleteLoading,
  deleteError,
  setDeleteError,
  deleteAccount,
  isPro,
  grantPro,
  proLoading,
}) {
  return (
    <div className="profile-screen">

      {/* Avatar + identity */}
      <div className="profile-identity">
        <div className="profile-avatar">
          {userProfile?.photoURL
            ? <img src={userProfile.photoURL} alt="avatar" className="profile-avatar-img" />
            : <span className="profile-avatar-initial">{(userProfile?.username || user?.email || '?')[0].toUpperCase()}</span>
          }
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <p className="profile-username" style={{ margin: 0 }}>@{userProfile?.username || '—'}</p>
            {isPro && (
              <span style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.06em', color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '0.1rem 0.4rem' }}>PRO</span>
            )}
          </div>
          <p className="profile-email">{user?.email}</p>
          {!isPro && (
            <button
              className="profile-cancel-btn"
              style={{ marginTop: '0.4rem', fontSize: '0.75rem', padding: '0.25rem 0.75rem' }}
              onClick={grantPro}
              disabled={proLoading}
            >
              {proLoading ? 'Updating…' : 'Activate Pro'}
            </button>
          )}
          {isPro && (
            <button
              className="profile-cancel-btn"
              style={{ marginTop: '0.4rem', fontSize: '0.75rem', padding: '0.25rem 0.75rem', opacity: 0.6 }}
              onClick={grantPro}
              disabled={proLoading}
            >
              {proLoading ? 'Updating…' : 'Deactivate Pro'}
            </button>
          )}
        </div>
      </div>

      {/* Streak summary */}
      <div className="profile-stats-row">
        <div className="profile-stat">
          <span className="profile-stat-val">{streak.current}</span>
          <span className="profile-stat-label">Current streak</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-val">{streak.best}</span>
          <span className="profile-stat-label">Best streak</span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat-val">{streak.total}</span>
          <span className="profile-stat-label">Total wins</span>
        </div>
      </div>

      {/* Trophy Case + Challenges */}
      <AccomplishmentsSection accomplishments={accomplishments} onKudos={onKudos} />

      {/* Bio */}
      <div className="profile-section">
        <p className="profile-section-title">About</p>
        <p className="profile-section-sub">A short bio shown on your public profile.</p>
        <textarea
          className="profile-def-input"
          value={editBio}
          onChange={e => setEditBio(e.target.value.slice(0, 1000))}
          rows={3}
          placeholder="Tell people about yourself..."
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>{editBio.length}/1000</span>
          <button className="profile-save-btn" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={saveBio}>
            {bioSaved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>

      {/* Win definitions */}
      <div className="profile-section">
        <p className="profile-section-title">Win Definitions</p>
        <p className="profile-section-sub">Used by Claude to evaluate your daily wins.</p>

        <label className="profile-def-label">
          <span className="profile-def-dot physical" />Physical
        </label>
        <textarea
          className="profile-def-input"
          value={editPhysical}
          onChange={e => setEditPhysical(e.target.value)}
          rows={2}
          placeholder="e.g. Any workout, climb, or run"
        />
        <label className="profile-def-label">
          <span className="profile-def-dot mental" />Mental
        </label>
        <textarea
          className="profile-def-input"
          value={editMental}
          onChange={e => setEditMental(e.target.value)}
          rows={2}
          placeholder="e.g. Study session, deep work"
        />
        <label className="profile-def-label">
          <span className="profile-def-dot spiritual" />Spiritual
        </label>
        <textarea
          className="profile-def-input"
          value={editSpiritual}
          onChange={e => setEditSpiritual(e.target.value)}
          rows={2}
          placeholder="e.g. Journal, meditate, sleep early"
        />

        <p className="profile-def-label" style={{ marginTop: '1rem' }}>Evaluation strictness</p>
        <p className="profile-section-sub" style={{ marginBottom: '0.5rem' }}>
          {evalMode === 'broad'
            ? 'Broad — Claude gives benefit of the doubt on close calls.'
            : 'Narrow — Claude only awards wins that clearly match your definitions.'}
        </p>
        <div className="eval-mode-toggle">
          <button className={`eval-mode-btn ${evalMode === 'broad' ? 'active' : ''}`} onClick={() => setEvalMode('broad')}>Broad</button>
          <button className={`eval-mode-btn ${evalMode === 'narrow' ? 'active' : ''}`} onClick={() => setEvalMode('narrow')}>Narrow</button>
        </div>

        <button className="profile-save-btn" onClick={saveWinDefinitions} disabled={defsLoading}>
          {defsLoading ? 'Saving…' : defsSaved ? 'Saved!' : 'Save definitions'}
        </button>
      </div>

      {/* Visibility settings */}
      <div className="profile-section">
        <p className="profile-section-title">Visibility</p>
        <p className="profile-section-sub">Control what others can see on your profile.</p>

        <div className="vis-row">
          <div className="vis-row-left">
            <span className="vis-label">Todo list</span>
            <span className="vis-desc">Today's tasks on your profile</span>
          </div>
          <select
            className="vis-select"
            value={visTodo}
            onChange={e => {
              setVisTodo(e.target.value)
              setVisSaved(false)
              saveVisibility(e.target.value, visStats)
            }}
          >
            <option value="public">Public</option>
            <option value="friends">Friends</option>
            <option value="private">Private</option>
          </select>
        </div>

        <div className="vis-row">
          <div className="vis-row-left">
            <span className="vis-label">Stats</span>
            <span className="vis-desc">Streak and win counts</span>
          </div>
          <select
            className="vis-select"
            value={visStats}
            onChange={e => {
              setVisStats(e.target.value)
              setVisSaved(false)
              saveVisibility(visTodo, e.target.value)
            }}
          >
            <option value="public">Public</option>
            <option value="friends">Friends</option>
            <option value="private">Private</option>
          </select>
        </div>

        {visSaved && <p className="vis-saved">Saved!</p>}
      </div>

      {/* Theme toggle */}
      <div className="profile-section">
        <p className="profile-section-title">Appearance</p>
        <div className="theme-toggle-row">
          <div className="vis-row-left">
            <span className="vis-label">Theme</span>
            <span className="vis-desc">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
          </div>
          <button
            className={`theme-toggle-btn ${theme === 'light' ? 'light' : ''}`}
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          >
            <span className="theme-toggle-thumb" />
          </button>
        </div>
      </div>

      {/* Sign out */}
      <div className="profile-section">
        <button className="profile-signout-btn" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>

      {/* Danger zone */}
      <div className="profile-section profile-danger-zone">
        <p className="profile-section-title danger">Danger zone</p>

        {dataActionSuccess && <p className="profile-save-msg">{dataActionSuccess}</p>}
        {dataActionError && <p className="eval-error">{dataActionError}</p>}

        {/* Clear Archive */}
        {!clearArchiveConfirm ? (
          <button className="profile-danger-btn" onClick={() => {
            setClearArchiveConfirm(true)
            setResetConfirm(false)
            setDataActionError('')
            setDataActionSuccess('')
          }}>
            Clear archive
          </button>
        ) : (
          <div className="delete-confirm-box">
            <p className="delete-confirm-text">This deletes all archived days, weeks, and win evaluations. Tasks and streak are kept. Cannot be undone.</p>
            <div className="delete-confirm-actions">
              <button className="profile-delete-btn" onClick={clearArchive} disabled={clearArchiveLoading}>
                {clearArchiveLoading ? 'Clearing…' : 'Yes, clear archive'}
              </button>
              <button className="profile-cancel-btn" onClick={() => { setClearArchiveConfirm(false); setDataActionError('') }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Reset All Data */}
        {!resetConfirm ? (
          <button className="profile-danger-btn" style={{ marginTop: '0.5rem' }} onClick={() => {
            setResetConfirm(true)
            setClearArchiveConfirm(false)
            setDataActionError('')
            setDataActionSuccess('')
          }}>
            Reset all data
          </button>
        ) : (
          <div className="delete-confirm-box">
            <p className="delete-confirm-text">This deletes all tasks, archive, win evaluations, streak, and leaderboard entry. Your account is kept. Cannot be undone.</p>
            <div className="delete-confirm-actions">
              <button className="profile-delete-btn" onClick={resetAllData} disabled={resetLoading}>
                {resetLoading ? 'Resetting…' : 'Yes, reset all data'}
              </button>
              <button className="profile-cancel-btn" onClick={() => { setResetConfirm(false); setDataActionError('') }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Delete Account */}
        {!deleteConfirm ? (
          <button className="profile-delete-btn" style={{ marginTop: '0.5rem' }} onClick={() => setDeleteConfirm(true)}>
            Delete account
          </button>
        ) : (
          <div className="delete-confirm-box">
            <p className="delete-confirm-text">This permanently deletes your account and all data. This cannot be undone.</p>
            {deleteError && <p className="eval-error">{deleteError}</p>}
            <div className="delete-confirm-actions">
              <button className="profile-delete-btn" onClick={deleteAccount} disabled={deleteLoading}>
                {deleteLoading ? 'Deleting…' : 'Yes, delete my account'}
              </button>
              <button className="profile-cancel-btn" onClick={() => { setDeleteConfirm(false); setDeleteError('') }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
