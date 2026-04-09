import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { auth, db } from '../firebase'
import { signOut, deleteUser } from 'firebase/auth'
import {
  doc, onSnapshot,
  setDoc, getDoc, collection, getDocs, query, where, orderBy, deleteDoc, writeBatch
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
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('today')
  const [activeNav, setActiveNav] = useState('home')
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

  // Friends search state
  const [friendSearch, setFriendSearch] = useState('')
  const [friendSearchError, setFriendSearchError] = useState('')

  // Leaderboard state
  const [lbTab, setLbTab] = useState('streak')        // 'streak' | 'wins'
  const [lbEntries, setLbEntries] = useState([])
  const [lbLoading, setLbLoading] = useState(false)

  // Friends state
  const [incomingRequests, setIncomingRequests] = useState([])  // array of { uid, username, photoURL, sentAt }
  const [friendsList, setFriendsList] = useState([])            // array of { uid, username, photoURL }
  const [sendRequestStatus, setSendRequestStatus] = useState('') // '', 'sending', 'sent', 'already_friends', 'already_sent', 'error'
  const [searchedUser, setSearchedUser] = useState(null)        // { uid, username, photoURL } from last search

  // Profile / settings state
  const [editPhysical, setEditPhysical] = useState('')
  const [editMental, setEditMental] = useState('')
  const [editSpiritual, setEditSpiritual] = useState('')
  const [defsSaved, setDefsSaved] = useState(false)
  const [defsLoading, setDefsLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Visibility settings state
  const [visTodo, setVisTodo] = useState('friends')
  const [visStats, setVisStats] = useState('public')
  const [visSaved, setVisSaved] = useState(false)

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
      if (snap.exists()) {
        const data = snap.data()
        setUserProfile(data)
        setEditPhysical(data.winsDefinition?.physical || '')
        setEditMental(data.winsDefinition?.mental || '')
        setEditSpiritual(data.winsDefinition?.spiritual || '')
        setVisTodo(data.visibility?.todo || 'friends')
        setVisStats(data.visibility?.stats || 'public')
      }
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

  // ── FRIENDS LISTENERS ────────────────────────────────
  useEffect(() => {
    if (!uid) return
    // Listen to incoming friend requests
    const reqRef = collection(db, 'friendRequests', uid, 'incoming')
    const unsubReq = onSnapshot(reqRef, snap => {
      setIncomingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    // Listen to confirmed friends list
    const friendsRef = collection(db, 'friends', uid, 'list')
    const unsubFriends = onSnapshot(friendsRef, snap => {
      setFriendsList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => { unsubReq(); unsubFriends() }
  }, [uid])

  // ── LOAD ARCHIVE (when tab switches to archive) ───────
  useEffect(() => {
    if (activeNav === 'archive' && uid) {
      loadArchive()
    }
  }, [activeNav, uid])

  // ── LOAD LEADERBOARD (when tab switches to leaderboard) ──
  useEffect(() => {
    if (activeNav === 'leaderboard') {
      loadLeaderboard()
    }
  }, [activeNav])

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

    // Write public leaderboard entry
    await setDoc(doc(db, 'leaderboard', uid), {
      uid,
      username: userProfile?.username || '',
      photoURL: user?.photoURL || '',
      current,
      total,
      best,
      updatedAt: Date.now()
    })
    // onSnapshot will update streak state automatically
  }

  // ── PROFILE ACTIONS ──────────────────────────────────
  async function saveWinDefinitions() {
    if (!uid) return
    setDefsLoading(true)
    setDefsSaved(false)
    const updated = {
      ...userProfile,
      winsDefinition: {
        physical: editPhysical.trim() || userProfile?.winsDefinition?.physical || '',
        mental: editMental.trim() || userProfile?.winsDefinition?.mental || '',
        spiritual: editSpiritual.trim() || userProfile?.winsDefinition?.spiritual || '',
      }
    }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
    setDefsLoading(false)
    setDefsSaved(true)
    setTimeout(() => setDefsSaved(false), 2500)
  }

  async function saveVisibility(todoVal, statsVal) {
    if (!uid) return
    const updated = {
      ...userProfile,
      visibility: {
        todo: todoVal,
        archive: todoVal,   // archive follows todo for now
        stats: statsVal,
      }
    }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
    setVisSaved(true)
    setTimeout(() => setVisSaved(false), 2500)
  }

  async function deleteAccount() {
    if (!uid) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      // Delete all user subcollections we can reach
      const batch = writeBatch(db)
      // We delete the user doc — subcollections persist but are orphaned (clean up via Cloud Functions later)
      batch.delete(doc(db, 'users', uid))
      batch.delete(doc(db, 'streak', uid, 'data', 'current'))
      await batch.commit()
      // Delete Firebase Auth account
      await deleteUser(auth.currentUser)
      // Auth state change will redirect to login via ProtectedRoute
    } catch (e) {
      console.error('deleteAccount error:', e)
      if (e.code === 'auth/requires-recent-login') {
        setDeleteError('For security, please sign out and sign back in before deleting your account.')
      } else {
        setDeleteError('Something went wrong — please try again.')
      }
      setDeleteLoading(false)
    }
  }

  // ── FRIENDS SEARCH ───────────────────────────────────
  async function searchUser() {
    const trimmed = friendSearch.trim().toLowerCase()
    if (!trimmed) return
    setFriendSearchError('')
    setSearchedUser(null)
    setSendRequestStatus('')
    try {
      const q = query(collection(db, 'users'), where('username', '==', trimmed))
      const snap = await getDocs(q)
      if (snap.empty) {
        setFriendSearchError('No user found with that username.')
        return
      }
      const found = snap.docs[0].data()
      setSearchedUser({ uid: found.uid, username: found.username, photoURL: found.photoURL || '' })
    } catch (e) {
      setFriendSearchError('Something went wrong — try again.')
    }
  }

  async function sendFriendRequest() {
    if (!searchedUser || !uid) return
    const targetUid = searchedUser.uid

    // Can't add yourself
    if (targetUid === uid) {
      setSendRequestStatus('error_self')
      return
    }

    setSendRequestStatus('sending')

    // Check if already friends
    const friendSnap = await getDoc(doc(db, 'friends', uid, 'list', targetUid))
    if (friendSnap.exists()) {
      setSendRequestStatus('already_friends')
      return
    }

    // Check if request already sent
    const sentSnap = await getDoc(doc(db, 'friendRequests', targetUid, 'incoming', uid))
    if (sentSnap.exists()) {
      setSendRequestStatus('already_sent')
      return
    }

    // Send request — write to their incoming subcollection
    await setDoc(doc(db, 'friendRequests', targetUid, 'incoming', uid), {
      uid,
      username: userProfile?.username || '',
      photoURL: user?.photoURL || '',
      sentAt: Date.now()
    })
    setSendRequestStatus('sent')
  }

  async function acceptRequest(senderUid, senderUsername, senderPhotoURL) {
    // Write to both friends lists
    await setDoc(doc(db, 'friends', uid, 'list', senderUid), {
      uid: senderUid,
      username: senderUsername,
      photoURL: senderPhotoURL || '',
      since: Date.now()
    })
    await setDoc(doc(db, 'friends', senderUid, 'list', uid), {
      uid,
      username: userProfile?.username || '',
      photoURL: user?.photoURL || '',
      since: Date.now()
    })
    // Remove the request
    await deleteDoc(doc(db, 'friendRequests', uid, 'incoming', senderUid))
  }

  async function declineRequest(senderUid) {
    await deleteDoc(doc(db, 'friendRequests', uid, 'incoming', senderUid))
  }

  async function removeFriend(friendUid) {
    await deleteDoc(doc(db, 'friends', uid, 'list', friendUid))
    await deleteDoc(doc(db, 'friends', friendUid, 'list', uid))
  }

  // ── LEADERBOARD ──────────────────────────────────────
  async function loadLeaderboard() {
    setLbLoading(true)
    try {
      const snap = await getDocs(collection(db, 'leaderboard'))
      const entries = snap.docs.map(d => d.data())
      setLbEntries(entries)
    } catch (e) {
      console.error('loadLeaderboard error:', e)
    }
    setLbLoading(false)
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
        </div>
        {activeNav !== 'profile' && <div className="home-stats">
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
        </div>}
      </div>

      {/* SUB-TABS — only shown on Home nav */}
      {activeNav === 'home' && (
        <div className="tab-bar">
          {['today', 'tomorrow', 'weekly'].map(tab => (
            <button key={tab} className={`tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* CONTENT */}
      <div className="tab-content">

        {/* ── TODAY ── */}
        {activeNav === 'home' && activeTab === 'today' && (
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
        {activeNav === 'home' && activeTab === 'tomorrow' && (
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
        {activeNav === 'home' && activeTab === 'weekly' && (
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

        {/* ── FRIENDS ── */}
        {activeNav === 'friends' && (
          <div className="friends-screen">

            {/* Search */}
            <p className="friends-title">Find people</p>
            <p className="friends-sub">Search by username to add as a friend.</p>
            <div className="friends-search-row">
              <span className="friends-at">@</span>
              <input
                className="friends-input"
                placeholder="username"
                value={friendSearch}
                onChange={e => { setFriendSearch(e.target.value); setFriendSearchError(''); setSearchedUser(null); setSendRequestStatus('') }}
                onKeyDown={e => e.key === 'Enter' && searchUser()}
              />
              <button className="friends-search-btn" onClick={searchUser}>Search</button>
            </div>
            {friendSearchError && <p className="friends-error">{friendSearchError}</p>}

            {/* Search result */}
            {searchedUser && (
              <div className="friends-result">
                <div className="friends-result-identity">
                  <div className="lb-avatar">
                    {searchedUser.photoURL
                      ? <img src={searchedUser.photoURL} alt="" className="profile-avatar-img" />
                      : <span className="profile-avatar-initial">{searchedUser.username[0].toUpperCase()}</span>
                    }
                  </div>
                  <span className="friends-result-name" onClick={() => navigate(`/u/${searchedUser.username}`)}>
                    @{searchedUser.username}
                  </span>
                </div>
                <div className="friends-result-actions">
                  {searchedUser.uid === uid ? (
                    <span className="friends-status-msg">That's you</span>
                  ) : friendsList.some(f => f.uid === searchedUser.uid) ? (
                    <span className="friends-status-msg friends-status-green">Already friends</span>
                  ) : sendRequestStatus === 'sent' ? (
                    <span className="friends-status-msg friends-status-green">Request sent!</span>
                  ) : sendRequestStatus === 'already_sent' ? (
                    <span className="friends-status-msg">Request already sent</span>
                  ) : (
                    <button
                      className="friends-add-btn"
                      onClick={sendFriendRequest}
                      disabled={sendRequestStatus === 'sending'}
                    >
                      {sendRequestStatus === 'sending' ? 'Sending…' : '+ Add friend'}
                    </button>
                  )}
                  <button className="friends-view-btn" onClick={() => navigate(`/u/${searchedUser.username}`)}>
                    View profile
                  </button>
                </div>
              </div>
            )}

            <div className="friends-divider" />

            {/* Incoming requests */}
            {incomingRequests.length > 0 && (
              <div className="friends-section">
                <p className="friends-section-title">
                  Friend requests
                  <span className="friends-badge">{incomingRequests.length}</span>
                </p>
                {incomingRequests.map(req => (
                  <div key={req.id} className="friends-request-row">
                    <div className="lb-avatar">
                      {req.photoURL
                        ? <img src={req.photoURL} alt="" className="profile-avatar-img" />
                        : <span className="profile-avatar-initial">{(req.username || '?')[0].toUpperCase()}</span>
                      }
                    </div>
                    <span
                      className="friends-req-name"
                      onClick={() => navigate(`/u/${req.username}`)}
                    >@{req.username}</span>
                    <div className="friends-req-actions">
                      <button className="friends-accept-btn" onClick={() => acceptRequest(req.uid, req.username, req.photoURL)}>Accept</button>
                      <button className="friends-decline-btn" onClick={() => declineRequest(req.uid)}>Decline</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Friends list */}
            <div className="friends-section">
              <p className="friends-section-title">Friends ({friendsList.length})</p>
              {friendsList.length === 0 ? (
                <p className="friends-empty">No friends yet — search for someone to add.</p>
              ) : (
                friendsList.map(f => (
                  <div key={f.id} className="friends-list-row">
                    <div className="lb-avatar">
                      {f.photoURL
                        ? <img src={f.photoURL} alt="" className="profile-avatar-img" />
                        : <span className="profile-avatar-initial">{(f.username || '?')[0].toUpperCase()}</span>
                      }
                    </div>
                    <span
                      className="friends-list-name"
                      onClick={() => navigate(`/u/${f.username}`)}
                    >@{f.username}</span>
                    <button className="friends-remove-btn" onClick={() => removeFriend(f.uid)}>Remove</button>
                  </div>
                ))
              )}
            </div>

          </div>
        )}

        {/* ── LEADERBOARD PLACEHOLDER ── */}
        {activeNav === 'leaderboard' && (
          <div className="lb-screen">

            {/* Sub-tabs */}
            <div className="lb-tabs">
              <button
                className={`lb-tab ${lbTab === 'streak' ? 'active' : ''}`}
                onClick={() => setLbTab('streak')}
              >Streak</button>
              <button
                className={`lb-tab ${lbTab === 'wins' ? 'active' : ''}`}
                onClick={() => setLbTab('wins')}
              >Total Wins</button>
              <button
                className={`lb-tab ${lbTab === 'friends' ? 'active' : ''}`}
                onClick={() => setLbTab('friends')}
              >Friends</button>
            </div>

            {/* Friends leaderboard */}
            {lbTab === 'friends' && (
              <div className="lb-list" style={{ padding: '0 1rem' }}>
                {friendsList.length === 0 ? (
                  <p className="empty-msg" style={{ paddingTop: '1.5rem' }}>Add friends to see a friend leaderboard.</p>
                ) : (() => {
                  // Filter leaderboard entries to friends + self
                  const friendUids = new Set([...friendsList.map(f => f.uid), uid])
                  const sorted = lbEntries
                    .filter(e => friendUids.has(e.uid))
                    .sort((a, b) => (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0))
                  return sorted.map((entry, i) => {
                    const isMe = entry.uid === uid
                    return (
                      <div key={entry.uid} className={`lb-row ${isMe ? 'me' : ''}`}
                        onClick={() => entry.username && navigate(`/u/${entry.username}`)}>
                        <span className={`lb-rank ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                        <div className="lb-avatar">
                          {entry.photoURL
                            ? <img src={entry.photoURL} alt="" className="profile-avatar-img" />
                            : <span className="profile-avatar-initial">{(entry.username || '?')[0].toUpperCase()}</span>
                          }
                        </div>
                        <span className="lb-username">
                          @{entry.username || '—'}
                          {isMe && <span className="lb-you"> you</span>}
                        </span>
                        <div className="lb-stats">
                          <span className="lb-stat-val">{entry.current ?? 0}</span>
                          <span className="lb-stat-label">streak</span>
                        </div>
                        <div className="lb-stats">
                          <span className="lb-stat-val">{entry.total ?? 0}</span>
                          <span className="lb-stat-label">wins</span>
                        </div>
                      </div>
                    )
                  })
                })()}
              </div>
            )}

            {/* Global leaderboard */}
            {(lbTab === 'streak' || lbTab === 'wins') && (
              <>
                {lbLoading && <p className="empty-msg">Loading…</p>}
                {!lbLoading && (() => {
                  const sorted = [...lbEntries].sort((a, b) => {
                    if (lbTab === 'streak') {
                      return (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0)
                    } else {
                      return (b.total ?? 0) - (a.total ?? 0) || (b.current ?? 0) - (a.current ?? 0)
                    }
                  })

                  // Find own rank
                  const ownRank = sorted.findIndex(e => e.uid === uid) + 1
                  // Show top 50, always include self if outside top 50
                  const top = sorted.slice(0, 50)
                  const selfEntry = sorted.find(e => e.uid === uid)
                  const selfInTop = top.some(e => e.uid === uid)

                  return (
                    <div className="lb-list">
                      {top.length === 0 && (
                        <p className="empty-msg">No entries yet — evaluate your wins to appear here.</p>
                      )}
                      {top.map((entry, i) => {
                        const isMe = entry.uid === uid
                        const rank = i + 1
                        return (
                          <div
                            key={entry.uid}
                            className={`lb-row ${isMe ? 'me' : ''}`}
                            onClick={() => entry.username && navigate(`/u/${entry.username}`)}
                          >
                            <span className={`lb-rank ${rank <= 3 ? 'top' : ''}`}>
                              {rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : rank}
                            </span>
                            <div className="lb-avatar">
                              {entry.photoURL
                                ? <img src={entry.photoURL} alt="" className="profile-avatar-img" />
                                : <span className="profile-avatar-initial">
                                    {(entry.username || '?')[0].toUpperCase()}
                                  </span>
                              }
                            </div>
                            <span className="lb-username">
                              @{entry.username || '—'}
                              {isMe && <span className="lb-you"> you</span>}
                            </span>
                            <div className="lb-stats">
                              <span className="lb-stat-val">{entry.current ?? 0}</span>
                              <span className="lb-stat-label">streak</span>
                            </div>
                            <div className="lb-stats">
                              <span className="lb-stat-val">{entry.total ?? 0}</span>
                              <span className="lb-stat-label">wins</span>
                            </div>
                          </div>
                        )
                      })}

                      {/* Show own row outside top 50 */}
                      {!selfInTop && selfEntry && (
                        <>
                          <div className="lb-gap">···</div>
                          <div className="lb-row me">
                            <span className="lb-rank">{ownRank}</span>
                            <div className="lb-avatar">
                              {selfEntry.photoURL
                                ? <img src={selfEntry.photoURL} alt="" className="profile-avatar-img" />
                                : <span className="profile-avatar-initial">
                                    {(selfEntry.username || '?')[0].toUpperCase()}
                                  </span>
                              }
                            </div>
                            <span className="lb-username">
                              @{selfEntry.username || '—'}
                              <span className="lb-you"> you</span>
                            </span>
                            <div className="lb-stats">
                              <span className="lb-stat-val">{selfEntry.current ?? 0}</span>
                              <span className="lb-stat-label">streak</span>
                            </div>
                            <div className="lb-stats">
                              <span className="lb-stat-val">{selfEntry.total ?? 0}</span>
                              <span className="lb-stat-label">wins</span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )}

        {/* ── PROFILE / SETTINGS ── */}
        {activeNav === 'profile' && (
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

            {/* Win definitions */}
            <div className="profile-section">
              <p className="profile-section-title">Win Definitions</p>
              <p className="profile-section-sub">Used by Claude to evaluate your daily wins.</p>

              <label className="profile-def-label">Physical</label>
              <textarea
                className="profile-def-input"
                value={editPhysical}
                onChange={e => setEditPhysical(e.target.value)}
                rows={2}
                placeholder="e.g. Any workout, climb, or run"
              />
              <label className="profile-def-label">Mental</label>
              <textarea
                className="profile-def-input"
                value={editMental}
                onChange={e => setEditMental(e.target.value)}
                rows={2}
                placeholder="e.g. Study session, deep work"
              />
              <label className="profile-def-label">Spiritual</label>
              <textarea
                className="profile-def-input"
                value={editSpiritual}
                onChange={e => setEditSpiritual(e.target.value)}
                rows={2}
                placeholder="e.g. Journal, meditate, sleep early"
              />

              <button
                className="profile-save-btn"
                onClick={saveWinDefinitions}
                disabled={defsLoading}
              >
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

            {/* Sign out */}
            <div className="profile-section">
              <button className="profile-signout-btn" onClick={() => signOut(auth)}>
                Sign out
              </button>
            </div>

            {/* Delete account */}
            <div className="profile-section profile-danger-zone">
              <p className="profile-section-title danger">Danger zone</p>
              {!deleteConfirm ? (
                <button className="profile-delete-btn" onClick={() => setDeleteConfirm(true)}>
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
        )}

        {/* ── ARCHIVE ── */}
        {activeNav === 'archive' && (
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

      {/* ── BOTTOM NAV ── */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-item ${activeNav === 'home' ? 'active' : ''}`}
          onClick={() => setActiveNav('home')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
          </svg>
          <span className="bottom-nav-label">Home</span>
        </button>

        <button
          className={`bottom-nav-item ${activeNav === 'archive' ? 'active' : ''}`}
          onClick={() => setActiveNav('archive')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="3" width="20" height="5" rx="1"/>
            <path d="M4 8v11a1 1 0 001 1h14a1 1 0 001-1V8"/>
            <path d="M10 12h4"/>
          </svg>
          <span className="bottom-nav-label">Archive</span>
        </button>

        <button
          className={`bottom-nav-item ${activeNav === 'friends' ? 'active' : ''}`}
          onClick={() => setActiveNav('friends')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="7" r="4"/>
            <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/>
            <path d="M16 3.13a4 4 0 010 7.75"/>
            <path d="M21 21v-2a4 4 0 00-3-3.87"/>
          </svg>
          <span className="bottom-nav-label">Friends</span>
        </button>

        <button
          className={`bottom-nav-item ${activeNav === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setActiveNav('leaderboard')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="18" y="3" width="4" height="18" rx="1"/>
            <rect x="10" y="8" width="4" height="13" rx="1"/>
            <rect x="2" y="13" width="4" height="8" rx="1"/>
          </svg>
          <span className="bottom-nav-label">Ranks</span>
        </button>

        <button
          className={`bottom-nav-item ${activeNav === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveNav('profile')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20v-1a8 8 0 0116 0v1"/>
          </svg>
          <span className="bottom-nav-label">Profile</span>
        </button>
      </nav>

    </div>
  )
}

export default Home
