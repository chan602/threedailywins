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

    } catch (e) {
      console.error('loadProfile error:', e)
    }

    setLoading(false)
  }

  if (loading) {
    return (
      <div className="upro-shell">
        <button className="upro-back" onClick={() => navigate(-1)}>← Back</button>
        <p className="upro-loading">Loading…</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="upro-shell">
        <button className="upro-back" onClick={() => navigate(-1)}>← Back</button>
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
      <button className="upro-back" onClick={() => navigate(-1)}>← Back</button>

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

    </div>
  )
}

export default UserProfile
