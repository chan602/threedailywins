import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import {
  collection, doc, getDoc, getDocs, query, where
} from 'firebase/firestore'

function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function isThreeWinDay(w) {
  if (!w) return false
  const p = w.overridePhysical != null ? w.overridePhysical : w.physical
  const m = w.overrideMental != null ? w.overrideMental : w.mental
  const s = w.overrideSpiritual != null ? w.overrideSpiritual : w.spiritual
  return p && m && s
}

function getEffectiveWin(winsData, type) {
  if (!winsData) return null
  const overrideKey = `override${type.charAt(0).toUpperCase() + type.slice(1)}`
  const override = winsData[overrideKey]
  return override != null ? override : winsData[type]
}

function WinBadge({ type, value }) {
  const labels = { physical: 'P', mental: 'M', spiritual: 'S' }
  const achieved = value === true
  const missed = value === false
  return (
    <span className={`win-badge ${achieved ? 'achieved' : missed ? 'missed' : 'pending'} xs`}>
      <span className="win-badge-dot" />
      <span className="win-badge-label">{labels[type]}</span>
      <span className="win-badge-tick">{achieved ? '✓' : missed ? '✗' : '–'}</span>
    </span>
  )
}

// ── ARCHIVE HELPERS ──────────────────────────────────
function getWeekKeyForDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diffToMon)
  const jan1 = new Date(mon.getFullYear(), 0, 1)
  const wk = Math.ceil(((mon - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${mon.getFullYear()}-W${String(wk).padStart(2, '0')}`
}

function weekLabelFromKey(wk, weekStart) {
  if (weekStart) {
    return `Week of ${new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  const [yr, wNum] = wk.split('-W').map(Number)
  const jan4 = new Date(yr, 0, 4)
  const jan4Day = jan4.getDay() || 7
  const weekOneMon = new Date(jan4)
  weekOneMon.setDate(jan4.getDate() - (jan4Day - 1))
  const mon = new Date(weekOneMon)
  mon.setDate(weekOneMon.getDate() + (wNum - 1) * 7)
  return `Week of ${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function UserProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const viewer = auth.currentUser

  const [profile, setProfile] = useState(null)       // their users doc
  const [streak, setStreak] = useState(null)          // their streak doc
  const [todayTasks, setTodayTasks] = useState(null)  // null = not loaded / hidden
  const [todayWins, setTodayWins] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [archiveDays, setArchiveDays] = useState(null)   // null = hidden, [] = empty, [...] = loaded
  const [archiveWins, setArchiveWins] = useState({})     // { [date]: winsDoc }
  const [archiveOpen, setArchiveOpen] = useState(false)  // top-level expand
  const [expandedDays, setExpandedDays] = useState({})   // { [date]: bool }
  const [expandedWeeks, setExpandedWeeks] = useState({}) // { [weekKey]: bool }

  useEffect(() => {
    loadProfile()
  }, [username])

  async function loadProfile() {
    setLoading(true)
    setNotFound(false)

    try {
      // 1. Find user by username
      const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()))
      const snap = await getDocs(q)
      if (snap.empty) { setNotFound(true); setLoading(false); return }

      const userData = snap.docs[0].data()
      const uid = userData.uid
      setProfile(userData)

      const isOwn = viewer?.uid === uid
      const visibility = userData.visibility || { todo: 'friends', archive: 'friends', stats: 'public' }

      // 2. Check if viewer is a friend of this user
      let isFriend = false
      if (!isOwn && viewer?.uid) {
        const friendSnap = await getDoc(doc(db, 'friends', uid, 'list', viewer.uid))
        isFriend = friendSnap.exists()
      }

      // Helper: can viewer see this section?
      const canSee = (level) => {
        if (isOwn) return true
        if (level === 'public') return true
        if (level === 'friends' && isFriend) return true
        return false
      }

      // 3. Load streak if stats visibility allows
      if (canSee(visibility.stats)) {
        const streakSnap = await getDoc(doc(db, 'streak', uid, 'data', 'current'))
        if (streakSnap.exists()) setStreak(streakSnap.data())
      }

      // 4. Load today's tasks if todo visibility allows
      if (canSee(visibility.todo)) {
        const taskSnap = await getDoc(doc(db, 'tasks', uid, 'today', 'data'))
        if (taskSnap.exists()) setTodayTasks(taskSnap.data().tasks || [])
        else setTodayTasks([])

        // Load today's wins for badge display
        const winsSnap = await getDoc(doc(db, 'wins', uid, 'days', todayStr()))
        if (winsSnap.exists()) setTodayWins(winsSnap.data())
      }

      // 5. Load archive if archive visibility allows
      if (canSee(visibility.archive)) {
        const daysSnap = await getDocs(collection(db, 'archive', uid, 'days'))
        const days = daysSnap.docs.map(d => d.data()).sort((a, b) => b.date.localeCompare(a.date))
        setArchiveDays(days)

        // Load wins for each archived day
        const winsMap = {}
        for (const day of days) {
          const wSnap = await getDoc(doc(db, 'wins', uid, 'days', day.date))
          if (wSnap.exists()) winsMap[day.date] = wSnap.data()
        }
        setArchiveWins(winsMap)
      } else {
        setArchiveDays(null) // explicitly hidden
      }

    } catch (e) {
      console.error('loadProfile error:', e)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="upro-shell">
        <button className="upro-back" onClick={() => navigate(auth.currentUser ? -1 : '/login')}>← Back</button>
        <p className="upro-loading">Loading…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="upro-shell">
        <button className="upro-back" onClick={() => navigate(auth.currentUser ? -1 : '/login')}>← Back</button>
        <p className="upro-not-found">No user found with username <strong>@{username}</strong>.</p>
      </div>
    )
  }

  const isOwn = viewer?.uid === profile?.uid
  const threeWinToday = isThreeWinDay(todayWins)
  const doneTasks = todayTasks ? todayTasks.filter(t => t.done).length : 0
  const totalTasks = todayTasks ? todayTasks.length : 0
  const pct = totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100)

  return (
    <div className="upro-shell">

      {/* Back */}
      <button className="upro-back" onClick={() => navigate(auth.currentUser ? -1 : '/login')}>← Back</button>

      {/* Identity */}
      <div className="upro-identity">
        <div className="upro-avatar">
          {profile?.photoURL
            ? <img src={profile.photoURL} alt="avatar" className="profile-avatar-img" />
            : <span className="profile-avatar-initial">
                {(profile?.username || '?')[0].toUpperCase()}
              </span>
          }
        </div>
        <div>
          <p className="upro-username">@{profile?.username}</p>
          {isOwn && <p className="upro-own-badge">You</p>}
          {profile?.bio && <p className="upro-bio">{profile.bio}</p>}
        </div>
      </div>

      {/* Stats */}
      {streak ? (
        <div className="profile-stats-row" style={{ marginBottom: '1.5rem' }}>
          <div className="profile-stat">
            <span className="profile-stat-val">{streak.current ?? 0}</span>
            <span className="profile-stat-label">Current streak</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-val">{streak.best ?? 0}</span>
            <span className="profile-stat-label">Best streak</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-val">{streak.total ?? 0}</span>
            <span className="profile-stat-label">Total wins</span>
          </div>
        </div>
      ) : (
        <div className="upro-hidden-section">
          <p className="upro-hidden-msg">Stats are private.</p>
        </div>
      )}

      {/* Today's tasks */}
      <div className="upro-section">
        <div className="upro-section-header">
          <span className="upro-section-title">Today</span>
          {todayTasks !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="upro-task-meta">{doneTasks}/{totalTasks} · {pct}%</span>
              {['physical', 'mental', 'spiritual'].map(type => (
                <WinBadge key={type} type={type} value={getEffectiveWin(todayWins, type)} />
              ))}
              {threeWinToday && <span className="three-wins-badge">Three Wins</span>}
            </div>
          )}
        </div>

        {todayTasks === null ? (
          <div className="upro-hidden-section">
            <p className="upro-hidden-msg">This user's tasks are private.</p>
          </div>
        ) : todayTasks.length === 0 ? (
          <p className="empty-msg">No tasks today.</p>
        ) : (
          <div className="task-list">
            {todayTasks.map((t, i) => (
              <div key={t.id || i} className={`task-item ${t.done ? 'done' : ''}`}>
                <span className={`upro-task-dot ${t.done ? 'done' : ''}`} />
                <span className="task-num">T{i + 1}</span>
                <span className="task-text">
                  {t.text}
                  {t.carried && <span className="tag carried-tag">carried</span>}
                  {t.fromDTask && <span className="tag daily-tag">daily</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Win definitions (public context) */}
      {profile?.winsDefinition && (
        <div className="upro-section">
          <span className="upro-section-title">Win definitions</span>
          <div className="upro-defs">
            {['physical', 'mental', 'spiritual'].map(type => (
              <div key={type} className="upro-def-row">
                <span className="upro-def-label">{type.charAt(0).toUpperCase() + type.slice(1)}</span>
                <span className="upro-def-text">{profile.winsDefinition[type]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Archive */}
      <div className="upro-section">
        <div
          className="upro-archive-toggle"
          onClick={() => archiveDays !== null && setArchiveOpen(o => !o)}
        >
          <span className="upro-section-title">Archive</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {archiveDays !== null && (
              <span className="upro-archive-count">{archiveDays.length} days</span>
            )}
            <span className={`archive-chevron ${archiveOpen ? 'open' : ''}`}>
              {archiveDays === null ? '' : '▼'}
            </span>
          </div>
        </div>

        {archiveDays === null && (
          <div className="upro-hidden-section">
            <p className="upro-hidden-msg">This user's archive is private.</p>
          </div>
        )}

        {archiveDays !== null && archiveOpen && (() => {
          // Group by week
          const byWeek = {}
          archiveDays.forEach(day => {
            const wk = getWeekKeyForDate(day.date)
            if (!byWeek[wk]) byWeek[wk] = []
            byWeek[wk].push(day)
          })
          const sortedWeeks = Object.keys(byWeek).sort().reverse()

          if (archiveDays.length === 0) {
            return <p className="empty-msg" style={{ paddingTop: '0.5rem' }}>No archived days yet.</p>
          }

          return (
            <div className="upro-archive-body">
              {sortedWeeks.map(wk => {
                const days = byWeek[wk]
                const weekOpen = expandedWeeks[wk] !== false
                return (
                  <div key={wk} className="archive-week-group">
                    <div className="archive-week-header" onClick={() => setExpandedWeeks(p => ({ ...p, [wk]: !weekOpen }))}>
                      <div className="archive-week-left">
                        <span className="archive-week-title">{weekLabelFromKey(wk)}</span>
                      </div>
                      <div className="archive-week-right">
                        <span className={`archive-chevron ${weekOpen ? 'open' : ''}`}>▼</span>
                      </div>
                    </div>

                    {weekOpen && (
                      <div className="archive-week-body">
                        {days.map(day => {
                          const dayTasks = day.tasks || []
                          const done = dayTasks.filter(t => t.done).length
                          const pct2 = dayTasks.length > 0 ? Math.round(done / dayTasks.length * 100) : 0
                          const dayWins = archiveWins[day.date] || null
                          const threeWin = isThreeWinDay(dayWins)
                          const dayOpen = expandedDays[day.date]
                          const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                          })

                          return (
                            <div key={day.date} className={`archive-day ${threeWin ? 'three-win' : ''}`}>
                              <div className="archive-day-header" onClick={() => setExpandedDays(p => ({ ...p, [day.date]: !dayOpen }))}>
                                <div className="archive-day-left">
                                  <span className={`archive-day-date ${threeWin ? 'three-win' : ''}`}>{dateLabel}</span>
                                  <span className="archive-day-meta">{done}/{dayTasks.length} · {pct2}%</span>
                                  {threeWin && <span className="three-wins-badge">Three Wins</span>}
                                </div>
                                <div className="archive-day-right">
                                  <div className="archive-win-badges">
                                    {['physical', 'mental', 'spiritual'].map(type => (
                                      <span key={type} className={`win-badge ${getEffectiveWin(dayWins, type) === true ? 'achieved' : getEffectiveWin(dayWins, type) === false ? 'missed' : 'pending'} xs`}>
                                        <span className="win-badge-dot" />
                                        <span className="win-badge-label">{type[0].toUpperCase()}</span>
                                        <span className="win-badge-tick">{getEffectiveWin(dayWins, type) === true ? '✓' : getEffectiveWin(dayWins, type) === false ? '✗' : '–'}</span>
                                      </span>
                                    ))}
                                  </div>
                                  <span className={`archive-chevron ${dayOpen ? 'open' : ''}`}>▼</span>
                                </div>
                              </div>

                              {dayOpen && (
                                <div className="archive-day-body">
                                  {dayTasks.map((t, i) => (
                                    <div key={i} className={`archive-task ${t.done ? 'done' : ''}`}>
                                      <span className={`archive-task-dot ${t.done ? 'done' : ''}`} />
                                      <span className="archive-task-text">{t.text}</span>
                                    </div>
                                  ))}
                                  {dayWins?.reasoning && (
                                    <p className="archive-reasoning">{dayWins.reasoning}</p>
                                  )}
                                  {!dayWins && (
                                    <p className="archive-not-evaluated">Not yet evaluated.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

    </div>
  )
}

export default UserProfile
