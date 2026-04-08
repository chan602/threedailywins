import { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { signOut } from 'firebase/auth'
import {
  doc, onSnapshot,
  setDoc, getDoc, collection, getDocs, query, orderBy
} from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'

const WORKER_URL = 'https://anthropic-proxy.emailtonathan.workers.dev/'
const WORKER_SECRET = '3w-app-2026-xk9m'  // ← same string as the worker

// ── HELPERS ──────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('en-CA')
}

function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toLocaleDateString('en-CA')
}

function weekKey() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diff)
  const jan1 = new Date(mon.getFullYear(), 0, 1)
  const week = Math.ceil(((mon - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${mon.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function weekRangeLabel() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diff)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)} – ${fmt(sun)}`
}

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
  // Prefer stored weekStart (ISO date string of the Monday)
  if (weekStart) {
    return `Week of ${new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  // Fallback: derive Monday from YYYY-WNN using ISO week logic
  const [yr, wNum] = wk.split('-W').map(Number)
  // Jan 4 is always in week 1 per ISO 8601
  const jan4 = new Date(yr, 0, 4)
  const jan4Day = jan4.getDay() || 7 // convert Sunday(0) to 7
  const weekOneMon = new Date(jan4)
  weekOneMon.setDate(jan4.getDate() - (jan4Day - 1))
  const mon = new Date(weekOneMon)
  mon.setDate(weekOneMon.getDate() + (wNum - 1) * 7)
  return `Week of ${mon.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
}

function isThreeWinDay(w) {
  if (!w) return false
  const p = w.overridePhysical != null ? w.overridePhysical : w.physical
  const m = w.overrideMental != null ? w.overrideMental : w.mental
  const s = w.overrideSpiritual != null ? w.overrideSpiritual : w.spiritual
  return p && m && s
}

// ── MAIN COMPONENT ───────────────────────────────────────
function Home() {
  const user = auth.currentUser
  const uid = user?.uid

  const [activeTab, setActiveTab] = useState('today')
  const [todayTasks, setTodayTasks] = useState([])
  const [tomorrowTasks, setTomorrowTasks] = useState([])
  const [weeklyTasks, setWeeklyTasks] = useState([])
  const [dailyRepeats, setDailyRepeats] = useState([])
  const [rolloverDone, setRolloverDone] = useState(false)

  // Separate input state per tab
  const [todayInput, setTodayInput] = useState('')
  const [tomorrowInput, setTomorrowInput] = useState('')
  const [weeklyInput, setWeeklyInput] = useState('')
  const [dailyInput, setDailyInput] = useState('')

  // AI eval state
  const [todayWins, setTodayWins] = useState(null) // { physical, mental, spiritual, reasoning, taskMap, evaluatedAt, overridePhysical, overrideMental, overrideSpiritual }
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalError, setEvalError] = useState('')

  // Archive state
  const [archiveDays, setArchiveDays] = useState([])   // array of day docs
  const [archiveWeeks, setArchiveWeeks] = useState([])  // array of week docs
  const [winsCache, setWinsCache] = useState({})        // { [date]: winsDoc, ['week-' + weekKey]: winsDoc }
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedWeeks, setExpandedWeeks] = useState({})

  // User profile (for win definitions)
  const [userProfile, setUserProfile] = useState(null)

  // Streak state
  const [streak, setStreak] = useState({ current: 0, total: 0, best: 0 })
  const [streakPopupOpen, setStreakPopupOpen] = useState(false)

  // ── FIREBASE REFS ─────────────────────────────────────
  const todayRef = doc(db, 'tasks', uid, 'today', 'data')
  const tmrwRef = doc(db, 'tasks', uid, 'tomorrow', tomorrowStr())
  const weekRef = doc(db, 'tasks', uid, 'weekly', weekKey())
  const dailyRef = doc(db, 'tasks', uid, 'dailyRepeat', weekKey())
  const rolloverRef = doc(db, 'meta', uid, 'rollover', 'data')
  const winsRef = doc(db, 'wins', uid, 'days', todayStr())
  const streakRef = doc(db, 'streak', uid, 'data', 'current')

  // ── LOAD USER PROFILE ─────────────────────────────────
  useEffect(() => {
    if (!uid) return
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) setUserProfile(snap.data())
    })
  }, [uid])

  // ── ROLLOVER ──────────────────────────────────────────
  useEffect(() => {
    if (!uid) return
    checkRollover()
  }, [uid])

  async function checkRollover() {
    const today = todayStr()
    const metaSnap = await getDoc(rolloverRef)
    const meta = metaSnap.exists() ? metaSnap.data() : {}
    if (meta.lastRollover === today) { setRolloverDone(true); return }

    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    const yStr = yesterday.toLocaleDateString('en-CA')
    const ySnap = await getDoc(todayRef)

    // Archive yesterday
    if (ySnap.exists() && (ySnap.data().tasks || []).length > 0) {
      const yTasks = ySnap.data().tasks
      const done = yTasks.filter(t => t.done).length
      await setDoc(doc(db, 'archive', uid, 'days', yStr), {
        date: yStr, tasks: yTasks,
        summary: `${done}/${yTasks.length} completed`,
        archivedAt: Date.now()
      })
    }

    // Carry over unfinished tasks
    const existingToday = ySnap.exists() ? (ySnap.data().tasks || []) : []
    const carryOver = existingToday
      .filter(t => !t.done)
      .map(t => ({ ...t, carried: true, carryCount: (t.carryCount || 0) + 1 }))

    // Pull tomorrow queue
    const tmrwSnap = await getDoc(doc(db, 'tasks', uid, 'tomorrow', today))
    const fromTmrw = tmrwSnap.exists()
      ? (tmrwSnap.data().tasks || []).map(t => ({ ...t, carried: false, carryCount: 0 }))
      : []

    // Merge and dedup
    const allTasks = [...carryOver, ...fromTmrw]
    const seen = new Set()
    const merged = allTasks.filter(t => seen.has(t.id) ? false : seen.add(t.id))
    await setDoc(todayRef, { tasks: merged, date: today })

    // Weekly rollover on Monday
    const dayOfWeek = new Date().getDay()
    if (dayOfWeek === 1 && meta.lastWeekRollover !== weekKey()) {
      await weeklyRollover(meta)
    }

    await setDoc(rolloverRef, { ...meta, lastRollover: today })
    setRolloverDone(true)
  }

  async function weeklyRollover(meta) {
    const prevWeek = new Date(); prevWeek.setDate(prevWeek.getDate() - 7)
    const prevDay = prevWeek.getDay()
    const diff = prevDay === 0 ? -6 : 1 - prevDay
    const prevMon = new Date(prevWeek); prevMon.setDate(prevWeek.getDate() + diff)
    const jan1 = new Date(prevMon.getFullYear(), 0, 1)
    const wk = Math.ceil(((prevMon - jan1) / 86400000 + jan1.getDay() + 1) / 7)
    const prevKey = `${prevMon.getFullYear()}-W${String(wk).padStart(2, '0')}`

    const prevSnap = await getDoc(doc(db, 'tasks', uid, 'weekly', prevKey))
    const prevRepeat = await getDoc(doc(db, 'tasks', uid, 'dailyRepeat', prevKey))
    const wTasks = prevSnap.exists() ? (prevSnap.data().tasks || []) : []
    const dTasks = prevRepeat.exists() ? (prevRepeat.data().tasks || []) : []

    if (wTasks.length > 0 || dTasks.length > 0) {
      const wDone = wTasks.filter(t => t.done).length
      await setDoc(doc(db, 'archive', uid, 'weeks', prevKey), {
        weekKey: prevKey,
        weekStart: prevMon.toLocaleDateString('en-CA'),
        wTasks, dTasks,
        summary: `${wDone}/${wTasks.length} weekly goals`,
        archivedAt: Date.now()
      })
    }

    if (prevSnap.exists()) {
      const unfinished = wTasks.filter(t => !t.done)
        .map(t => ({ ...t, carried: true, carryCount: (t.carryCount || 0) + 1 }))
      const thisSnap = await getDoc(weekRef)
      const current = thisSnap.exists() ? (thisSnap.data().tasks || []) : []
      await setDoc(weekRef, { tasks: [...unfinished, ...current], weekKey: weekKey() })
    }

    const newDTasks = dTasks.map(t => ({ ...t, count: 0 }))
    await setDoc(dailyRef, { tasks: newDTasks, weekKey: weekKey() })
    await setDoc(rolloverRef, { ...meta, lastWeekRollover: weekKey() })
  }

  // ── LISTENERS ─────────────────────────────────────────
  useEffect(() => {
    if (!uid || !rolloverDone) return
    const unsub1 = onSnapshot(todayRef, snap => {
      setTodayTasks(snap.exists() ? (snap.data().tasks || []) : [])
    })
    const unsub2 = onSnapshot(tmrwRef, snap => {
      setTomorrowTasks(snap.exists() ? (snap.data().tasks || []) : [])
    })
    const unsub3 = onSnapshot(weekRef, snap => {
      setWeeklyTasks(snap.exists() ? (snap.data().tasks || []) : [])
    })
    const unsub4 = onSnapshot(dailyRef, snap => {
      setDailyRepeats(snap.exists() ? (snap.data().tasks || []) : [])
    })
    // Load today's existing wins eval
    const unsub5 = onSnapshot(winsRef, snap => {
      if (snap.exists()) setTodayWins(snap.data())
      else setTodayWins(null)
    })
    // Live streak listener
    const unsub6 = onSnapshot(streakRef, snap => {
      if (snap.exists()) {
        const d = snap.data()
        setStreak({ current: d.current ?? 0, total: d.total ?? 0, best: d.best ?? 0 })
      }
    })
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); unsub5(); unsub6() }
  }, [uid, rolloverDone])

  // ── LOAD ARCHIVE (when tab switches to archive) ───────
  useEffect(() => {
    if (activeTab === 'archive' && uid) {
      loadArchive()
    }
  }, [activeTab, uid])

  async function loadArchive() {
    setArchiveLoading(true)
    try {
      // Load daily archive
      const daysSnap = await getDocs(collection(db, 'archive', uid, 'days'))
      const days = daysSnap.docs.map(d => d.data()).sort((a, b) => b.date.localeCompare(a.date))
      setArchiveDays(days)

      // Load weekly archive
      const weeksSnap = await getDocs(collection(db, 'archive', uid, 'weeks'))
      const weeks = weeksSnap.docs.map(d => d.data()).sort((a, b) => b.weekKey.localeCompare(a.weekKey))
      setArchiveWeeks(weeks)

      // Load wins for all days
      const cache = {}
      for (const day of days) {
        const wSnap = await getDoc(doc(db, 'wins', uid, 'days', day.date))
        if (wSnap.exists()) cache[day.date] = wSnap.data()
      }
      // Load wins for all weeks
      for (const week of weeks) {
        const wSnap = await getDoc(doc(db, 'wins', uid, 'weeks', week.weekKey))
        if (wSnap.exists()) cache['week-' + week.weekKey] = wSnap.data()
      }
      setWinsCache(cache)
    } catch (e) {
      console.error('loadArchive error:', e)
    }
    setArchiveLoading(false)
  }

  // ── TASK OPERATIONS ───────────────────────────────────
  async function addTask() {
    if (activeTab === 'today') {
      if (!todayInput.trim()) return
      const task = { id: uuidv4(), text: todayInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      setTodayInput('')
      await setDoc(todayRef, { tasks: [...todayTasks, task], date: todayStr() })
    } else if (activeTab === 'tomorrow') {
      if (!tomorrowInput.trim()) return
      const task = { id: uuidv4(), text: tomorrowInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      setTomorrowInput('')
      await setDoc(tmrwRef, { tasks: [...tomorrowTasks, task], date: tomorrowStr() })
    } else if (activeTab === 'weekly') {
      if (!weeklyInput.trim()) return
      const task = { id: uuidv4(), text: weeklyInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      setWeeklyInput('')
      await setDoc(weekRef, { tasks: [...weeklyTasks, task], weekKey: weekKey() })
    }
  }

  async function addDailyRepeat() {
    if (!dailyInput.trim()) return
    const task = { id: uuidv4(), text: dailyInput.trim(), count: 0, createdAt: Date.now() }
    setDailyInput('')
    await setDoc(dailyRef, { tasks: [...dailyRepeats, task], weekKey: weekKey() })
  }

  async function toggleTask(type, id) {
    if (type === 'today') {
      const updated = todayTasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
      await setDoc(todayRef, { tasks: updated, date: todayStr() })
    } else if (type === 'tomorrow') {
      const updated = tomorrowTasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
      await setDoc(tmrwRef, { tasks: updated, date: tomorrowStr() })
    } else if (type === 'weekly') {
      const updated = weeklyTasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
      await setDoc(weekRef, { tasks: updated, weekKey: weekKey() })
    }
  }

  async function deleteTask(type, id) {
    if (type === 'today') {
      await setDoc(todayRef, { tasks: todayTasks.filter(t => t.id !== id), date: todayStr() })
    } else if (type === 'tomorrow') {
      await setDoc(tmrwRef, { tasks: tomorrowTasks.filter(t => t.id !== id), date: tomorrowStr() })
    } else if (type === 'weekly') {
      await setDoc(weekRef, { tasks: weeklyTasks.filter(t => t.id !== id), weekKey: weekKey() })
    }
  }

  async function deleteDailyRepeat(id) {
    await setDoc(dailyRef, { tasks: dailyRepeats.filter(t => t.id !== id), weekKey: weekKey() })
  }

  async function tapDailyRepeat(id) {
    const task = dailyRepeats.find(t => t.id === id)
    if (!task) return
    const updated = dailyRepeats.map(t => t.id === id ? { ...t, count: Math.min((t.count || 0) + 1, 7) } : t)
    await setDoc(dailyRef, { tasks: updated, weekKey: weekKey() })
    const alreadyIn = todayTasks.some(t => t.fromDTask && t.text === task.text)
    if (!alreadyIn) {
      const entry = { id: uuidv4(), text: task.text, done: true, carried: false, carryCount: 0, fromDTask: true, createdAt: Date.now() }
      await setDoc(todayRef, { tasks: [...todayTasks, entry], date: todayStr() })
    }
  }

  async function untapDailyRepeat(id) {
    const task = dailyRepeats.find(t => t.id === id)
    if (!task || (task.count || 0) === 0) return
    const updated = dailyRepeats.map(t => t.id === id ? { ...t, count: Math.max((t.count || 0) - 1, 0) } : t)
    await setDoc(dailyRef, { tasks: updated, weekKey: weekKey() })
    if ((task.count || 0) - 1 === 0) {
      await setDoc(todayRef, { tasks: todayTasks.filter(t => !(t.fromDTask && t.text === task.text)), date: todayStr() })
    }
  }

  // ── AI EVALUATION ─────────────────────────────────────
  async function evaluateWins() {
    setEvalError('')
    const completed = [
      ...todayTasks.filter(t => t.done).map(t => t.text),
      ...weeklyTasks.filter(t => t.done).map(t => t.text)
    ]
    const dTaskContext = dailyRepeats.length > 0
      ? '\n\nDaily habits this week:\n' + dailyRepeats.map((t, i) => `D${i + 1}: ${t.text} — completed ${t.count || 0}/7 days`).join('\n')
      : ''

    if (completed.length === 0) {
      setEvalError('No completed tasks to evaluate yet.')
      return
    }

    setEvalLoading(true)

    // Build win definitions from user profile or use defaults
    const defs = userProfile?.winsDefinition || {}
    const physDef = defs.physical || 'any meaningful movement — climbing, gym, run, MMA, workout, sports'
    const mentDef = defs.mental || 'academic, professional, or goal-directed work — studying, researching, building, solving'
    const spirDef = defs.spiritual || 'broad and personal — journaling, meditation, prayer, sleeping 9+ hours, meaningful conversation, reflection'

    const prompt = `You are evaluating whether someone achieved their Three Wins today based on their completed tasks.

Completed tasks today:
${completed.map((t, i) => `${i + 1}. ${t}`).join('\n')}${dTaskContext}

Definitions (personal to the user):
- Physical win: ${physDef}
- Mental win: ${mentDef}
- Spiritual win: ${spirDef}

Note: routine hygiene tasks (shower, eat, etc.) should NOT count as wins and should map to null.
Daily habits tapped today appear as completed tasks — treat them the same as any other completed task.
For taskMap, assign each task to "physical", "mental", "spiritual", or null.

Respond ONLY with valid JSON, no other text:
{"physical": true or false, "mental": true or false, "spiritual": true or false, "reasoning": "one or two sentence explanation", "taskMap": {"task text": "physical"|"mental"|"spiritual"|null}}`

    try {
      const response = await fetch(WORKER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
    'X-App-Secret': '3w-app-2026-xk9m'   // ← add this line
    },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 400,
          messages: [{ role: 'user', content: prompt }]
        })
      })
      const data = await response.json()
      const text = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim()
      const result = JSON.parse(text)

      const winsDoc = {
        date: todayStr(),
        physical: result.physical,
        mental: result.mental,
        spiritual: result.spiritual,
        reasoning: result.reasoning || '',
        taskMap: result.taskMap || {},
        evaluatedAt: Date.now(),
        overridePhysical: todayWins?.overridePhysical ?? null,
        overrideMental: todayWins?.overrideMental ?? null,
        overrideSpiritual: todayWins?.overrideSpiritual ?? null,
      }

      await setDoc(winsRef, winsDoc)
      await updateStreak(winsDoc)
      // onSnapshot will update todayWins state automatically
    } catch (e) {
      console.error('evaluateWins error:', e)
      setEvalError('Evaluation failed — check connection and try again.')
    }
    setEvalLoading(false)
  }

  async function toggleOverride(win) {
    if (!todayWins) return
    const key = `override${win.charAt(0).toUpperCase() + win.slice(1)}`
    const isOverridden = todayWins[key] != null

    let updated
    if (isOverridden) {
      // Revert: clear the override back to null (AI result takes effect again)
      updated = { ...todayWins, [key]: null }
    } else {
      // Override: flip the current effective value
      const currentAI = todayWins[win]
      updated = { ...todayWins, [key]: !currentAI }
    }

    await setDoc(winsRef, updated, { merge: true })
    await updateStreak(updated)
  }

  // ── STREAK ────────────────────────────────────────────
  async function updateStreak(winsData) {
    const todayIsWin = isThreeWinDay(winsData)

    const snap = await getDoc(streakRef)
    const existing = snap.exists()
      ? snap.data()
      : { current: 0, total: 0, best: 0, lastWinDate: '' }

    let { current, total, best, lastWinDate } = existing

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yStr = yesterday.toLocaleDateString('en-CA')
    const today = todayStr()

    if (todayIsWin) {
      if (lastWinDate !== today) {
        current = (lastWinDate === yStr) ? current + 1 : 1
        total = (total || 0) + 1
        best = Math.max(best || 0, current)
        lastWinDate = today
      }
    } else {
      // If today was previously counted as a win but now isn't (override removed it)
      if (lastWinDate === today) {
        current = Math.max(0, current - 1)
        total = Math.max(0, total - 1)
        lastWinDate = yStr // roll back to yesterday
      }
    }

    await setDoc(streakRef, { current, total, best, lastWinDate })
    // onSnapshot will update streak state automatically
  }

  // ── ARCHIVE HELPERS ───────────────────────────────────
  function toggleDay(date) {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }))
  }

  function toggleWeek(wk) {
    setExpandedWeeks(prev => ({ ...prev, [wk]: !prev[wk] }))
  }

  // Group archive days by week
  function groupDaysByWeek() {
    const byWeek = {}
    archiveDays.forEach(day => {
      const wk = getWeekKeyForDate(day.date)
      if (!byWeek[wk]) byWeek[wk] = []
      byWeek[wk].push(day)
    })
    // sort days within each week descending
    Object.values(byWeek).forEach(arr => arr.sort((a, b) => b.date.localeCompare(a.date)))
    return byWeek
  }

  // ── WIN BADGE COMPONENT ───────────────────────────────
  function WinBadge({ type, value, size = 'sm' }) {
    const labels = { physical: 'P', mental: 'M', spiritual: 'S' }
    const achieved = value === true
    const missed = value === false
    const pending = value == null
    return (
      <span className={`win-badge win-badge-${type} ${achieved ? 'achieved' : missed ? 'missed' : 'pending'} ${size}`}>
        <span className="win-badge-dot" />
        <span className="win-badge-label">{labels[type]}</span>
        <span className="win-badge-tick">{achieved ? '✓' : missed ? '✗' : '–'}</span>
      </span>
    )
  }

  function getEffectiveWin(winsData, type) {
    if (!winsData) return null
    const overrideKey = `override${type.charAt(0).toUpperCase() + type.slice(1)}`
    const override = winsData[overrideKey]
    return override != null ? override : winsData[type]
  }

  // ── RENDER ────────────────────────────────────────────
  const doneTasks = todayTasks.filter(t => t.done).length
  const totalTasks = todayTasks.length
  const pct = totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100)

  const evalTime = todayWins?.evaluatedAt
    ? new Date(todayWins.evaluatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  const daysByWeek = groupDaysByWeek()
  const allWeekKeys = new Set([
    ...archiveWeeks.map(w => w.weekKey),
    ...Object.keys(daysByWeek)
  ])
  const sortedWeekKeys = [...allWeekKeys].sort().reverse()

  return (
    <div className="home">

      {/* HEADER */}
      <div className="home-header">
        <div className="home-nav">
          <span className="home-logo">threedailywins</span>
          <button className="signout-btn" onClick={() => signOut(auth)}>Sign out</button>
        </div>
        <div className="home-stats">
          <div className="stat-pill stat-pill-clickable" onClick={() => setStreakPopupOpen(o => !o)} style={{ position: 'relative' }}>
            <span className="stat-val">{streak.current}</span>
            <span className="stat-label">streak</span>
            {streakPopupOpen && (
              <div className="streak-popup">
                <div className="streak-popup-row">
                  <span className="streak-popup-label">Current</span>
                  <span className="streak-popup-val">{streak.current}</span>
                </div>
                <div className="streak-popup-row">
                  <span className="streak-popup-label">Best</span>
                  <span className="streak-popup-val">{streak.best}</span>
                </div>
              </div>
            )}
          </div>
          <div className="stat-pill"><span className="stat-val">—</span><span className="stat-label">rank</span></div>
          <div className="stat-pill"><span className="stat-val">{streak.total}</span><span className="stat-label">total wins</span></div>
        </div>
      </div>

      {/* TABS */}
      <div className="tab-bar">
        {['today', 'tomorrow', 'weekly', 'archive'].map(tab => (
          <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* CONTENT */}
      <div className="tab-content">

        {/* ── TODAY ── */}
        {activeTab === 'today' && (
          <div>
            <div className="progress-row">
              <span className="progress-label">{doneTasks} of {totalTasks} tasks</span>
              <span className="progress-pct">{pct}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>

            <div className="add-row">
              <input
                className="task-input"
                placeholder="Add task..."
                value={todayInput}
                onChange={e => setTodayInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <button className="add-btn" onClick={addTask}>+</button>
            </div>

            <div className="task-list">
              {todayTasks.length === 0 && <p className="empty-msg">No tasks yet</p>}
              {todayTasks.map((t, i) => (
                <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                  <button className={`check-btn ${t.done ? 'checked' : ''}`} onClick={() => toggleTask('today', t.id)} />
                  <span className="task-num">T{i + 1}</span>
                  <span className="task-text">
                    {t.text}
                    {t.carried && <span className="tag carried-tag">carried</span>}
                    {t.fromDTask && <span className="tag daily-tag">daily</span>}
                  </span>
                  <button className="delete-btn" onClick={() => deleteTask('today', t.id)}>×</button>
                </div>
              ))}
            </div>

            {/* ── AI WINS EVAL PANEL ── */}
            <div className="wins-panel">
              <div className="wins-panel-header">
                <span className="wins-panel-title">Three Wins</span>
                <button
                  className="eval-btn"
                  onClick={evaluateWins}
                  disabled={evalLoading}
                >
                  {evalLoading ? 'Evaluating…' : todayWins?.evaluatedAt ? 'Re-evaluate' : 'Evaluate'}
                </button>
              </div>

              {evalTime && (
                <p className="eval-meta">Evaluated at {evalTime} · Powered by Claude AI</p>
              )}
              {evalError && <p className="eval-error">{evalError}</p>}

              {['physical', 'mental', 'spiritual'].map(type => {
                const effective = getEffectiveWin(todayWins, type)
                const overrideKey = `override${type.charAt(0).toUpperCase() + type.slice(1)}`
                const isOverridden = todayWins?.[overrideKey] != null
                const labels = { physical: 'Physical', mental: 'Mental', spiritual: 'Spiritual' }

                return (
                  <div key={type} className={`win-row ${effective === true ? 'achieved' : effective === false ? 'missed' : 'pending'}`}>
                    <div className="win-row-top">
                      <span className="win-row-label">{labels[type]}</span>
                      <div className="win-row-right">
                        <span className={`win-status-pill ${effective === true ? 'achieved' : effective === false ? 'missed' : 'pending'}`}>
                          {effective === true ? '✓ Achieved' : effective === false ? '✗ Not detected' : '– Pending'}
                        </span>
                        {todayWins?.evaluatedAt && (
                          <button
                            className="override-btn"
                            onClick={() => toggleOverride(type)}
                            title={isOverridden ? 'Overridden' : 'Override'}
                          >
                            {isOverridden ? 'Revert' : 'Override'}
                          </button>
                        )}
                      </div>
                    </div>
                    {todayWins?.reasoning && (
                      <p className="win-reasoning">{todayWins.reasoning}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── TOMORROW ── */}
        {activeTab === 'tomorrow' && (
          <div>
            <div className="add-row">
              <input
                className="task-input"
                placeholder="Queue for tomorrow..."
                value={tomorrowInput}
                onChange={e => setTomorrowInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <button className="add-btn" onClick={addTask}>+</button>
            </div>
            <div className="task-list">
              {tomorrowTasks.length === 0 && <p className="empty-msg">Nothing queued</p>}
              {tomorrowTasks.map((t, i) => (
                <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                  <button className={`check-btn ${t.done ? 'checked' : ''}`} onClick={() => toggleTask('tomorrow', t.id)} />
                  <span className="task-num">Tm{i + 1}</span>
                  <span className="task-text">{t.text}</span>
                  <button className="delete-btn" onClick={() => deleteTask('tomorrow', t.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── WEEKLY ── */}
        {activeTab === 'weekly' && (
          <div>
            <p className="week-range">{weekRangeLabel()}</p>

            <p className="section-label">Weekly goals</p>
            <div className="add-row">
              <input
                className="task-input"
                placeholder="Add weekly goal..."
                value={weeklyInput}
                onChange={e => setWeeklyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />
              <button className="add-btn" onClick={addTask}>+</button>
            </div>
            <div className="task-list">
              {weeklyTasks.length === 0 && <p className="empty-msg">No weekly goals</p>}
              {weeklyTasks.map((t, i) => (
                <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                  <button className={`check-btn ${t.done ? 'checked' : ''}`} onClick={() => toggleTask('weekly', t.id)} />
                  <span className="task-num">W{i + 1}</span>
                  <span className="task-text">{t.text}
                    {t.carried && <span className="tag carried-tag">carried</span>}
                  </span>
                  <button className="delete-btn" onClick={() => deleteTask('weekly', t.id)}>×</button>
                </div>
              ))}
            </div>

            <p className="section-label" style={{ marginTop: '1.5rem' }}>Daily habits</p>
            <div className="add-row">
              <input
                className="task-input"
                placeholder="Add daily habit..."
                value={dailyInput}
                onChange={e => setDailyInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addDailyRepeat()}
              />
              <button className="add-btn" onClick={addDailyRepeat}>+</button>
            </div>
            <div className="task-list">
              {dailyRepeats.length === 0 && <p className="empty-msg">No daily habits</p>}
              {dailyRepeats.map((t, i) => (
                <div key={t.id} className="task-item">
                  <span className="task-num">D{i + 1}</span>
                  <span className="task-text">{t.text}</span>
                  <div className="d-bar-wrap">
                    <div className="d-bar-fill" style={{ width: `${Math.round(((t.count || 0) / 7) * 100)}%` }} />
                  </div>
                  <span className="d-count">{t.count || 0}/7</span>
                  <button className="tap-btn" onClick={() => tapDailyRepeat(t.id)}>+</button>
                  <button className="tap-btn minus" onClick={() => untapDailyRepeat(t.id)} disabled={(t.count || 0) === 0}>−</button>
                  <button className="delete-btn" onClick={() => deleteDailyRepeat(t.id)}>×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ARCHIVE ── */}
        {activeTab === 'archive' && (
          <div>
            {archiveLoading && <p className="empty-msg">Loading archive…</p>}

            {!archiveLoading && archiveDays.length === 0 && archiveWeeks.length === 0 && (
              <p className="empty-msg">No archive yet — days archive automatically at midnight.</p>
            )}

            {!archiveLoading && sortedWeekKeys.map(wk => {
              const weekData = archiveWeeks.find(w => w.weekKey === wk) || null
              const days = daysByWeek[wk] || []
              const weekWins = winsCache['week-' + wk] || null
              const weekOpen = expandedWeeks[wk] !== false // default open

              return (
                <div key={wk} className="archive-week-group">

                  {/* Week header */}
                  <div className="archive-week-header" onClick={() => toggleWeek(wk)}>
                    <div className="archive-week-left">
                      <span className="archive-week-title">{weekLabelFromKey(wk, weekData?.weekStart)}</span>
                      {isThreeWinDay(weekWins) && <span className="three-wins-badge">Three Wins Week</span>}
                    </div>
                    <div className="archive-week-right">
                      <div className="archive-win-badges">
                        {['physical', 'mental', 'spiritual'].map(type => (
                          <WinBadge key={type} type={type} value={getEffectiveWin(weekWins, type)} size="sm" />
                        ))}
                      </div>
                      <span className={`archive-chevron ${weekOpen ? 'open' : ''}`}>▼</span>
                    </div>
                  </div>

                  {/* Week body */}
                  {weekOpen && (
                    <div className="archive-week-body">

                      {/* Weekly goals summary inside week */}
                      {weekData && (weekData.wTasks?.length > 0 || weekData.dTasks?.length > 0) && (
                        <div className="archive-week-summary">
                          {weekData.dTasks?.length > 0 && (
                            <div className="archive-week-section">
                              <p className="archive-week-section-label">Daily Habits</p>
                              {weekData.dTasks.map((t, i) => {
                                const pct2 = Math.round(((t.count || 0) / 7) * 100)
                                return (
                                  <div key={i} className="archive-d-row">
                                    <span className="archive-d-label">D{i + 1} — {t.text}</span>
                                    <div className="archive-d-bar">
                                      <div className="archive-d-bar-fill" style={{ width: `${pct2}%` }} />
                                    </div>
                                    <span className="archive-d-count">{t.count || 0}/7</span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          {weekData.wTasks?.length > 0 && (
                            <div className="archive-week-section">
                              <p className="archive-week-section-label">Weekly Goals</p>
                              {weekData.wTasks.map((t, i) => (
                                <div key={i} className={`archive-w-row ${t.done ? 'done' : ''}`}>
                                  <span className={`archive-w-dot ${t.done ? 'done' : ''}`} />
                                  <span className="archive-w-text">W{i + 1} — {t.text}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {weekWins?.reasoning && (
                            <p className="archive-reasoning">{weekWins.reasoning}</p>
                          )}
                        </div>
                      )}

                      {/* Day rows */}
                      {days.map(day => {
                        const dayTasks = day.tasks || []
                        const done2 = dayTasks.filter(t => t.done).length
                        const pct2 = dayTasks.length > 0 ? Math.round(done2 / dayTasks.length * 100) : 0
                        const dayWins = winsCache[day.date] || null
                        const threeWin = isThreeWinDay(dayWins)
                        const dayOpen = expandedDays[day.date]
                        const dateLabel = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', {
                          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                        })

                        return (
                          <div key={day.date} className={`archive-day ${threeWin ? 'three-win' : ''}`}>
                            <div className="archive-day-header" onClick={() => toggleDay(day.date)}>
                              <div className="archive-day-left">
                                <span className={`archive-day-date ${threeWin ? 'three-win' : ''}`}>{dateLabel}</span>
                                <span className="archive-day-meta">{done2}/{dayTasks.length} · {pct2}%</span>
                                {threeWin && <span className="three-wins-badge">Three Wins</span>}
                              </div>
                              <div className="archive-day-right">
                                <div className="archive-win-badges">
                                  {['physical', 'mental', 'spiritual'].map(type => (
                                    <WinBadge key={type} type={type} value={getEffectiveWin(dayWins, type)} size="xs" />
                                  ))}
                                </div>
                                <span className={`archive-chevron ${dayOpen ? 'open' : ''}`}>▼</span>
                              </div>
                            </div>

                            {dayOpen && (
                              <div className="archive-day-body">
                                {dayTasks.map((t, i) => {
                                  const winCat = dayWins?.taskMap?.[t.text]
                                  const winDot = winCat ? `win-dot-${winCat}` : ''
                                  return (
                                    <div key={i} className={`archive-task ${t.done ? 'done' : ''}`}>
                                      <span className={`archive-task-dot ${t.done ? 'done' : ''}`} />
                                      {winCat && <span className={`archive-win-dot ${winDot}`} />}
                                      <span className="archive-task-text">{t.text}</span>
                                    </div>
                                  )
                                })}
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
        )}

      </div>
    </div>
  )
}

export default Home
