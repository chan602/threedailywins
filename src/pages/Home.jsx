import { useState, useEffect } from 'react'
import { auth, db } from '../firebase'
import { signOut } from 'firebase/auth'
import {
  doc, onSnapshot,
  setDoc, getDoc,
} from 'firebase/firestore'
import { v4 as uuidv4 } from 'uuid'

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

  // ── SEPARATE INPUT STATE PER TAB ──────────────────────
  const [todayInput, setTodayInput] = useState('')
  const [tomorrowInput, setTomorrowInput] = useState('')
  const [weeklyInput, setWeeklyInput] = useState('')
  const [dailyInput, setDailyInput] = useState('')

  // ── FIREBASE REFS ─────────────────────────────────────
  const todayRef = doc(db, 'tasks', uid, 'today', 'data')
  const tmrwRef = doc(db, 'tasks', uid, 'tomorrow', tomorrowStr())
  const weekRef = doc(db, 'tasks', uid, 'weekly', weekKey())
  const dailyRef = doc(db, 'tasks', uid, 'dailyRepeat', weekKey())
  const rolloverRef = doc(db, 'meta', uid, 'rollover', 'data')

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

    // Pull tomorrow queue (stored under today's date — was tomorrow yesterday)
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
    return () => { unsub1(); unsub2(); unsub3(); unsub4() }
  }, [uid, rolloverDone])

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

  // ── RENDER ────────────────────────────────────────────
  const doneTasks = todayTasks.filter(t => t.done).length
  const totalTasks = todayTasks.length
  const pct = totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100)

  return (
    <div className="home">

      {/* HEADER */}
      <div className="home-header">
        <div className="home-nav">
          <span className="home-logo">threedailywins</span>
          <button className="signout-btn" onClick={() => signOut(auth)}>Sign out</button>
        </div>
        <div className="home-stats">
          <div className="stat-pill"><span className="stat-val">—</span><span className="stat-label">streak</span></div>
          <div className="stat-pill"><span className="stat-val">—</span><span className="stat-label">rank</span></div>
          <div className="stat-pill"><span className="stat-val">—</span><span className="stat-label">total</span></div>
        </div>
      </div>

      {/* TABS */}
      <div className="tab-bar">
        {['today', 'tomorrow', 'weekly'].map(tab => (
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
                  <span className="task-text">{t.text}</span>
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

      </div>
    </div>
  )
}

export default Home
