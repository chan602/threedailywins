import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import {
  collection, doc, getDoc, getDocs, setDoc, query, where
} from 'firebase/firestore'
import { todayStr, isThreeWinDay } from './tabs/utils'
import { AccomplishmentsSection } from '../components/AccomplishmentsSection'

const functions = getFunctions()
const sendKudosFn = httpsCallable(functions, 'sendKudos')
const sendNudgeFn = httpsCallable(functions, 'sendNudge')

// ── PROFILE CALENDAR ─────────────────────────────────────
// Mini month grid showing archived days. Tapping a cell expands detail.
function ProfileCalendar({ archiveDays, archiveWins }) {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth())
  const [year, setYear]   = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState(null)

  const archiveMap = {}
  ;(archiveDays || []).forEach(d => { archiveMap[d.date] = d })

  // Build calendar grid for current month/year
  const firstDay = new Date(year, month, 1)
  const startDow = firstDay.getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    const now = new Date()
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth())) return
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const isAtCurrentMonth = year === today.getFullYear() && month === today.getMonth()

  function dateStr(d) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  const selectedDay = selectedDate ? archiveMap[selectedDate] : null
  const selectedWins = selectedDate ? (archiveWins[selectedDate] || null) : null

  return (
    <div className="upro-cal">
      {/* Month nav */}
      <div className="upro-cal-nav">
        <button className="upro-cal-nav-btn" onClick={prevMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="upro-cal-month">{monthLabel}</span>
        <button className="upro-cal-nav-btn" onClick={nextMonth} disabled={isAtCurrentMonth} style={{ opacity: isAtCurrentMonth ? 0.3 : 1 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="upro-cal-grid">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="upro-cal-dow">{d}</div>
        ))}

        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} />
          const ds = dateStr(d)
          const dayData = archiveMap[ds]
          const wins = archiveWins[ds]
          const threeWin = isThreeWinDay(wins)
          const isFuture = new Date(ds + 'T12:00:00') > today
          const isSelected = selectedDate === ds
          const isToday = ds === todayStr()

          if (!dayData || isFuture) {
            return (
              <div key={ds} className={`upro-cal-cell empty${isToday ? ' today' : ''}`}>
                <span className="upro-cal-day">{d}</span>
              </div>
            )
          }

          const tasks = dayData.tasks || []
          const done = tasks.filter(t => t.done).length
          const total = tasks.length
          const taskMap = wins?.taskMap || {}
          const counts = { physical: 0, mental: 0, spiritual: 0, general: 0 }
          tasks.forEach(t => {
            if (!t.done) return
            const cat = taskMap[t.text]
            if (cat === 'physical' || cat === 'mental' || cat === 'spiritual') counts[cat]++
            else counts.general++
          })
          const toW = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'

          return (
            <div
              key={ds}
              className={`upro-cal-cell has-data${threeWin ? ' three-win' : ''}${isSelected ? ' selected' : ''}`}
              onClick={() => setSelectedDate(isSelected ? null : ds)}
            >
              <span className="upro-cal-day">{d}</span>
              {threeWin && <span className="upro-cal-3w">3W</span>}
              <div className="upro-cal-bar">
                <div className="upro-cal-bar-seg physical"  style={{ width: toW(counts.physical) }} />
                <div className="upro-cal-bar-seg mental"    style={{ width: toW(counts.mental) }} />
                <div className="upro-cal-bar-seg spiritual" style={{ width: toW(counts.spiritual) }} />
                <div className="upro-cal-bar-seg general"   style={{ width: toW(counts.general) }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="archive-legend" style={{ marginTop: '0.5rem' }}>
        <span className="archive-legend-item"><span className="archive-legend-dot physical" />Physical</span>
        <span className="archive-legend-item"><span className="archive-legend-dot mental" />Mental</span>
        <span className="archive-legend-item"><span className="archive-legend-dot spiritual" />Spiritual</span>
        <span className="archive-legend-item"><span className="archive-legend-dot general" />General</span>
      </div>

      {/* Selected day detail */}
      {selectedDate && (
        <div className="upro-cal-detail">
          <p className="upro-cal-detail-date">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            {isThreeWinDay(selectedWins) && <span className="archive-3w-badge" style={{ marginLeft: '0.5rem' }}>3W</span>}
          </p>
          {selectedDay ? (
            <>
              {(selectedDay.tasks || []).map((t, i) => (
                <div key={i} className={`archive-task ${t.done ? 'done' : ''}`}>
                  <span className={`archive-task-dot ${t.done ? 'done' : ''}`} />
                  <span className="archive-task-text">{t.text}</span>
                </div>
              ))}
              {selectedWins?.reasoning && (
                <p className="archive-reasoning">{selectedWins.reasoning}</p>
              )}
              {!selectedWins && (
                <p className="archive-not-evaluated">Not evaluated.</p>
              )}
            </>
          ) : (
            <p className="empty-msg">No data for this day.</p>
          )}
        </div>
      )}
    </div>
  )
}

// ── MAIN COMPONENT ────────────────────────────────────────
function UserProfile() {
  const { username } = useParams()
  const navigate = useNavigate()
  const viewer = auth.currentUser

  const [profile, setProfile]           = useState(null)
  const [streak, setStreak]             = useState(null)
  const [globalRank, setGlobalRank]     = useState(null)
  const [accomplishments, setAccomplishments] = useState([])
  const [kudosSent, setKudosSent]       = useState({})
  const [todayTasks, setTodayTasks]     = useState(null)  // null = hidden
  const [todayWins, setTodayWins]       = useState(null)
  const [archiveDays, setArchiveDays]   = useState(null)  // null = hidden
  const [archiveWins, setArchiveWins]   = useState({})
  const [loading, setLoading]           = useState(true)
  const [notFound, setNotFound]         = useState(false)

  // Friend request state
  const [isFriend, setIsFriend]                 = useState(false)
  const [friendRequestSent, setFriendRequestSent] = useState(false)
  const [friendRequestLoading, setFriendRequestLoading] = useState(false)

  // Nudge state
  const [nudgingTaskId, setNudgingTaskId] = useState(null)
  const [nudgeText, setNudgeText]         = useState('')
  const [nudgeSending, setNudgeSending]   = useState(false)
  const [nudgeSentIds, setNudgeSentIds]   = useState({})

  useEffect(() => { loadProfile() }, [username])

  async function loadProfile() {
    setLoading(true)
    setNotFound(false)
    setIsFriend(false)
    setFriendRequestSent(false)

    try {
      const q = query(collection(db, 'users'), where('username', '==', username.toLowerCase()))
      const snap = await getDocs(q)
      if (snap.empty) { setNotFound(true); setLoading(false); return }

      const userData = snap.docs[0].data()
      const uid = userData.uid
      setProfile(userData)

      const isOwn = viewer?.uid === uid
      const visibility = userData.visibility || { todo: 'friends', archive: 'friends', stats: 'public' }

      // Check friend relationship
      let friend = false
      if (!isOwn && viewer?.uid) {
        const friendSnap = await getDoc(doc(db, 'friends', uid, 'list', viewer.uid))
        friend = friendSnap.exists()
        setIsFriend(friend)

        // Check if a request is already pending
        if (!friend) {
          const pendingSnap = await getDoc(doc(db, 'friendRequests', uid, 'incoming', viewer.uid))
          if (pendingSnap.exists()) setFriendRequestSent(true)
        }
      }

      const canSee = (level) => {
        if (isOwn) return true
        if (level === 'public') return true
        if (level === 'friends' && friend) return true
        return false
      }

      // Stats — always load (no visibility gate)
      const streakSnap = await getDoc(doc(db, 'streak', uid, 'data', 'current'))
      if (streakSnap.exists()) setStreak(streakSnap.data())

      if (viewer?.uid) {
        try {
          const lbSnap = await getDocs(collection(db, 'leaderboard'))
          const sorted = lbSnap.docs
            .map(d => d.data())
            .sort((a, b) => (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0))
          const rankIdx = sorted.findIndex(e => e.uid === uid)
          setGlobalRank(rankIdx >= 0 ? rankIdx + 1 : null)
        } catch (_) {}
      }

      // Accomplishments — always load
      const accSnap = await getDocs(collection(db, 'accomplishments', uid, 'items'))
      const accItems = accSnap.docs.map(d => ({ id: d.id, ...d.data() }))
      accItems.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setAccomplishments(accItems)

      // Today tasks — gated by visibility.todo
      if (canSee(visibility.todo)) {
        const taskSnap = await getDoc(doc(db, 'tasks', uid, 'today', 'data'))
        setTodayTasks(taskSnap.exists() ? taskSnap.data().tasks || [] : [])
        const winsSnap = await getDoc(doc(db, 'wins', uid, 'days', todayStr()))
        if (winsSnap.exists()) setTodayWins(winsSnap.data())
      } else {
        setTodayTasks(null)
      }

      // Archive — gated by visibility.archive
      if (canSee(visibility.archive)) {
        const daysSnap = await getDocs(collection(db, 'archive', uid, 'days'))
        const days = daysSnap.docs.map(d => d.data()).sort((a, b) => b.date.localeCompare(a.date))
        setArchiveDays(days)
        const winsMap = {}
        for (const day of days) {
          const wSnap = await getDoc(doc(db, 'wins', uid, 'days', day.date))
          if (wSnap.exists()) winsMap[day.date] = wSnap.data()
        }
        setArchiveWins(winsMap)
      } else {
        setArchiveDays(null)
      }

    } catch (e) {
      console.error('loadProfile error:', e)
    }

    setLoading(false)
  }

  async function handleSendFriendRequest() {
    if (!viewer || !profile || friendRequestLoading) return
    setFriendRequestLoading(true)
    try {
      await setDoc(doc(db, 'friendRequests', profile.uid, 'incoming', viewer.uid), {
        uid: viewer.uid,
        username: viewer.displayName || viewer.email?.split('@')[0] || '',
        photoURL: viewer.photoURL || '',
        sentAt: Date.now(),
      })
      setFriendRequestSent(true)
    } catch (e) {
      console.error('friend request error:', e)
    }
    setFriendRequestLoading(false)
  }

  async function handleKudos(a) {
    if (!viewer || kudosSent[a.id]) return
    try {
      await sendKudosFn({
        recipientUid: profile.uid,
        accomplishmentId: a.id,
        accomplishmentLabel: a.label || a.taskText || '',
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

  // Friend button label
  const friendBtnLabel = isFriend ? 'Friends ✓'
    : friendRequestSent ? 'Request sent'
    : friendRequestLoading ? '…'
    : '+ Add Friend'
  const friendBtnDisabled = isFriend || friendRequestSent || friendRequestLoading

  return (
    <div className="upro-shell">

      {/* Back */}
      <button className="upro-back" onClick={() => navigate(auth.currentUser ? -1 : '/login')}>← Back</button>

      {/* Identity */}
      <div className="upro-identity">
        <div className="upro-avatar">
          {profile?.photoURL
            ? <img src={profile.photoURL} alt="avatar" className="profile-avatar-img" />
            : <span className="profile-avatar-initial">{(profile?.username || '?')[0].toUpperCase()}</span>
          }
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <p className="upro-username">@{profile?.username}</p>
            {isOwn && <p className="upro-own-badge">You</p>}
            {!isOwn && viewer && (
              <button
                className={`upro-friend-btn${isFriend ? ' friends' : friendRequestSent ? ' sent' : ''}`}
                onClick={handleSendFriendRequest}
                disabled={friendBtnDisabled}
              >
                {friendBtnLabel}
              </button>
            )}
          </div>
          {profile?.bio && <p className="upro-bio">{profile.bio}</p>}
        </div>
      </div>

      {/* Stats — always visible */}
      <div className="home-stats" style={{ marginBottom: '1.5rem' }}>
        <div className={`stat-pill${(streak?.current ?? 0) > 0 ? ' stat-pill-win' : ''}`}>
          <span className="stat-val">{streak?.current ?? 0}</span>
          <span className="stat-label">streak</span>
        </div>
        <div className="stat-pill">
          <span className="stat-val">{globalRank ? `#${globalRank}` : '—'}</span>
          <span className="stat-label">rank</span>
        </div>
        <div className="stat-pill">
          <span className="stat-val">{streak?.total ?? 0}</span>
          <span className="stat-label">total wins</span>
        </div>
      </div>

      {/* Accomplishments — PillBox style matching ProfileTab */}
      {accomplishments.length > 0 && (
        <AccomplishmentsSection
          accomplishments={accomplishments}
          onKudos={!isOwn && viewer ? handleKudos : null}
          kudosSent={kudosSent}
        />
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

      {/* Win definitions */}
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

      {/* Calendar (replaces archive) */}
      <div className="upro-section">
        <span className="upro-section-title">Calendar</span>
        {archiveDays === null ? (
          <div className="upro-hidden-section">
            <p className="upro-hidden-msg">This user's archive is private.</p>
          </div>
        ) : (
          <ProfileCalendar archiveDays={archiveDays} archiveWins={archiveWins} />
        )}
      </div>

    </div>
  )
}

export default UserProfile
