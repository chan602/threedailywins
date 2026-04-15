// ── ARCHIVE TAB ──────────────────────────────────────────
// Extracted from Home.jsx. All state and logic lives in Home;
// this component receives props and renders only.

// ── HELPERS (shared with UserProfile — consider moving to utils.js later) ──
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

function getWeekKeyForDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diffToMon = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diffToMon)
  const jan1 = new Date(mon.getFullYear(), 0, 1)
  const wk = Math.ceil(((mon - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${mon.getFullYear()}-W${String(wk).padStart(2, '0')}`
}

function WinBadge({ type, value, size = 'sm' }) {
  const achieved = value === true
  const iconSrc = `/icons/wins/${type}_${achieved ? 'achieved' : 'missed'}.png`
  const iconSize = size === 'xs' ? 28 : 32
  return (
    <img
      src={iconSrc}
      alt={type}
      className="win-badge-icon"
      style={{ width: iconSize, height: iconSize, borderRadius: 6, objectFit: 'cover' }}
      title={`${type}: ${achieved ? 'Achieved' : value === false ? 'Not detected' : 'Pending'}`}
    />
  )
}

// ── ARCHIVE TAB COMPONENT ────────────────────────────────
export default function ArchiveTab({
  isGuest,
  navigate,
  archiveLoading,
  archiveDays,
  archiveWeeks,
  winsCache,
  expandedDays,
  expandedWeeks,
  editingArchiveDay,
  archiveAddInput,
  archiveEvalLoading,
  setArchiveAddInput,
  setEditingArchiveDay,
  toggleDay,
  toggleWeek,
  updateArchiveTask,
  deleteArchiveTask,
  addArchiveTask,
  evaluateArchiveDay,
}) {
  // Group days by week key
  const daysByWeek = {}
  archiveDays.forEach(day => {
    const wk = getWeekKeyForDate(day.date)
    if (!daysByWeek[wk]) daysByWeek[wk] = []
    daysByWeek[wk].push(day)
  })
  Object.values(daysByWeek).forEach(arr => arr.sort((a, b) => b.date.localeCompare(a.date)))

  const allWeekKeys = new Set([
    ...archiveWeeks.map(w => w.weekKey),
    ...Object.keys(daysByWeek)
  ])
  const sortedWeekKeys = [...allWeekKeys].sort().reverse()

  if (isGuest) {
    return (
      <div className="guest-locked">
        <p className="guest-locked-icon">🗄️</p>
        <p className="guest-locked-title">Archive is unavailable in guest mode</p>
        <p className="guest-locked-body">Create an account to automatically archive your days and track your history.</p>
        <button className="guest-locked-btn" onClick={() => navigate('/login')}>Create account</button>
      </div>
    )
  }

  return (
    <div>
      {archiveLoading && <p className="empty-msg">Loading archive…</p>}

      {!archiveLoading && archiveDays.length === 0 && archiveWeeks.length === 0 && (
        <p className="empty-msg">No archive yet — days archive automatically at midnight.</p>
      )}

      {!archiveLoading && sortedWeekKeys.map(wk => {
        const weekData = archiveWeeks.find(w => w.weekKey === wk) || null
        const days = daysByWeek[wk] || []
        const weekWins = winsCache['week-' + wk] || null
        const weekOpen = expandedWeeks[wk] === true

        return (
          <div key={wk} className="archive-week-group">

            {/* Week header */}
            <div className="archive-week-header" onClick={() => toggleWeek(wk)}>
              <div className="archive-week-left">
                <span className="archive-week-title">{weekLabelFromKey(wk, weekData?.weekStart)}</span>
                {isThreeWinDay(weekWins) && <img src="/icons/wins/3w_logo.png" alt="Three Wins Week" className="three-wins-logo" />}
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

            {/* Weekly tasks summary */}
            {weekOpen && weekData && (weekData.wTasks?.length > 0 || weekData.dTasks?.length > 0) && (
              <div className="archive-week-body">
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
                      {threeWin && <img src="/icons/wins/3w_logo.png" alt="Three Wins" className="three-wins-logo" />}
                    </div>
                    <div className="archive-day-right">
                      {(() => {
                        const total = dayTasks.length
                        const taskMap = dayWins?.taskMap || {}
                        const counts = { physical: 0, mental: 0, spiritual: 0, other: 0 }
                        dayTasks.forEach(t => {
                          if (!t.done) return
                          const cat = taskMap[t.text]
                          if (cat === 'physical' || cat === 'mental' || cat === 'spiritual') counts[cat]++
                          else counts.other++
                        })
                        const toW = n => total > 0 ? `${Math.round((n / total) * 100)}%` : '0%'
                        return (
                          <div className="archive-win-bar" title={`${done2}/${total} tasks`}>
                            <div className="archive-win-bar-seg physical"  style={{ width: toW(counts.physical) }} />
                            <div className="archive-win-bar-seg mental"    style={{ width: toW(counts.mental) }} />
                            <div className="archive-win-bar-seg spiritual" style={{ width: toW(counts.spiritual) }} />
                            <div className="archive-win-bar-seg other"     style={{ width: toW(counts.other) }} />
                          </div>
                        )
                      })()}
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
                            <button
                              className={`archive-check-btn ${t.done ? 'done' : ''}`}
                              onClick={() => updateArchiveTask(day.date, t.id, { done: !t.done })}
                            />
                            {winCat && <span className={`archive-win-dot ${winDot}`} />}
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
                        <button className="archive-add-task-btn" onClick={() => { setEditingArchiveDay(day.date); setArchiveAddInput('') }}>
                          + Add task
                        </button>
                      )}

                      {dayWins?.reasoning && (
                        <p className="archive-reasoning">{dayWins.reasoning}</p>
                      )}

                      <div className="archive-eval-row">
                        <button
                          className="archive-eval-btn"
                          onClick={() => evaluateArchiveDay(day.date, dayTasks)}
                          disabled={archiveEvalLoading === day.date || dayTasks.filter(t => t.done).length === 0}
                        >
                          {archiveEvalLoading === day.date
                            ? 'Evaluating…'
                            : dayWins?.evaluatedAt ? 'Re-evaluate' : 'Evaluate'}
                        </button>
                        {!dayWins && dayTasks.filter(t => t.done).length === 0 && (
                          <p className="archive-not-evaluated">Complete tasks to evaluate.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
