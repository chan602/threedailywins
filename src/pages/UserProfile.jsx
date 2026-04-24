import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import {
  collection, doc, getDoc, getDocs, query, where
} from 'firebase/firestore'
import { todayStr, isThreeWinDay, getWeekKeyForDate, weekLabelFromKey } from './tabs/utils'

const functions = getFunctions()
const sendKudosFn  = httpsCallable(functions, 'sendKudos')
const sendNudgeFn  = httpsCallable(functions, 'sendNudge')

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
  const [archiveOpen, setArchiveOpen] = useState(true)   // open by default
  const [expandedDays, setExpandedDays] = useState({})   // { [date]: bool }
  const [expandedWeeks, setExpandedWeeks] = useState({}) // { [weekKey]: bool }
  const [globalRank, setGlobalRank] = useState(null)
  const [accomplishments, setAccomplishments] = useState([])
  const [kudosSent, setKudosSent] = useState({}) // { [accomplishmentId]: true }
  const [nudgingTaskId, setNudgingTaskId] = useState(null) // task id with open nudge input
  const [nudgeText, setNudgeText] = useState('')
  const [nudgeSending, setNudgeSending] = useState(false)
  const [nudgeSentIds, setNudgeSentIds] = useState({}) // { [taskId]: true }

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

        // Compute global rank — only possible for signed-in viewers
        if (viewer?.uid) {
          try {
            const lbSnap = await getDocs(collection(db, 'leaderboard'))
            const lbEntries = lbSnap.docs.map(d => d.data())
            const sorted = [...lbEntries].sort((a, b) =>
              (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0)
            )
            const rankIdx = sorted.findIndex(e => e.uid === uid)
            setGlobalRank(rankIdx >= 0 ? rankIdx + 1 : null)
          } catch (e) {
            // leaderboard not available for this viewer, skip silently
          }
        }
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

      // 6. Load accomplishments if stats visibility allows
      if (canSee(visibility.stats)) {
        const accSnap = await getDocs(collection(db, 'accomplishments', uid, 'items'))
        const items = accSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        setAccomplishments(items)
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

  function accomplishmentLabel(a) {
    if (a.type === 'challenge_completed') return `Completed: "${a.taskText}"`
    if (a.type === 'streak_milestone')    return `${a.streakCount}-day streak`
    if (a.type === 'three_win_day')       return `Three win day — ${a.date}`
    if (a.type === 'perfect_week')        return `Perfect week — ${a.weekKey}`
    return a.label || 'Achievement'
  }

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

  async function handleKudos(a) {
    if (!viewer || isOwn || kudosSent[a.id]) return
    try {
      await sendKudosFn({
        recipientUid: profile.uid,
        accomplishmentId: a.id,
        accomplishmentLabel: accomplishmentLabel(a),
        senderDisplayName: viewer.displayName || viewer.email?.split('@')[0] || 'Someone',
      })
      setKudosSent(prev => ({ ...prev, [a.id]: true }))
    } catch (e) {
      console.error('kudos error:', e)
    }
  }

  async function handleNudge(task) {
    const text = nudgeText.trim() || task.text
    if (!text || nudgeSending) return
    setNudgeSending(true)
    try {
      await sendNudgeFn({
        recipientUid: profile.uid,
        taskText: text,
        senderDisplayName: viewer?.displayName || viewer?.email?.split('@')[0] || 'Someone',
      })
      setNudgeSentIds(prev => ({ ...prev, [task.id]: true }))
      setNudgingTaskId(null)
      setNudgeText('')
      setTimeout(() => setNudgeSentIds(prev => ({ ...prev, [task.id]: false })), 3000)
    } catch (e) {
      console.error('nudge error:', e)
    }
    setNudgeSending(false)
  }

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
        <div className="home-stats" style={{ marginBottom: '1.5rem' }}>
          <div className={`stat-pill${(streak.current ?? 0) > 0 ? ' stat-pill-win' : ''}`}>
            <span className="stat-val">{streak.current ?? 0}</span>
            <span className="stat-label">streak</span>
          </div>
          <div className="stat-pill">
            <span className="stat-val">{globalRank ? `#${globalRank}` : '—'}</span>
            <span className="stat-label">rank</span>
          </div>
          <div className="stat-pill">
            <span className="stat-val">{streak.total ?? 0}</span>
            <span className="stat-label">total wins</span>
          </div>
        </div>
      ) : (
        <div className="upro-hidden-section">
          <p className="upro-hidden-msg">Stats are private.</p>
        </div>
      )}

      {/* Accomplishments */}
      {accomplishments.length > 0 && (
        <div className="upro-section">
          <span className="upro-section-title">Accomplishments</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {accomplishments.slice(0, 10).map(a => (
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
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                      {a.kudosCount}
                    </span>
                  )}
                  {!isOwn && viewer && (
                    <button
                      className="profile-cancel-btn"
                      style={{ marginLeft: '0.25rem', flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0.25rem 0.5rem', opacity: kudosSent[a.id] ? 0.4 : 1 }}
                      onClick={() => handleKudos(a)}
                      disabled={!!kudosSent[a.id]}
                      title={kudosSent[a.id] ? 'Kudos sent!' : 'Give kudos'}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                        <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Today's tasks */}
      <div className="upro-section">
        <div className="upro-section-header">
          <span className="upro-section-title">Today</span>
          {todayTasks !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="upro-task-meta">{doneTasks}/{totalTasks} · {pct}%</span>
              {(() => {
                const taskMap = todayWins?.taskMap || {}
                const total = totalTasks
                const counts = { physical: 0, mental: 0, spiritual: 0, general: 0 }
                todayTasks.forEach(t => {
                  if (!t.done) return
                  const cat = taskMap[t.text]
                  if (cat === 'physical' || cat === 'mental' || cat === 'spiritual') counts[cat]++
                  else counts.general++
                })
                const toW = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
                return (
                  <div className="archive-win-bar" title={`${doneTasks}/${totalTasks} tasks`}>
                    <div className="archive-win-bar-seg physical"  style={{ width: toW(counts.physical) }} />
                    <div className="archive-win-bar-seg mental"    style={{ width: toW(counts.mental) }} />
                    <div className="archive-win-bar-seg spiritual" style={{ width: toW(counts.spiritual) }} />
                    <div className="archive-win-bar-seg general"   style={{ width: toW(counts.general) }} />
                  </div>
                )
              })()}
              {threeWinToday && <span className="archive-3w-badge">3W</span>}
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
              <div key={t.id || i} style={{ flexDirection: 'column', alignItems: 'stretch' }} className={`task-item ${t.done ? 'done' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span className={`upro-task-dot ${t.done ? 'done' : ''}`} />
                  <span className="task-num">T{i + 1}</span>
                  <span className="task-text" style={{ flex: 1 }}>
                    {t.text}
                    {t.carried && <span className="tag carried-tag">carried</span>}
                    {t.fromDTask && <span className="tag daily-tag">daily</span>}
                  </span>
                  {!isOwn && viewer && (
                    nudgeSentIds[t.id || i] ? (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginLeft: '0.5rem' }}>Nudged!</span>
                    ) : (
                      <button
                        className="profile-cancel-btn"
                        style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.2rem 0.5rem', flexShrink: 0 }}
                        onClick={() => {
                          setNudgingTaskId(nudgingTaskId === (t.id || i) ? null : (t.id || i))
                          setNudgeText(t.text)
                        }}
                      >
                        {nudgingTaskId === (t.id || i) ? 'Cancel' : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {/* Hand pushing / nudge icon */}
                            <path d="M9 11V6a2 2 0 0 1 4 0v5"/>
                            <path d="M13 11V8a2 2 0 0 1 4 0v3"/>
                            <path d="M17 11a2 2 0 0 1 4 0v4a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-1a2 2 0 0 1 2-2h1"/>
                            <path d="M9 11a2 2 0 0 0-4 0v1"/>
                          </svg>
                        )}
                      </button>
                    )
                  )}
                </div>
                {nudgingTaskId === (t.id || i) && (
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.4rem', paddingLeft: '1.5rem' }}>
                    <input
                      className="friends-input"
                      value={nudgeText}
                      onChange={e => setNudgeText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleNudge(t)}
                      placeholder="Edit nudge message..."
                      autoFocus
                      style={{ flex: 1, fontSize: '0.8rem' }}
                    />
                    <button
                      className="friends-search-btn"
                      onClick={() => handleNudge(t)}
                      disabled={nudgeSending || !nudgeText.trim()}
                      style={{ fontSize: '0.8rem' }}
                    >
                      {nudgeSending ? '…' : 'Send'}
                    </button>
                  </div>
                )}
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
              <div className="archive-legend">
                <span className="archive-legend-item"><span className="archive-legend-dot physical" />Physical</span>
                <span className="archive-legend-item"><span className="archive-legend-dot mental" />Mental</span>
                <span className="archive-legend-item"><span className="archive-legend-dot spiritual" />Spiritual</span>
                <span className="archive-legend-item"><span className="archive-legend-dot general" />General</span>
              </div>
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
                                  {threeWin && <span className="archive-3w-badge">3W</span>}
                                </div>
                                <div className="archive-day-right">
                                  {(() => {
                                    const total = dayTasks.length
                                    const taskMap = dayWins?.taskMap || {}
                                    const counts = { physical: 0, mental: 0, spiritual: 0, general: 0 }
                                    dayTasks.forEach(t => {
                                      if (!t.done) return
                                      const cat = taskMap[t.text]
                                      if (cat === 'physical' || cat === 'mental' || cat === 'spiritual') counts[cat]++
                                      else counts.general++
                                    })
                                    const toW = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
                                    return (
                                      <div className="archive-win-bar" title={`${done}/${total} tasks`}>
                                        <div className="archive-win-bar-seg physical"  style={{ width: toW(counts.physical) }} />
                                        <div className="archive-win-bar-seg mental"    style={{ width: toW(counts.mental) }} />
                                        <div className="archive-win-bar-seg spiritual" style={{ width: toW(counts.spiritual) }} />
                                        <div className="archive-win-bar-seg general"   style={{ width: toW(counts.general) }} />
                                      </div>
                                    )
                                  })()}
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
