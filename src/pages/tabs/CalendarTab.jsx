// ── CALENDAR TAB ──────────────────────────────────────────
// Replaces ArchiveTab in the main nav. Past days show archive
// cards (same data). Future days allow task planning.
// Auto-arrive migration handled in Home.jsx on load.

import { useState } from 'react'
import { todayStr, isThreeWinDay } from './utils'

const MONTHS = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']
const DAYS_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa']

// ── MINI WIN BAR (inside calendar cell) ──────────────────
function MiniBar({ tasks, winsDoc }) {
  const total = tasks.length
  if (total === 0) return null
  const taskMap = winsDoc?.taskMap || {}
  const counts = { physical: 0, mental: 0, spiritual: 0, general: 0 }
  tasks.forEach(t => {
    if (!t.done) return
    const cat = taskMap[t.text]
    if (['physical','mental','spiritual'].includes(cat)) counts[cat]++
    else counts.general++
  })
  const toW = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
  return (
    <div className="cal-mini-bar">
      <div className="archive-win-bar-seg physical"  style={{ width: toW(counts.physical) }} />
      <div className="archive-win-bar-seg mental"    style={{ width: toW(counts.mental) }} />
      <div className="archive-win-bar-seg spiritual" style={{ width: toW(counts.spiritual) }} />
      <div className="archive-win-bar-seg general"   style={{ width: toW(counts.general) }} />
    </div>
  )
}

// ── ARCHIVE DAY CARD (past day detail panel) ─────────────
function ArchiveDayCard({
  day, winsDoc,
  editingArchiveDay, archiveAddInput, archiveEvalLoading,
  setArchiveAddInput, setEditingArchiveDay,
  updateArchiveTask, deleteArchiveTask, addArchiveTask, evaluateArchiveDay,
}) {
  const dayTasks = day.tasks || []
  const done = dayTasks.filter(t => t.done).length
  const total = dayTasks.length
  const pct = total > 0 ? Math.round(done / total * 100) : 0
  const threeWin = isThreeWinDay(winsDoc)
  const taskMap = winsDoc?.taskMap || {}
  const counts = { physical: 0, mental: 0, spiritual: 0, general: 0 }
  dayTasks.forEach(t => {
    if (!t.done) return
    const cat = taskMap[t.text]
    if (['physical','mental','spiritual'].includes(cat)) counts[cat]++
    else counts.general++
  })
  const toW = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'

  return (
    <div className="cal-panel-card">
      {/* Summary row */}
      <div className="cal-panel-summary">
        <span className="archive-day-meta">{done}/{total} · {pct}%</span>
        {threeWin && <span className="archive-3w-badge">3W</span>}
        <div className="archive-win-bar" style={{ flex: 1, maxWidth: 120, marginLeft: 'auto' }}>
          <div className="archive-win-bar-seg physical"  style={{ width: toW(counts.physical) }} />
          <div className="archive-win-bar-seg mental"    style={{ width: toW(counts.mental) }} />
          <div className="archive-win-bar-seg spiritual" style={{ width: toW(counts.spiritual) }} />
          <div className="archive-win-bar-seg general"   style={{ width: toW(counts.general) }} />
        </div>
      </div>

      {/* Task list */}
      <div className="cal-panel-tasks">
        {dayTasks.length === 0 && <p className="empty-msg">No tasks archived for this day.</p>}
        {dayTasks.map((t, i) => {
          const winCat = winsDoc?.taskMap?.[t.text]
          return (
            <div key={t.id || i} className={`archive-task ${t.done ? 'done' : ''}`}>
              <button
                className={`archive-check-btn ${t.done ? 'done' : ''}`}
                onClick={() => updateArchiveTask(day.date, t.id, { done: !t.done })}
              />
              {winCat && <span className={`archive-win-dot win-dot-${winCat}`} />}
              <span className="archive-task-text">{t.text}</span>
              <button className="delete-btn" onClick={() => deleteArchiveTask(day.date, t.id)}>×</button>
            </div>
          )
        })}

        {editingArchiveDay === day.date ? (
          <div className="archive-add-row">
            <input
              className="task-input"
              placeholder="Add task..."
              value={archiveAddInput}
              onChange={e => setArchiveAddInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addArchiveTask(day.date)
                if (e.key === 'Escape') setEditingArchiveDay(null)
              }}
              autoFocus
            />
            <button className="add-btn" onClick={() => addArchiveTask(day.date)}>+</button>
            <button className="archive-cancel-btn" onClick={() => setEditingArchiveDay(null)}>✕</button>
          </div>
        ) : (
          <button
            className="archive-add-task-btn"
            onClick={() => { setEditingArchiveDay(day.date); setArchiveAddInput('') }}
          >
            + Add task
          </button>
        )}
      </div>

      {/* AI reasoning */}
      {winsDoc?.reasoning && <p className="archive-reasoning">{winsDoc.reasoning}</p>}

      {/* Eval button */}
      <div className="archive-eval-row">
        <button
          className="archive-eval-btn"
          onClick={() => evaluateArchiveDay(day.date, dayTasks)}
          disabled={archiveEvalLoading === day.date || dayTasks.filter(t => t.done).length === 0}
        >
          {archiveEvalLoading === day.date
            ? 'Evaluating…'
            : winsDoc?.evaluatedAt ? 'Re-evaluate' : 'Evaluate'}
        </button>
        {!winsDoc && dayTasks.filter(t => t.done).length === 0 && (
          <p className="archive-not-evaluated">Complete tasks to evaluate.</p>
        )}
      </div>
    </div>
  )
}

// ── FUTURE DAY PANEL ─────────────────────────────────────
function FutureDayPanel({ date, tasks, addFutureTask, deleteFutureTask }) {
  const [input, setInput] = useState('')

  function handleAdd() {
    const text = input.trim()
    if (!text) return
    addFutureTask(date, text)
    setInput('')
  }

  return (
    <div className="cal-panel-card">
      <div className="cal-panel-tasks">
        {tasks.length === 0 && (
          <p className="empty-msg" style={{ marginBottom: '0.5rem' }}>No tasks planned for this day.</p>
        )}
        {tasks.map((t, i) => (
          <div key={t.id || i} className="task-item" style={{ padding: '0.4rem 0' }}>
            <span className="task-text" style={{ flex: 1, fontSize: '0.88rem' }}>{t.text}</span>
            <button className="delete-btn" onClick={() => deleteFutureTask(date, t.id)}>×</button>
          </div>
        ))}
        <div className="archive-add-row" style={{ marginTop: tasks.length > 0 ? '0.5rem' : 0 }}>
          <input
            className="task-input"
            placeholder="Plan a task..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button className="add-btn" onClick={handleAdd}>+</button>
        </div>
      </div>
      <p className="cal-future-hint">
        Tasks planned here will appear in your Today list on {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.
      </p>
    </div>
  )
}

// ── MAIN CALENDAR TAB ────────────────────────────────────
export default function CalendarTab({
  isGuest, navigate,
  archiveLoading, archiveDays, winsCache,
  editingArchiveDay, archiveAddInput, archiveEvalLoading,
  setArchiveAddInput, setEditingArchiveDay,
  updateArchiveTask, deleteArchiveTask, addArchiveTask, evaluateArchiveDay,
  futureTasks, addFutureTask, deleteFutureTask,
}) {
  const today = todayStr()
  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState(today)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
    setSelectedDate(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
    setSelectedDate(null)
  }

  // Build grid cells
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(viewMonth + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    cells.push(`${viewYear}-${mm}-${dd}`)
  }

  // Data lookups
  const archiveDayMap = {}
  archiveDays.forEach(d => { archiveDayMap[d.date] = d })

  if (isGuest) {
    return (
      <div className="guest-locked">
        <p className="guest-locked-title">Calendar unavailable in guest mode</p>
        <p className="guest-locked-body">Create an account to track history and plan future tasks.</p>
        <button className="guest-locked-btn" onClick={() => navigate('/login')}>Create account</button>
      </div>
    )
  }

  const selArchiveDay  = selectedDate ? archiveDayMap[selectedDate] : null
  const selWinsDoc     = selectedDate ? (winsCache[selectedDate] || null) : null
  const selFutureTasks = selectedDate ? (futureTasks[selectedDate] || []) : []
  const isPast    = selectedDate && selectedDate < today
  const isToday   = selectedDate === today
  const isFuture  = selectedDate && selectedDate > today

  return (
    <div className="cal-screen">

      {/* Month navigation */}
      <div className="cal-month-header">
        <button className="cal-month-nav" onClick={prevMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <span className="cal-month-title">{MONTHS[viewMonth]} {viewYear}</span>
        <button className="cal-month-nav" onClick={nextMonth}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
      </div>

      {/* Calendar grid */}
      <div className="cal-grid">

        {/* Day-of-week headers */}
        {DAYS_SHORT.map(d => (
          <div key={d} className="cal-dow">{d}</div>
        ))}

        {/* Day cells */}
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} className="cal-cell cal-cell-empty" />

          const dayNum = parseInt(date.split('-')[2], 10)
          const cellIsPast   = date < today
          const cellIsToday  = date === today
          const cellIsFuture = date > today
          const isSelected   = date === selectedDate
          const archiveDay   = archiveDayMap[date]
          const winsDoc      = winsCache[date] || null
          const threeWin     = cellIsPast && isThreeWinDay(winsDoc)
          const hasFuture    = cellIsFuture && (futureTasks[date]?.length > 0)
          const dayTasks     = archiveDay?.tasks || []

          return (
            <div
              key={date}
              className={[
                'cal-cell',
                cellIsPast   ? 'cal-past'   : '',
                cellIsToday  ? 'cal-today'  : '',
                cellIsFuture ? 'cal-future' : '',
                isSelected   ? 'cal-selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDate(isSelected ? null : date)}
            >
              <span className="cal-day-num">{dayNum}</span>
              {threeWin && <span className="cal-3w-badge">3W</span>}
              {cellIsPast && dayTasks.length > 0 && (
                <MiniBar tasks={dayTasks} winsDoc={winsDoc} />
              )}
              {hasFuture && <span className="cal-future-dot" />}
            </div>
          )
        })}
      </div>

      {archiveLoading && (
        <p className="empty-msg" style={{ textAlign: 'center', marginTop: '1rem' }}>Loading…</p>
      )}

      {/* Selected day panel */}
      {selectedDate && (
        <div className="cal-day-panel">
          <p className="cal-panel-date-label">
            {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
            })}
            {isToday && <span className="cal-today-tag"> — Today</span>}
          </p>

          {isPast && (
            selArchiveDay
              ? <ArchiveDayCard
                  day={selArchiveDay}
                  winsDoc={selWinsDoc}
                  editingArchiveDay={editingArchiveDay}
                  archiveAddInput={archiveAddInput}
                  archiveEvalLoading={archiveEvalLoading}
                  setArchiveAddInput={setArchiveAddInput}
                  setEditingArchiveDay={setEditingArchiveDay}
                  updateArchiveTask={updateArchiveTask}
                  deleteArchiveTask={deleteArchiveTask}
                  addArchiveTask={addArchiveTask}
                  evaluateArchiveDay={evaluateArchiveDay}
                />
              : <p className="empty-msg">No data for this day.</p>
          )}

          {isToday && (
            <div className="cal-panel-card">
              <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Manage today's tasks from the Home tab.
              </p>
              <button className="archive-eval-btn" onClick={() => navigate('/home/today')}>
                Go to Today
              </button>
            </div>
          )}

          {isFuture && (
            <FutureDayPanel
              date={selectedDate}
              tasks={selFutureTasks}
              addFutureTask={addFutureTask}
              deleteFutureTask={deleteFutureTask}
            />
          )}
        </div>
      )}

    </div>
  )
}
