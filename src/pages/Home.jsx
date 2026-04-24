import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { todayStr, tomorrowStr, weekKey, getWeekKeyForDate, isThreeWinDay, getEffectiveWin } from './tabs/utils'
import ArchiveTab from './tabs/ArchiveTab'
import CalendarTab from './tabs/CalendarTab'
import LeaderboardTab from './tabs/LeaderboardTab'
import FriendsTab from './tabs/FriendsTab'
import ProfileTab from './tabs/ProfileTab'
import TodayTab from './tabs/TodayTab'
import { auth, db } from '../firebase'
import { getFunctions, httpsCallable } from 'firebase/functions'
import { signOut, deleteUser } from 'firebase/auth'
import {
  doc, onSnapshot,
  setDoc, getDoc, collection, getDocs, query, where, deleteDoc, writeBatch
} from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'

const functions = getFunctions()
const evaluateWinFn        = httpsCallable(functions, 'evaluateWin')
const sendKudosFn          = httpsCallable(functions, 'sendKudos')
const sendNudgeFn          = httpsCallable(functions, 'sendNudge')
const sendChallengeFn      = httpsCallable(functions, 'sendChallenge')
const respondToChallengeFn = httpsCallable(functions, 'respondToChallenge')
const completeChallengeFn  = httpsCallable(functions, 'completeChallenge')

// ── HELPERS ──────────────────────────────────────────────
// ── MAIN COMPONENT ───────────────────────────────────────
function Home({ isGuest = false }) {
  const user = isGuest ? null : auth.currentUser
  const uid = user?.uid || 'guest'
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('today')
  const { nav: activeNav = 'home' } = useParams()
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

  // Tutorial state
  const [tutorialStep, setTutorialStep] = useState(0) // 0 = hidden, 1-4 = steps


  const [todayWins, setTodayWins] = useState(null) // { physical, mental, spiritual, reasoning, taskMap, evaluatedAt, overridePhysical, overrideMental, overrideSpiritual }
  const [evalLoading, setEvalLoading] = useState(false)
  const [evalError, setEvalError] = useState('')
  const [evalsToday, setEvalsToday] = useState(0)
  const [addFlash, setAddFlash] = useState(false)       // + button flash on task add
  const [evalFlash, setEvalFlash] = useState({})        // { physical: true, mental: true, spiritual: true } after eval

  // Archive state
  const [archiveDays, setArchiveDays] = useState([])   // array of day docs
  const [archiveWeeks, setArchiveWeeks] = useState([])  // array of week docs
  const [winsCache, setWinsCache] = useState({})        // { [date]: winsDoc, ['week-' + weekKey]: winsDoc }
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [expandedDays, setExpandedDays] = useState({})
  const [expandedWeeks, setExpandedWeeks] = useState({})

  // Future tasks state (calendar)
  const [futureTasks, setFutureTasks] = useState({})   // { [date]: [tasks] }

  // User profile (for win definitions)
  const [userProfile, setUserProfile] = useState(null)

  // Streak state
  const [streak, setStreak] = useState({ current: 0, total: 0, best: 0 })
  const [streakPopupOpen, setStreakPopupOpen] = useState(false)
  const [accomplishments, setAccomplishments] = useState([])

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
  const [evalMode, setEvalMode] = useState('broad') // 'broad' | 'narrow'
  const [defsSaved, setDefsSaved] = useState(false)
  const [defsLoading, setDefsLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Clear archive / reset state
  const [clearArchiveConfirm, setClearArchiveConfirm] = useState(false)
  const [clearArchiveLoading, setClearArchiveLoading] = useState(false)
  const [resetConfirm, setResetConfirm] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [dataActionError, setDataActionError] = useState('')
  const [dataActionSuccess, setDataActionSuccess] = useState('')

  // Inline task editing state
  const [editingTaskId, setEditingTaskId] = useState(null)
  const [editingTaskText, setEditingTaskText] = useState('')

  // Bio state
  const [editBio, setEditBio] = useState('')
  const [bioSaved, setBioSaved] = useState(false)

  // Archive editing state
  const [editingArchiveDay, setEditingArchiveDay] = useState(null)
  const [archiveAddInput, setArchiveAddInput] = useState('')
  const [archiveEvalLoading, setArchiveEvalLoading] = useState(null)  // date string of day being evaluated

  // Override comment state — keyed by win type
  const [overrideComments, setOverrideComments] = useState({ physical: '', mental: '', spiritual: '' })
  const [overrideOpen, setOverrideOpen] = useState({ physical: false, mental: false, spiritual: false })

  // Visibility settings state
  const [visTodo, setVisTodo] = useState('friends')
  const [visStats, setVisStats] = useState('public')
  const [visArchive, setVisArchive] = useState('friends')
  const [visSaved, setVisSaved] = useState(false)

  // Customization state
  const [autoSortCompleted, setAutoSortCompleted] = useState(false)
  const [emailNotifications, setEmailNotifications] = useState(true)

  // Theme state
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')

  // Notification centre state
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifUnread, setNotifUnread] = useState(false)
  const [announcements, setAnnouncements] = useState([])  // stored in localStorage
  const [showPwaNotif, setShowPwaNotif] = useState(false)
  const [socialNotifs, setSocialNotifs] = useState([])
  const [challengeError, setChallengeError] = useState('')
  const [proLoading, setProLoading] = useState(false)


  // ── FIREBASE REFS ─────────────────────────────────────
  const todayRef = doc(db, 'tasks', uid, 'today', 'data')
  const tmrwRef = doc(db, 'tasks', uid, 'tomorrow', tomorrowStr())
  const weekRef = doc(db, 'tasks', uid, 'weekly', weekKey())
  const dailyRef = doc(db, 'tasks', uid, 'dailyRepeat', weekKey())
  const rolloverRef = doc(db, 'meta', uid, 'rollover', 'data')
  const winsRef = doc(db, 'wins', uid, 'days', todayStr())
  const streakRef = doc(db, 'streak', uid, 'data', 'current')

  // ── THEME ────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  // ── LOAD USER PROFILE ─────────────────────────────────
  useEffect(() => {
    if (isGuest) {
      setRolloverDone(true)
      setTutorialStep(1)
      // Seed demo tasks so guest can see how the app works
      const id = () => Math.random().toString(36).slice(2)
      setTodayTasks([
        { id: id(), text: 'Run', done: false, carried: false, carryCount: 0, createdAt: Date.now() },
        { id: id(), text: 'Study', done: false, carried: false, carryCount: 0, createdAt: Date.now() },
        { id: id(), text: 'Journal', done: false, carried: false, carryCount: 0, createdAt: Date.now() },
        { id: id(), text: 'Laundry', done: false, carried: false, carryCount: 0, createdAt: Date.now() },
      ])
      setWeeklyTasks([
        { id: id(), text: 'Clean house', done: false, carried: false, carryCount: 0, createdAt: Date.now() },
      ])
      setDailyRepeats([
        { id: id(), text: 'Send emails', count: 0, createdAt: Date.now() },
      ])
      return
    }
    if (!uid) return
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        setUserProfile(data)
        setEditPhysical(data.winsDefinition?.physical || '')
        setEditMental(data.winsDefinition?.mental || '')
        setEditSpiritual(data.winsDefinition?.spiritual || '')
        setEvalMode(data.evalMode || 'broad')
        setVisTodo(data.visibility?.todo || 'friends')
        setVisStats(data.visibility?.stats || 'public')
        setVisArchive(data.visibility?.archive || 'friends')
        setAutoSortCompleted(data.autoSortCompleted || false)
        // Default-on: treat missing field as true
        setEmailNotifications(data.emailNotifications !== false)
        setEditBio(data.bio || '')
        if (!data.hasSeenTutorial) setTutorialStep(1)
      }
    })
  }, [uid])

  // ── NOTIFICATIONS ────────────────────────────────────
  useEffect(() => {
    // Load stored announcement history from localStorage
    const stored = JSON.parse(localStorage.getItem('notif_announcements') || '[]')
    setAnnouncements(stored)

    // Check Firestore for current announcement
    getDoc(doc(db, 'announcements', 'current')).then(snap => {
      if (!snap.exists()) return
      const data = snap.data()
      if (!data.message || !data.id) return
      // Add to history if not already there
      setAnnouncements(prev => {
        const exists = prev.some(a => a.id === data.id)
        if (exists) return prev
        const updated = [{ id: data.id, message: data.message, time: Date.now(), read: false }, ...prev]
        localStorage.setItem('notif_announcements', JSON.stringify(updated))
        return updated
      })
    }).catch(() => {})

    // PWA prompt — show if not already installed as standalone, and not dismissed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true
    const pwaDismissed = localStorage.getItem('pwa_notif_dismissed')
    if (!isStandalone && !pwaDismissed) {
      setShowPwaNotif(true)
    }
  }, [])

  // Update unread dot whenever notif sources change
  useEffect(() => {
    const hasUnreadAnnouncement = announcements.some(a => !a.read)
    const hasUnreadRequest = incomingRequests.length > 0
    const hasUnreadPwa = showPwaNotif
    const hasUnreadSocial = socialNotifs.some(n => !n.read)
    setNotifUnread(hasUnreadAnnouncement || hasUnreadRequest || hasUnreadPwa || hasUnreadSocial)
  }, [announcements, incomingRequests, showPwaNotif, socialNotifs])

  // ── ROLLOVER ──────────────────────────────────────────
  useEffect(() => {
    if (!uid || isGuest) return
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

    // ── AUTO WEEKLY WIN CALCULATION ───────────────────────
    // Build the 7 dates of the previous week (Mon–Sun)
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(prevMon)
      d.setDate(prevMon.getDate() + i)
      return d.toLocaleDateString('en-CA')
    })
    // Fetch each day's wins doc in parallel
    const dayWinsSnaps = await Promise.all(
      weekDates.map(date => getDoc(doc(db, 'wins', uid, 'days', date)))
    )
    // Count days that had all 3 wins (respecting overrides)
    const threeWinDayCount = dayWinsSnaps.filter(snap => {
      if (!snap.exists()) return false
      const w = snap.data()
      const p = w.overridePhysical  != null ? w.overridePhysical  : w.physical
      const m = w.overrideMental    != null ? w.overrideMental    : w.mental
      const s = w.overrideSpiritual != null ? w.overrideSpiritual : w.spiritual
      return p && m && s
    }).length
    const weekIsWin = threeWinDayCount >= 5
    await setDoc(doc(db, 'wins', uid, 'weeks', prevKey), {
      weekKey: prevKey,
      physical:     weekIsWin,
      mental:       weekIsWin,
      spiritual:    weekIsWin,
      threeWinDays: threeWinDayCount,
      calculatedAt: Date.now()
    })

    await setDoc(rolloverRef, { ...meta, lastWeekRollover: weekKey() })
  }

  // ── LISTENERS ─────────────────────────────────────────
  useEffect(() => {
    if (!uid || !rolloverDone || isGuest) return
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
    if (!uid || isGuest) return
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

  // ── EVAL COUNT LISTENER ───────────────────────────────
  useEffect(() => {
    if (!uid || isGuest) return
    const evalCountRef = doc(db, 'meta', uid, 'evalCount', todayStr())
    const unsub = onSnapshot(evalCountRef, snap => {
      setEvalsToday(snap.exists() ? (snap.data().count || 0) : 0)
    })
    return () => unsub()
  }, [uid])

  // ── ACCOMPLISHMENTS LISTENER ──────────────────────────
  useEffect(() => {
    if (!uid || isGuest) return
    const accRef = collection(db, 'accomplishments', uid, 'items')
    const unsub = onSnapshot(accRef, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setAccomplishments(items)
    })
    return () => unsub()
  }, [uid])

  // ── SOCIAL NOTIFICATIONS LISTENER ────────────────────
  useEffect(() => {
    if (!uid || isGuest) return
    const notifRef = collection(db, 'notifications', uid, 'items')
    const unsub = onSnapshot(notifRef, snap => {
      const items = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      setSocialNotifs(items)
    })
    return () => unsub()
  }, [uid])

  // ── LOAD ARCHIVE + FUTURE TASKS (when calendar tab opens) ──
  useEffect(() => {
    if (activeNav === 'calendar' && uid) {
      loadArchive()
      loadFutureTasks()
    }
  }, [activeNav, uid])

  // ── MIGRATE TODAY/TOMORROW FUTURE TASKS ON STARTUP ───
  // Runs once when uid is available — doesn't require calendar tab to be open
  useEffect(() => {
    if (!uid || isGuest) return
    async function runStartupMigration() {
      const today = todayStr()
      const tomorrow = tomorrowStr()
      const map = {}
      for (const date of [today, tomorrow]) {
        try {
          const snap = await getDoc(doc(db, 'futureTasks', uid, 'days', date))
          if (snap.exists()) map[date] = snap.data().tasks || []
        } catch (e) { /* ignore */ }
      }
      if (Object.keys(map).length > 0) migrateFutureTasks(map)
    }
    runStartupMigration()
  }, [uid])

  // ── LOAD LEADERBOARD (on mount + when tab switches) ──
  useEffect(() => {
    loadLeaderboard()
  }, [])

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

  // ── FUTURE TASKS (calendar) ───────────────────────────
  async function loadFutureTasks() {
    if (!uid) return
    try {
      const snap = await getDocs(collection(db, 'futureTasks', uid, 'days'))
      const today = todayStr()
      const tomorrow = tomorrowStr()
      const map = {}
      // today/tomorrow are owned by their respective task queues — exclude them here
      snap.docs.forEach(d => {
        if (d.id !== today && d.id !== tomorrow) map[d.id] = d.data().tasks || []
      })
      setFutureTasks(map)
    } catch (e) {
      console.error('loadFutureTasks error:', e)
    }
  }

  async function migrateFutureTasks(map) {
    const today = todayStr()
    const tomorrow = tomorrowStr()
    for (const date of [today, tomorrow]) {
      const tasks = map[date]
      if (!tasks?.length) continue
      const targetCol = date === today ? 'today' : 'tomorrow'
      try {
        const snap = await getDoc(doc(db, 'tasks', uid, targetCol, 'data'))
        const current = snap.exists() ? (snap.data().tasks || []) : []
        const existingTexts = new Set(current.map(t => t.text))
        const toAdd = tasks
          .filter(t => !existingTexts.has(t.text))
          .map((t, i) => ({ ...t, fromFuture: true, order: current.length + i }))
        if (toAdd.length > 0) {
          const merged = [...current, ...toAdd]
          await setDoc(doc(db, 'tasks', uid, targetCol, 'data'), { tasks: merged })
          if (date === today) setTodayTasks(merged)
          else setTomorrowTasks(merged)
        }
        // Clean up futureTasks doc — tomorrow queue is now the single source of truth for both dates
        await deleteDoc(doc(db, 'futureTasks', uid, 'days', date))
        setFutureTasks(prev => { const n = { ...prev }; delete n[date]; return n })
      } catch (e) {
        console.error('migrateFutureTasks error:', e)
      }
    }
  }

  async function addFutureTask(date, text) {
    if (!uid || !text.trim()) return
    // Tomorrow is owned by the tomorrow queue — route there directly
    if (date === tomorrowStr()) {
      const task = { id: uuidv4(), text: text.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      const updated = [...tomorrowTasks, task]
      setTomorrowTasks(updated)
      await setDoc(tmrwRef, { tasks: updated, date: tomorrowStr() })
      return
    }
    const existing = futureTasks[date] || []
    const newTask = { id: uuidv4(), text: text.trim(), done: false, order: existing.length }
    const updated = [...existing, newTask]
    setFutureTasks(prev => ({ ...prev, [date]: updated }))
    await setDoc(doc(db, 'futureTasks', uid, 'days', date), { date, tasks: updated })
  }

  async function deleteFutureTask(date, taskId) {
    if (!uid) return
    // Tomorrow is owned by the tomorrow queue — route there directly
    if (date === tomorrowStr()) {
      const updated = tomorrowTasks.filter(t => t.id !== taskId)
      setTomorrowTasks(updated)
      await setDoc(tmrwRef, { tasks: updated, date: tomorrowStr() })
      return
    }
    const existing = futureTasks[date] || []
    const updated = existing.filter(t => t.id !== taskId)
    setFutureTasks(prev => ({ ...prev, [date]: updated }))
    if (updated.length === 0) {
      await deleteDoc(doc(db, 'futureTasks', uid, 'days', date))
    } else {
      await setDoc(doc(db, 'futureTasks', uid, 'days', date), { date, tasks: updated })
    }
  }

  // ── TASK OPERATIONS ───────────────────────────────────
  async function addTask() {
    if (activeTab === 'today') {
      if (!todayInput.trim()) return
      const task = { id: uuidv4(), text: todayInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      setTodayInput('')
      if (isGuest) { setTodayTasks(prev => [...prev, task]) }
      else await setDoc(todayRef, { tasks: [...todayTasks, task], date: todayStr() })
    } else if (activeTab === 'tomorrow') {
      if (!tomorrowInput.trim()) return
      const task = { id: uuidv4(), text: tomorrowInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      setTomorrowInput('')
      if (isGuest) { setTomorrowTasks(prev => [...prev, task]) }
      else await setDoc(tmrwRef, { tasks: [...tomorrowTasks, task], date: tomorrowStr() })
    } else if (activeTab === 'weekly') {
      if (!weeklyInput.trim()) return
      const task = { id: uuidv4(), text: weeklyInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
      setWeeklyInput('')
      if (isGuest) { setWeeklyTasks(prev => [...prev, task]) }
      else await setDoc(weekRef, { tasks: [...weeklyTasks, task], weekKey: weekKey() })
    }
    setAddFlash(true)
    setTimeout(() => setAddFlash(false), 400)
  }

  async function reorderTask(type, reorderedTasks) {
    if (type === 'today') {
      if (isGuest) { setTodayTasks(reorderedTasks); return }
      await setDoc(todayRef, { tasks: reorderedTasks, date: todayStr() })
    } else if (type === 'weekly') {
      if (isGuest) { setWeeklyTasks(reorderedTasks); return }
      await setDoc(weekRef, { tasks: reorderedTasks, weekKey: weekKey() })
    }
  }

  async function addDailyRepeat() {
    if (!dailyInput.trim()) return
    const task = { id: uuidv4(), text: dailyInput.trim(), count: 0, createdAt: Date.now() }
    setDailyInput('')
    if (isGuest) { setDailyRepeats(prev => [...prev, task]); return }
    await setDoc(dailyRef, { tasks: [...dailyRepeats, task], weekKey: weekKey() })
  }

  async function toggleTask(type, id) {
    if (type === 'today') {
      const updated = todayTasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
      if (isGuest) { setTodayTasks(updated); return }
      await setDoc(todayRef, { tasks: updated, date: todayStr() })
    } else if (type === 'tomorrow') {
      const updated = tomorrowTasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
      if (isGuest) { setTomorrowTasks(updated); return }
      await setDoc(tmrwRef, { tasks: updated, date: tomorrowStr() })
    } else if (type === 'weekly') {
      const updated = weeklyTasks.map(t => t.id === id ? { ...t, done: !t.done } : t)
      if (isGuest) { setWeeklyTasks(updated); return }
      await setDoc(weekRef, { tasks: updated, weekKey: weekKey() })
    }
  }

  async function deleteTask(type, id) {
    if (type === 'today') {
      const updated = todayTasks.filter(t => t.id !== id)
      if (isGuest) { setTodayTasks(updated); return }
      await setDoc(todayRef, { tasks: updated, date: todayStr() })
    } else if (type === 'tomorrow') {
      const updated = tomorrowTasks.filter(t => t.id !== id)
      if (isGuest) { setTomorrowTasks(updated); return }
      setTomorrowTasks(updated)
      await setDoc(tmrwRef, { tasks: updated, date: tomorrowStr() })
    } else if (type === 'weekly') {
      const updated = weeklyTasks.filter(t => t.id !== id)
      if (isGuest) { setWeeklyTasks(updated); return }
      await setDoc(weekRef, { tasks: updated, weekKey: weekKey() })
    }
  }

  async function deleteDailyRepeat(id) {
    const updated = dailyRepeats.filter(t => t.id !== id)
    if (isGuest) { setDailyRepeats(updated); return }
    await setDoc(dailyRef, { tasks: updated, weekKey: weekKey() })
  }

  async function tapDailyRepeat(id) {
    const task = dailyRepeats.find(t => t.id === id)
    if (!task) return
    const updated = dailyRepeats.map(t => t.id === id ? { ...t, count: Math.min((t.count || 0) + 1, 7) } : t)
    const entry = { id: uuidv4(), text: task.text, done: true, carried: false, carryCount: 0, fromDTask: true, createdAt: Date.now() }
    const alreadyIn = todayTasks.some(t => t.fromDTask && t.text === task.text)
    if (isGuest) {
      setDailyRepeats(updated)
      if (!alreadyIn) setTodayTasks(prev => [...prev, entry])
      return
    }
    await setDoc(dailyRef, { tasks: updated, weekKey: weekKey() })
    if (!alreadyIn) await setDoc(todayRef, { tasks: [...todayTasks, entry], date: todayStr() })
  }

  async function untapDailyRepeat(id) {
    const task = dailyRepeats.find(t => t.id === id)
    if (!task || (task.count || 0) === 0) return
    const updated = dailyRepeats.map(t => t.id === id ? { ...t, count: Math.max((t.count || 0) - 1, 0) } : t)
    if (isGuest) {
      setDailyRepeats(updated)
      if ((task.count || 0) - 1 === 0) setTodayTasks(prev => prev.filter(t => !(t.fromDTask && t.text === task.text)))
      return
    }
    await setDoc(dailyRef, { tasks: updated, weekKey: weekKey() })
    if ((task.count || 0) - 1 === 0) {
      await setDoc(todayRef, { tasks: todayTasks.filter(t => !(t.fromDTask && t.text === task.text)), date: todayStr() })
    }
  }

  // ── AI EVALUATION ─────────────────────────────────────
  async function evaluateWins() {
    setEvalError('')
    setEvalFlash({})
    const completed = todayTasks.filter(t => t.done).map(t => t.text)

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
    const mode = userProfile?.evalMode || evalMode || 'broad'
    const modeInstruction = mode === 'narrow'
      ? 'Be strict — only award a win if the completed tasks clearly and directly match the definition. When in doubt, do not award the win.'
      : 'Be reasonable — if the completed tasks plausibly reflect the spirit of the definition, award the win. Give benefit of the doubt for close calls.'

    const prompt = `You are evaluating whether someone achieved their Three Wins today based solely on their today to-do list. Do not infer or assume any activity not explicitly listed below.

Completed tasks from today's to-do list:
${completed.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Definitions (personal to the user):
- Physical win: ${physDef}
- Mental win: ${mentDef}
- Spiritual win: ${spirDef}

Evaluation mode: ${modeInstruction}

Note: routine hygiene tasks (shower, eat, etc.) should NOT count as wins and should map to null. Only evaluate based on the tasks listed above — nothing else.
For taskMap, assign each task to "physical", "mental", "spiritual", or null.

Respond ONLY with valid JSON, no other text:
{"physical": true or false, "mental": true or false, "spiritual": true or false, "reasoning": "one or two sentence explanation", "taskMap": {"task text": "physical"|"mental"|"spiritual"|null}}`

    try {
      const { data: result } = await evaluateWinFn({ prompt, type: 'today', date: todayStr() })

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

      if (isGuest) {
        setTodayWins(winsDoc)
      } else {
        await setDoc(winsRef, winsDoc)
        await updateStreak(winsDoc)
      }
      // Flash achieved win rows — persists until next eval
      const flash = {
        physical:  result.physical  === true,
        mental:    result.mental    === true,
        spiritual: result.spiritual === true,
      }
      setEvalFlash(flash)
      // onSnapshot will update todayWins state automatically
    } catch (e) {
      console.error('evaluateWins error:', e)
      if (e?.code === 'functions/resource-exhausted') {
        setEvalError('Daily limit reached — 3 evals per day on free tier.')
      } else {
        setEvalError('Evaluation failed — check connection and try again.')
      }
    }
    setEvalLoading(false)
  }

  function openOverride(win) {
    // Toggle comment box open — don't apply override yet
    setOverrideOpen(prev => ({ ...prev, [win]: !prev[win] }))
  }

  async function applyOverride(win) {
    if (!todayWins) return
    const key = `override${win.charAt(0).toUpperCase() + win.slice(1)}`
    const noteKey = `note${win.charAt(0).toUpperCase() + win.slice(1)}`
    const currentAI = todayWins[win]
    const updated = {
      ...todayWins,
      [key]: !currentAI,
      [noteKey]: overrideComments[win].trim()
    }
    await setDoc(winsRef, updated, { merge: true })
    await updateStreak(updated)
    setOverrideOpen(prev => ({ ...prev, [win]: false }))
  }

  async function revertOverride(win) {
    if (!todayWins) return
    const key = `override${win.charAt(0).toUpperCase() + win.slice(1)}`
    const noteKey = `note${win.charAt(0).toUpperCase() + win.slice(1)}`
    const updated = { ...todayWins, [key]: null, [noteKey]: '' }
    await setDoc(winsRef, updated, { merge: true })
    await updateStreak(updated)
    setOverrideComments(prev => ({ ...prev, [win]: '' }))
    setOverrideOpen(prev => ({ ...prev, [win]: false }))
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
    const yStr = yesterday.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const today = todayStr()

    if (todayIsWin) {
      if (lastWinDate === today) {
        // Already counted today — no change needed
      } else if (lastWinDate === yStr) {
        // Extending streak from yesterday
        current = current + 1
        total = (total || 0) + 1
        best = Math.max(best || 0, current)
        lastWinDate = today
      } else {
        // Gap in streak — start fresh
        current = 1
        total = (total || 0) + 1
        best = Math.max(best || 0, 1)
        lastWinDate = today
      }
    } else {
      // Not a three-win day after re-eval
      if (lastWinDate === today) {
        // Today was previously a win, roll it back
        current = Math.max(0, current - 1)
        total = Math.max(0, total - 1)
        lastWinDate = yStr
      }
      // else: today was never counted, nothing to change
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

    // ── AUTO MILESTONES ──────────────────────────────────
    const milestones = [5, 10, 25, 50, 100]
    const writes = []

    // Total wins milestones — only fire when we just crossed the threshold
    const prevTotal = existing.total || 0
    for (const m of milestones) {
      if (prevTotal < m && total >= m) {
        writes.push(setDoc(doc(db, 'accomplishments', uid, 'items', `total_${m}`), {
          type: 'streak_milestone',
          streakCount: m,
          label: `${m} total wins`,
          createdAt: Date.now(),
          kudosCount: 0,
        }))
      }
    }

    // Current streak milestones — only fire when we just crossed the threshold
    const prevCurrent = existing.current || 0
    for (const m of milestones) {
      if (prevCurrent < m && current >= m) {
        writes.push(setDoc(doc(db, 'accomplishments', uid, 'items', `streak_${m}`), {
          type: 'streak_milestone',
          streakCount: m,
          label: `${m}-day streak`,
          createdAt: Date.now(),
          kudosCount: 0,
        }))
      }
    }

    // First three-win day
    if (todayIsWin && (existing.total || 0) === 0) {
      writes.push(setDoc(doc(db, 'accomplishments', uid, 'items', 'first_three_win_day'), {
        type: 'three_win_day',
        label: 'First three-win day',
        date: todayStr(),
        createdAt: Date.now(),
        kudosCount: 0,
      }))
    }

    if (writes.length > 0) await Promise.all(writes)
    // onSnapshot will update streak state automatically
  }

  // ── PROFILE ACTIONS ──────────────────────────────────
  async function saveWinDefinitions() {
    if (!uid) return
    setDefsLoading(true)
    setDefsSaved(false)
    const updated = {
      ...userProfile,
      evalMode,
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

  async function saveVisibility(todoVal, statsVal, archiveVal) {
    if (!uid) return
    const updated = {
      ...userProfile,
      visibility: {
        todo: todoVal,
        stats: statsVal,
        archive: archiveVal ?? visArchive,
      }
    }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
    setVisSaved(true)
    setTimeout(() => setVisSaved(false), 2500)
  }

  async function saveAutoSort(val) {
    if (!uid) return
    const updated = { ...userProfile, autoSortCompleted: val }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
  }

  async function saveEmailNotifications(val) {
    if (!uid) return
    const updated = { ...userProfile, emailNotifications: val }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
  }

  async function saveBio() {
    if (!uid) return
    const updated = { ...userProfile, bio: editBio.trim().slice(0, 1000) }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
    setBioSaved(true)
    setTimeout(() => setBioSaved(false), 2500)
  }

  function nextTutorialStep() {
    if (tutorialStep < 4) {
      setTutorialStep(s => s + 1)
    } else {
      dismissTutorial()
    }
  }

  async function dismissTutorial() {
    setTutorialStep(0)
    if (!isGuest && uid && userProfile) {
      const updated = { ...userProfile, hasSeenTutorial: true }
      await setDoc(doc(db, 'users', uid), updated)
      setUserProfile(updated)
    }
  }

  async function saveTaskEdit(type, id) {
    if (!editingTaskText.trim()) return
    if (type === 'today') {
      const updated = todayTasks.map(t => t.id === id ? { ...t, text: editingTaskText.trim() } : t)
      await setDoc(todayRef, { tasks: updated, date: todayStr() })
    } else if (type === 'tomorrow') {
      const updated = tomorrowTasks.map(t => t.id === id ? { ...t, text: editingTaskText.trim() } : t)
      await setDoc(tmrwRef, { tasks: updated, date: tomorrowStr() })
    } else if (type === 'weekly') {
      const updated = weeklyTasks.map(t => t.id === id ? { ...t, text: editingTaskText.trim() } : t)
      await setDoc(weekRef, { tasks: updated, weekKey: weekKey() })
    }
    setEditingTaskId(null)
    setEditingTaskText('')
  }

  async function updateArchiveTask(date, taskId, changes) {
    const day = archiveDays.find(d => d.date === date)
    if (!day) return
    const updated = day.tasks.map(t => t.id === taskId ? { ...t, ...changes } : t)
    const done = updated.filter(t => t.done).length
    const newDay = { ...day, tasks: updated, summary: `${done}/${updated.length} completed` }
    await setDoc(doc(db, 'archive', uid, 'days', date), newDay)
    setArchiveDays(prev => prev.map(d => d.date === date ? newDay : d))
  }

  async function deleteArchiveTask(date, taskId) {
    const day = archiveDays.find(d => d.date === date)
    if (!day) return
    const updated = day.tasks.filter(t => t.id !== taskId)
    const done = updated.filter(t => t.done).length
    const newDay = { ...day, tasks: updated, summary: `${done}/${updated.length} completed` }
    await setDoc(doc(db, 'archive', uid, 'days', date), newDay)
    setArchiveDays(prev => prev.map(d => d.date === date ? newDay : d))
  }

  async function addArchiveTask(date) {
    if (!archiveAddInput.trim()) return
    const day = archiveDays.find(d => d.date === date)
    const existing = day?.tasks || []
    const newTask = { id: uuidv4(), text: archiveAddInput.trim(), done: false, carried: false, carryCount: 0, createdAt: Date.now() }
    const updated = [...existing, newTask]
    const done = updated.filter(t => t.done).length
    const newDay = { ...(day || { date, archivedAt: Date.now() }), tasks: updated, summary: `${done}/${updated.length} completed` }
    await setDoc(doc(db, 'archive', uid, 'days', date), newDay)
    setArchiveDays(prev => {
      const exists = prev.some(d => d.date === date)
      return exists ? prev.map(d => d.date === date ? newDay : d) : [...prev, newDay].sort((a,b) => b.date.localeCompare(a.date))
    })
    setArchiveAddInput('')
  }

  async function evaluateArchiveDay(date, tasks) {
    const completed = tasks.filter(t => t.done).map(t => t.text)
    if (completed.length === 0) return

    setArchiveEvalLoading(date)
    const defs = userProfile?.winsDefinition || {}
    const physDef = defs.physical || 'any meaningful movement — climbing, gym, run, MMA, workout, sports'
    const mentDef = defs.mental || 'academic, professional, or goal-directed work — studying, researching, building, solving'
    const spirDef = defs.spiritual || 'broad and personal — journaling, meditation, prayer, sleeping 9+ hours, meaningful conversation, reflection'

    const prompt = `You are evaluating whether someone achieved their Three Wins on ${date} based on their completed tasks.

Completed tasks:
${completed.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Definitions (personal to the user):
- Physical win: ${physDef}
- Mental win: ${mentDef}
- Spiritual win: ${spirDef}

Note: routine hygiene tasks (shower, eat, etc.) should NOT count as wins and should map to null.
For taskMap, assign each task to "physical", "mental", "spiritual", or null.

Respond ONLY with valid JSON, no other text:
{"physical": true or false, "mental": true or false, "spiritual": true or false, "reasoning": "one or two sentence explanation", "taskMap": {"task text": "physical"|"mental"|"spiritual"|null}}`

    try {
      const { data: result } = await evaluateWinFn({ prompt, type: 'archive', date })

      const winsDoc = {
        date,
        physical: result.physical,
        mental: result.mental,
        spiritual: result.spiritual,
        reasoning: result.reasoning || '',
        taskMap: result.taskMap || {},
        evaluatedAt: Date.now(),
        overridePhysical: null,
        overrideMental: null,
        overrideSpiritual: null,
      }
      await setDoc(doc(db, 'wins', uid, 'days', date), winsDoc)
      // Update winsCache in place so badges refresh without reloading
      setWinsCache(prev => ({ ...prev, [date]: winsDoc }))
      await updateStreak(winsDoc)
    } catch (e) {
      console.error('evaluateArchiveDay error:', e)
    }
    setArchiveEvalLoading(null)
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
      batch.delete(doc(db, 'leaderboard', uid))
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

  // ── CLEAR ARCHIVE ─────────────────────────────────────
  async function clearArchive() {
    if (!uid) return
    setClearArchiveLoading(true)
    setDataActionError('')
    setDataActionSuccess('')
    try {
      const [daysSnap, weeksSnap, winDaysSnap, winWeeksSnap] = await Promise.all([
        getDocs(collection(db, 'archive', uid, 'days')),
        getDocs(collection(db, 'archive', uid, 'weeks')),
        getDocs(collection(db, 'wins', uid, 'days')),
        getDocs(collection(db, 'wins', uid, 'weeks')),
      ])
      const batch = writeBatch(db)
      daysSnap.docs.forEach(d => batch.delete(d.ref))
      weeksSnap.docs.forEach(d => batch.delete(d.ref))
      winDaysSnap.docs.forEach(d => batch.delete(d.ref))
      winWeeksSnap.docs.forEach(d => batch.delete(d.ref))
      await batch.commit()
      setArchiveDays([])
      setArchiveWeeks([])
      setWinsCache({})
      setDataActionSuccess('Archive cleared.')
      setClearArchiveConfirm(false)
    } catch (e) {
      console.error('clearArchive error:', e)
      setDataActionError('Something went wrong — please try again.')
    }
    setClearArchiveLoading(false)
  }

  // ── RESET ALL DATA ────────────────────────────────────
  async function resetAllData() {
    if (!uid) return
    setResetLoading(true)
    setDataActionError('')
    setDataActionSuccess('')
    try {
      const [daysSnap, weeksSnap, winDaysSnap, winWeeksSnap] = await Promise.all([
        getDocs(collection(db, 'archive', uid, 'days')),
        getDocs(collection(db, 'archive', uid, 'weeks')),
        getDocs(collection(db, 'wins', uid, 'days')),
        getDocs(collection(db, 'wins', uid, 'weeks')),
      ])
      const batch = writeBatch(db)
      // Archive + wins
      daysSnap.docs.forEach(d => batch.delete(d.ref))
      weeksSnap.docs.forEach(d => batch.delete(d.ref))
      winDaysSnap.docs.forEach(d => batch.delete(d.ref))
      winWeeksSnap.docs.forEach(d => batch.delete(d.ref))
      // Tasks
      batch.delete(doc(db, 'tasks', uid, 'today', 'data'))
      batch.delete(doc(db, 'tasks', uid, 'weekly', weekKey()))
      batch.delete(doc(db, 'tasks', uid, 'dailyRepeat', weekKey()))
      // Streak + leaderboard
      batch.delete(doc(db, 'streak', uid, 'data', 'current'))
      batch.delete(doc(db, 'leaderboard', uid))
      await batch.commit()
      // Reset local state
      setArchiveDays([])
      setArchiveWeeks([])
      setWinsCache({})
      setStreak({ current: 0, total: 0, best: 0 })
      setTodayTasks([])
      setWeeklyTasks([])
      setDailyRepeats([])
      setDataActionSuccess('All data reset.')
      setResetConfirm(false)
    } catch (e) {
      console.error('resetAllData error:', e)
      setDataActionError('Something went wrong — please try again.')
    }
    setResetLoading(false)
  }
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

  async function handleKudos(accomplishment) {
    if (!uid || !accomplishment) return
    try {
      await sendKudosFn({
        recipientUid: uid,
        accomplishmentId: accomplishment.id,
        accomplishmentLabel: accomplishment.taskText || accomplishment.label || 'an achievement',
        senderDisplayName: userProfile?.username || user?.displayName || 'Someone',
      })
    } catch (e) {
      console.error('kudos error:', e)
    }
  }

  async function handleCompleteChallenge(challengeId, taskText) {
    if (!uid || !challengeId) return
    try {
      await completeChallengeFn({ challengeId, taskText })
    } catch (e) {
      console.error('completeChallenge error:', e)
    }
  }

  async function grantPro() {
    if (!uid) return
    setProLoading(true)
    const updated = { ...userProfile, isPro: !userProfile?.isPro }
    await setDoc(doc(db, 'users', uid), updated)
    setUserProfile(updated)
    setProLoading(false)
  }

  async function handleSendNudge(recipientUid, taskText) {
    if (!uid) return
    await sendNudgeFn({
      recipientUid,
      taskText,
      senderDisplayName: userProfile?.username || user?.displayName || 'Someone',
    })
  }

  async function handleSendChallenge(recipientUid, taskText, destination) {
    if (!uid) return
    await sendChallengeFn({
      recipientUid,
      taskText,
      destination,
      senderDisplayName: userProfile?.username || user?.displayName || 'Someone',
    })
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

  // ── NOTIFICATION HELPERS ─────────────────────────────
  function openNotifPanel() {
    setNotifOpen(o => !o)
    // Mark all announcements as read
    setAnnouncements(prev => {
      const updated = prev.map(a => ({ ...a, read: true }))
      localStorage.setItem('notif_announcements', JSON.stringify(updated))
      return updated
    })
    // Mark all social notifs as read in Firestore
    if (uid) {
      socialNotifs.filter(n => !n.read).forEach(n => {
        setDoc(doc(db, 'notifications', uid, 'items', n.id), { ...n, read: true })
      })
      setSocialNotifs(prev => prev.map(n => ({ ...n, read: true })))
    }
  }

  function dismissAnnouncement(id) {
    setAnnouncements(prev => {
      const updated = prev.filter(a => a.id !== id)
      localStorage.setItem('notif_announcements', JSON.stringify(updated))
      return updated
    })
  }

  function dismissPwaNotif() {
    localStorage.setItem('pwa_notif_dismissed', '1')
    setShowPwaNotif(false)
  }

  async function dismissSocialNotif(notifId) {
    if (!uid) return
    await deleteDoc(doc(db, 'notifications', uid, 'items', notifId))
    setSocialNotifs(prev => prev.filter(n => n.id !== notifId))
  }

  async function handleRespondToChallenge(notif, response) {
    setChallengeError('')
    try {
      if (!notif.challengeId) {
        setChallengeError('Challenge ID missing — dismiss and ask your friend to resend.')
        return
      }
      await respondToChallengeFn({ challengeId: notif.challengeId, response, notifId: notif.id })
      // Remove from Firestore so it doesn't reappear on next snapshot
      await deleteDoc(doc(db, 'notifications', uid, 'items', notif.id))
      setSocialNotifs(prev => prev.filter(n => n.id !== notif.id))
    } catch (e) {
      console.error('respondToChallenge error:', e)
      if (e?.message?.includes('already responded')) {
        // Stale notif — just dismiss it
        await deleteDoc(doc(db, 'notifications', uid, 'items', notif.id))
        setSocialNotifs(prev => prev.filter(n => n.id !== notif.id))
      } else {
        setChallengeError('Something went wrong — please try again.')
      }
    }
  }

  // ── ARCHIVE HELPERS ───────────────────────────────────
  function toggleDay(date) {
    setExpandedDays(prev => ({ ...prev, [date]: !prev[date] }))
  }

  function toggleWeek(wk) {
    setExpandedWeeks(prev => ({ ...prev, [wk]: !prev[wk] }))
  }

  // Group archive days by week
  // ── RENDER ────────────────────────────────────────────
  // ── RANK CALCULATIONS ────────────────────────────────
  const sortedByStreak = [...lbEntries].sort((a, b) =>
    (b.current ?? 0) - (a.current ?? 0) || (b.total ?? 0) - (a.total ?? 0)
  )
  const globalRank = sortedByStreak.findIndex(e => e.uid === uid) + 1 || null

  const friendUids = new Set([...friendsList.map(f => f.uid), uid])
  const sortedFriends = sortedByStreak.filter(e => friendUids.has(e.uid))
  const friendRank = sortedFriends.findIndex(e => e.uid === uid) + 1 || null

  return (
    <div className="home">

      {/* ── TUTORIAL OVERLAY ── */}
      {tutorialStep > 0 && (
        <div className="tutorial-backdrop">
          <div
            className={`tutorial-tooltip tutorial-step-${tutorialStep}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="tutorial-step-indicator">
              {[1,2,3,4].map(s => (
                <span key={s} className={`tutorial-dot ${s === tutorialStep ? 'active' : s < tutorialStep ? 'done' : ''}`} />
              ))}
            </div>

            {tutorialStep === 1 && (
              <>
                <p className="tutorial-title">🔔 Notifications</p>
                <p className="tutorial-body">Tap the bell for friend requests, announcements, and install prompts.</p>
              </>
            )}
            {tutorialStep === 2 && (
              <>
                <p className="tutorial-title">🧭 Navigate</p>
                <p className="tutorial-body">Use the bottom bar to switch between Home, Archive, Friends, Ranks, and Profile.</p>
              </>
            )}
            {tutorialStep === 3 && (
              <>
                <p className="tutorial-title">🔥 Your stats</p>
                <p className="tutorial-body">Track your current streak, global rank, and total three-win days at a glance. Tap either pill for more detail.</p>
              </>
            )}
            {tutorialStep === 4 && (
              <>
                <p className="tutorial-title">✨ Three Wins eval</p>
                <p className="tutorial-body">Complete tasks in your today list, then tap Evaluate. Claude scores your physical, mental, and spiritual wins based only on what you did today.</p>
              </>
            )}

            <div className="tutorial-actions">
              <button className="tutorial-skip" onClick={dismissTutorial}>Skip</button>
              <button className="tutorial-next" onClick={nextTutorialStep}>
                {tutorialStep === 4 ? 'Got it!' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="home-header">
        <div className="home-nav">
          <span className="home-logo">threedailywins</span>

          {/* Notification bell */}
          <div className={`notif-btn-wrap${tutorialStep === 1 ? ' tutorial-highlight' : ''}`}>
            <button className="notif-btn" onClick={openNotifPanel}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="notif-icon">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {notifUnread && <span className="notif-dot" />}
            </button>

            {/* Notification panel — rendered via portal to avoid layout bleed */}
            {notifOpen && createPortal(
              <>
                <div className="notif-overlay" onClick={() => setNotifOpen(false)} />
                <div className="notif-panel">
                  <div className="notif-panel-header">
                    <span className="notif-panel-title">Notifications</span>
                    <button className="notif-panel-close" onClick={() => setNotifOpen(false)}>✕</button>
                  </div>

                  {/* PWA prompt */}
                  {showPwaNotif && (
                    <div className="notif-item notif-item-pwa">
                      <div className="notif-item-body">
                        <p className="notif-item-title">Add to home screen</p>
                        <p className="notif-item-msg">
                          You can install threedailywins as an app for quick access.
                          {' '}
                          {/iPhone|iPad|iPod/i.test(navigator.userAgent)
                            ? 'On iPhone: tap the Share button, then "Add to Home Screen".'
                            : /Android/i.test(navigator.userAgent)
                              ? 'On Android: tap your browser menu, then "Add to Home Screen".'
                              : 'On desktop: click the install icon in your browser address bar, or use the browser menu.'}
                        </p>
                      </div>
                      <button className="notif-item-dismiss" onClick={dismissPwaNotif}>✕</button>
                    </div>
                  )}

                  {/* Friend requests */}
                  {incomingRequests.map(req => (
                    <div key={req.id} className="notif-item notif-item-friend">
                      <div className="notif-item-body">
                        <p className="notif-item-title">Friend request</p>
                        <p className="notif-item-msg">
                          <span className="notif-username" onClick={() => { setNotifOpen(false); navigate(`/u/${req.username}`) }}>
                            @{req.username}
                          </span> wants to be friends.
                        </p>
                        <div className="notif-item-actions">
                          <button className="friends-accept-btn" onClick={() => acceptRequest(req.uid, req.username, req.photoURL)}>Accept</button>
                          <button className="friends-decline-btn" onClick={() => declineRequest(req.uid)}>Decline</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Social notifications */}
                  {socialNotifs.map(n => (
                    <div key={n.id} className={`notif-item ${n.read ? '' : 'notif-item-unread'}`}>
                      <div className="notif-item-body">
                        <p className="notif-item-title">
                          {n.type === 'kudos'              && '👍 Kudos'}
                          {n.type === 'nudge'              && '👋 Nudge'}
                          {n.type === 'challenge'          && '⚡ Challenge'}
                          {n.type === 'challenge_accepted' && '✅ Challenge accepted'}
                          {n.type === 'challenge_declined' && '❌ Challenge declined'}
                          {n.type === 'challenge_completed'&& '🏆 Challenge completed'}
                        </p>
                        <p className="notif-item-msg">{n.message}</p>
                        {n.type === 'challenge' && (
                          <div className="notif-item-actions">
                            {challengeError && <p className="eval-error" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>{challengeError}</p>}
                            <button className="friends-accept-btn" onClick={() => handleRespondToChallenge(n, 'accepted')}>Accept</button>
                            <button className="friends-decline-btn" onClick={() => handleRespondToChallenge(n, 'declined')}>Decline</button>
                          </div>
                        )}
                      </div>
                      {n.type !== 'challenge' && (
                        <button className="notif-item-dismiss" onClick={() => dismissSocialNotif(n.id)}>✕</button>
                      )}
                    </div>
                  ))}

                  {/* Announcements */}
                  {announcements.map(a => (
                    <div key={a.id} className={`notif-item ${a.read ? '' : 'notif-item-unread'}`}>
                      <div className="notif-item-body">
                        <p className="notif-item-title">Announcement</p>
                        <p className="notif-item-msg">{a.message}</p>
                      </div>
                      <button className="notif-item-dismiss" onClick={() => dismissAnnouncement(a.id)}>✕</button>
                    </div>
                  ))}

                  {/* Empty state */}
                  {!showPwaNotif && incomingRequests.length === 0 && announcements.length === 0 && socialNotifs.length === 0 && (
                    <p className="notif-empty">No notifications</p>
                  )}
                </div>
              </>,
              document.body
            )}
          </div>
        </div>
        {activeNav !== 'profile' && <div className={`home-stats${tutorialStep === 3 ? ' tutorial-highlight' : ''}`}>
          <div className={`stat-pill stat-pill-clickable${streak.current > 0 ? ' stat-pill-win' : ''}`} onClick={() => setStreakPopupOpen(o => !o)} onMouseLeave={() => setStreakPopupOpen(false)} style={{ position: 'relative' }}>
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
          <div className="stat-pill">
            <span className={`stat-val${globalRank === 1 ? ' rank-gold' : globalRank === 2 ? ' rank-silver' : globalRank === 3 ? ' rank-bronze' : ''}`}>{globalRank ? `#${globalRank}` : '—'}</span>
            <span className="stat-label">rank</span>
          </div>
          <div className="stat-pill"><span className="stat-val">{streak.total}</span><span className="stat-label">total wins</span></div>
        </div>}
      </div>

      {/* Guest banner */}
      {isGuest && (
        <div className="guest-banner">
          <span className="guest-banner-text">You're in guest mode — data won't be saved.</span>
          <button className="guest-banner-btn" onClick={() => navigate('/login')}>Create account →</button>
        </div>
      )}


      {/* SUB-TABS — only shown on Home nav */}
      {activeNav === 'today' && (
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

        {/* ── HOME TABS ── */}
        {activeNav === 'today' && (
          <TodayTab
            activeTab={activeTab}
            todayTasks={todayTasks}
            todayInput={todayInput}
            setTodayInput={setTodayInput}
            addFlash={addFlash}
            addTask={addTask}
            toggleTask={toggleTask}
            deleteTask={deleteTask}
            editingTaskId={editingTaskId}
            setEditingTaskId={setEditingTaskId}
            editingTaskText={editingTaskText}
            setEditingTaskText={setEditingTaskText}
            saveTaskEdit={saveTaskEdit}
            tutorialStep={tutorialStep}
            todayWins={todayWins}
            evalLoading={evalLoading}
            evalError={evalError}
            evalsToday={evalsToday}
            evaluateWins={evaluateWins}
            evalFlash={evalFlash}
            getEffectiveWin={getEffectiveWin}
            overrideOpen={overrideOpen}
            overrideComments={overrideComments}
            setOverrideComments={setOverrideComments}
            openOverride={openOverride}
            applyOverride={applyOverride}
            revertOverride={revertOverride}
            userProfile={userProfile}
            tomorrowTasks={tomorrowTasks}
            tomorrowInput={tomorrowInput}
            setTomorrowInput={setTomorrowInput}
            weeklyTasks={weeklyTasks}
            weeklyInput={weeklyInput}
            setWeeklyInput={setWeeklyInput}
            dailyRepeats={dailyRepeats}
            dailyInput={dailyInput}
            setDailyInput={setDailyInput}
            addDailyRepeat={addDailyRepeat}
            tapDailyRepeat={tapDailyRepeat}
            untapDailyRepeat={untapDailyRepeat}
            deleteDailyRepeat={deleteDailyRepeat}
            completeChallenge={handleCompleteChallenge}
            reorderTask={reorderTask}
            autoSortCompleted={autoSortCompleted}
          />
        )}

        {/* ── FRIENDS ── */}
        {activeNav === 'friends' && (
          <FriendsTab
            isGuest={isGuest}
            navigate={navigate}
            uid={uid}
            friendSearch={friendSearch}
            setFriendSearch={setFriendSearch}
            friendSearchError={friendSearchError}
            setFriendSearchError={setFriendSearchError}
            searchedUser={searchedUser}
            setSearchedUser={setSearchedUser}
            sendRequestStatus={sendRequestStatus}
            setSendRequestStatus={setSendRequestStatus}
            friendsList={friendsList}
            incomingRequests={incomingRequests}
            searchUser={searchUser}
            sendFriendRequest={sendFriendRequest}
            acceptRequest={acceptRequest}
            declineRequest={declineRequest}
            removeFriend={removeFriend}
            sendNudge={handleSendNudge}
            sendChallenge={handleSendChallenge}
          />
        )}

        {/* ── LEADERBOARD ── */}
        {activeNav === 'leaderboard' && (
          <LeaderboardTab
            isGuest={isGuest}
            navigate={navigate}
            uid={uid}
            lbTab={lbTab}
            setLbTab={setLbTab}
            lbEntries={lbEntries}
            lbLoading={lbLoading}
            friendsList={friendsList}
          />
        )}

        {/* ── PROFILE / SETTINGS ── */}
        {activeNav === 'profile' && (
          <ProfileTab
            user={user}
            userProfile={userProfile}
            streak={streak}
            accomplishments={accomplishments}
            onKudos={handleKudos}
            editBio={editBio}
            setEditBio={setEditBio}
            bioSaved={bioSaved}
            saveBio={saveBio}
            editPhysical={editPhysical}
            setEditPhysical={setEditPhysical}
            editMental={editMental}
            setEditMental={setEditMental}
            editSpiritual={editSpiritual}
            setEditSpiritual={setEditSpiritual}
            evalMode={evalMode}
            setEvalMode={setEvalMode}
            defsLoading={defsLoading}
            defsSaved={defsSaved}
            saveWinDefinitions={saveWinDefinitions}
            visTodo={visTodo}
            setVisTodo={setVisTodo}
            visStats={visStats}
            setVisStats={setVisStats}
            visArchive={visArchive}
            setVisArchive={setVisArchive}
            visSaved={visSaved}
            setVisSaved={setVisSaved}
            saveVisibility={saveVisibility}
            autoSortCompleted={autoSortCompleted}
            setAutoSortCompleted={setAutoSortCompleted}
            saveAutoSort={saveAutoSort}
            emailNotifications={emailNotifications}
            setEmailNotifications={setEmailNotifications}
            saveEmailNotifications={saveEmailNotifications}
            theme={theme}
            setTheme={setTheme}
            dataActionSuccess={dataActionSuccess}
            dataActionError={dataActionError}
            setDataActionError={setDataActionError}
            setDataActionSuccess={setDataActionSuccess}
            clearArchiveConfirm={clearArchiveConfirm}
            setClearArchiveConfirm={setClearArchiveConfirm}
            clearArchiveLoading={clearArchiveLoading}
            clearArchive={clearArchive}
            resetConfirm={resetConfirm}
            setResetConfirm={setResetConfirm}
            resetLoading={resetLoading}
            resetAllData={resetAllData}
            deleteConfirm={deleteConfirm}
            setDeleteConfirm={setDeleteConfirm}
            deleteLoading={deleteLoading}
            deleteError={deleteError}
            setDeleteError={setDeleteError}
            deleteAccount={deleteAccount}
            isPro={userProfile?.isPro || false}
            grantPro={grantPro}
            proLoading={proLoading}
          />
        )}

        {/* ── CALENDAR ── */}
        {activeNav === 'calendar' && (
          <CalendarTab
            isGuest={isGuest}
            navigate={navigate}
            archiveLoading={archiveLoading}
            archiveDays={archiveDays}
            winsCache={winsCache}
            editingArchiveDay={editingArchiveDay}
            archiveAddInput={archiveAddInput}
            archiveEvalLoading={archiveEvalLoading}
            setArchiveAddInput={setArchiveAddInput}
            setEditingArchiveDay={setEditingArchiveDay}
            updateArchiveTask={updateArchiveTask}
            deleteArchiveTask={deleteArchiveTask}
            addArchiveTask={addArchiveTask}
            evaluateArchiveDay={evaluateArchiveDay}
            futureTasks={futureTasks}
            addFutureTask={addFutureTask}
            deleteFutureTask={deleteFutureTask}
            tomorrowTasks={tomorrowTasks}
          />
        )}

      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className={`bottom-nav${tutorialStep === 2 ? ' tutorial-highlight' : ''}`}>
        <button
          className={`bottom-nav-item ${activeNav === 'today' ? 'active' : ''}`}
          onClick={() => navigate('/home/today')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/>
            <path d="M9 21V12h6v9"/>
          </svg>
          <span className="bottom-nav-label">Home</span>
        </button>

        <button
          className={`bottom-nav-item ${activeNav === 'calendar' ? 'active' : ''}`}
          onClick={() => navigate('/home/calendar')}
        >
          <svg className="bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <span className="bottom-nav-label">Calendar</span>
        </button>

        <button
          className={`bottom-nav-item ${activeNav === 'friends' ? 'active' : ''}`}
          onClick={() => navigate('/home/friends')}
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
          onClick={() => navigate('/home/leaderboard')}
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
          onClick={() => navigate('/home/profile')}
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
