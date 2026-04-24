// ── PROFILE TAB ──────────────────────────────────────────
// Extracted from Home.jsx. All state and logic lives in Home;
// this component receives props and renders only.

import { useState } from 'react'
import { signOut } from 'firebase/auth'
import { auth } from '../../firebase'
import { PillBox, AccomplishmentsSection } from '../../components/AccomplishmentsSection'

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
  visArchive,
  setVisArchive,
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
  autoSortCompleted,
  setAutoSortCompleted,
  saveAutoSort,
  emailNotifications,
  setEmailNotifications,
  saveEmailNotifications,
}) {
  const [showSettings, setShowSettings] = useState(false)

  // ── SETTINGS VIEW ──────────────────────────────────────
  if (showSettings) {
    return (
      <div className="profile-screen">

        {/* Header */}
        <div className="profile-settings-header">
          <button className="profile-settings-back" onClick={() => setShowSettings(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
          <span className="profile-settings-title">Settings</span>
        </div>

        {/* About */}
        <PillBox
          title="About"
          preview={editBio.trim().slice(0, 60) || 'Add a short bio'}
        >
          <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
            <textarea
              className="profile-def-input"
              value={editBio}
              onChange={e => setEditBio(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="Tell people about yourself..."
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>{editBio.length}/1000</span>
              <button className="profile-save-btn" style={{ width: 'auto', padding: '0.5rem 1rem', marginTop: 0 }} onClick={saveBio}>
                {bioSaved ? 'Saved!' : 'Save'}
              </button>
            </div>
          </div>
        </PillBox>

        {/* Win Definitions */}
        <PillBox
          title="Win Definitions"
          preview="Physical · Mental · Spiritual"
        >
          <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
            <p className="profile-section-sub" style={{ marginTop: 0 }}>Used by Claude to evaluate your daily wins.</p>

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
        </PillBox>

        {/* Visibility */}
        <PillBox
          title="Visibility"
          preview={`Todo: ${visTodo} · Stats: ${visStats} · Archive: ${visArchive}`}
        >
          <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
            <p className="profile-section-sub" style={{ marginTop: 0 }}>Control what others can see on your profile.</p>

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
                  saveVisibility(e.target.value, visStats, visArchive)
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
                  saveVisibility(visTodo, e.target.value, visArchive)
                }}
              >
                <option value="public">Public</option>
                <option value="friends">Friends</option>
                <option value="private">Private</option>
              </select>
            </div>

            <div className="vis-row" style={{ borderBottom: 'none' }}>
              <div className="vis-row-left">
                <span className="vis-label">Archive</span>
                <span className="vis-desc">Past days and win history</span>
              </div>
              <select
                className="vis-select"
                value={visArchive}
                onChange={e => {
                  setVisArchive(e.target.value)
                  setVisSaved(false)
                  saveVisibility(visTodo, visStats, e.target.value)
                }}
              >
                <option value="public">Public</option>
                <option value="friends">Friends</option>
                <option value="private">Private</option>
              </select>
            </div>

            {visSaved && <p className="vis-saved">Saved!</p>}
          </div>
        </PillBox>

        {/* Customization */}
        <PillBox
          title="Customization"
          preview="Auto-sort, email notifications, task behavior"
        >
          <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
            <div className="theme-toggle-row" style={{ paddingTop: 0 }}>
              <div className="vis-row-left">
                <span className="vis-label">Auto-sort completed</span>
                <span className="vis-desc">Completed tasks move to the bottom of your list</span>
              </div>
              <button
                className={`theme-toggle-btn ${autoSortCompleted ? 'light' : ''}`}
                onClick={() => {
                  const v = !autoSortCompleted
                  setAutoSortCompleted(v)
                  saveAutoSort(v)
                }}
              >
                <span className="theme-toggle-thumb" />
              </button>
            </div>
            <div className="theme-toggle-row" style={{ borderTop: '0.5px solid var(--border-light)', marginTop: '0.5rem', paddingTop: '0.75rem' }}>
              <div className="vis-row-left">
                <span className="vis-label">Email notifications</span>
                <span className="vis-desc">Get emailed when you receive challenges or kudos</span>
              </div>
              <button
                className={`theme-toggle-btn ${emailNotifications ? 'light' : ''}`}
                onClick={() => {
                  const v = !emailNotifications
                  setEmailNotifications(v)
                  saveEmailNotifications(v)
                }}
              >
                <span className="theme-toggle-thumb" />
              </button>
            </div>
          </div>
        </PillBox>

        {/* Appearance */}
        <PillBox
          title="Appearance"
          preview={theme === 'dark' ? 'Dark mode' : 'Light mode'}
        >
          <div style={{ padding: '0.25rem 0.25rem 0.5rem' }}>
            <div className="theme-toggle-row" style={{ paddingTop: 0 }}>
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
        </PillBox>

        {/* Account */}
        <PillBox
          title="Account"
          preview="Sign out, danger zone"
        >
          <div style={{ padding: '0.25rem 0.25rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

            <button className="profile-signout-btn" style={{ marginTop: 0 }} onClick={() => signOut(auth)}>
              Sign out
            </button>

            <div style={{ borderTop: '0.5px solid var(--border-light)', paddingTop: '0.75rem', marginTop: '0.25rem' }}>
              <p className="profile-section-title danger" style={{ marginBottom: '0.5rem' }}>Danger zone</p>

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
        </PillBox>

      </div>
    )
  }

  // ── MAIN PROFILE VIEW ──────────────────────────────────
  return (
    <div className="profile-screen" style={{ position: 'relative' }}>

      {/* Gear / Settings button */}
      <button className="profile-gear-btn" onClick={() => setShowSettings(true)} title="Settings">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
      </button>

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

    </div>
  )
}
