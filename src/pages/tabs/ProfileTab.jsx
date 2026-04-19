// ── PROFILE TAB ──────────────────────────────────────────
// Extracted from Home.jsx. All state and logic lives in Home;
// this component receives props and renders only.

import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'

function AccomplishmentIcon({ type }) {
  if (type === 'challenge_completed') return <span style={{ fontSize: 16 }}>⚡</span>
  if (type === 'streak_milestone')    return <span style={{ fontSize: 16 }}>🔥</span>
  if (type === 'three_win_day')       return <span style={{ fontSize: 16 }}>⭐</span>
  if (type === 'perfect_week')        return <span style={{ fontSize: 16 }}>🏆</span>
  return <span style={{ fontSize: 16 }}>✓</span>
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
        <div>
          <p className="profile-username">@{userProfile?.username || '—'}</p>
          <p className="profile-email">{user?.email}</p>
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

      {/* Accomplishments */}
      <div className="profile-section">
        <p className="profile-section-title">Accomplishments</p>
        <p className="profile-section-sub">Recent milestones and completed challenges.</p>
        {(!accomplishments || accomplishments.length === 0) ? (
          <p className="empty-msg" style={{ marginTop: '0.5rem' }}>Nothing yet — complete challenges and hit streaks to earn accomplishments.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {accomplishments.slice(0, 20).map(a => (
              <div key={a.id} style={{
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                  {(a.kudosCount > 0) && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginRight: '0.1rem' }}>
                      👍 {a.kudosCount}
                    </span>
                  )}
                  {onKudos && (
                    <button
                      className="profile-cancel-btn"
                      style={{ marginLeft: '0.25rem', flexShrink: 0, fontSize: '1rem', padding: '0.25rem 0.6rem' }}
                      onClick={() => onKudos(a)}
                      title="Give kudos"
                    >👍</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
