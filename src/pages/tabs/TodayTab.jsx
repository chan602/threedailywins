// ── TODAY TAB ────────────────────────────────────────────
// Extracted from Home.jsx. Covers Today, Tomorrow, Weekly,
// and Daily Habits sub-tabs. All state and logic in Home.

function weekRangeLabel() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diff)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)} – ${fmt(sun)}`
}

export default function TodayTab({
  activeTab,
  // today
  todayTasks,
  todayInput,
  setTodayInput,
  addFlash,
  addTask,
  toggleTask,
  deleteTask,
  editingTaskId,
  setEditingTaskId,
  editingTaskText,
  setEditingTaskText,
  saveTaskEdit,
  // eval panel
  tutorialStep,
  todayWins,
  evalLoading,
  evalError,
  evaluateWins,
  evalFlash,
  getEffectiveWin,
  overrideOpen,
  overrideComments,
  setOverrideComments,
  openOverride,
  applyOverride,
  revertOverride,
  userProfile,
  // tomorrow
  tomorrowTasks,
  tomorrowInput,
  setTomorrowInput,
  // weekly
  weeklyTasks,
  weeklyInput,
  setWeeklyInput,
  // daily
  dailyRepeats,
  dailyInput,
  setDailyInput,
  addDailyRepeat,
  tapDailyRepeat,
  untapDailyRepeat,
  deleteDailyRepeat,
  completeChallenge,
}) {
  const doneTasks = todayTasks.filter(t => t.done).length
  const totalTasks = todayTasks.length
  const pct = totalTasks === 0 ? 0 : Math.round(doneTasks / totalTasks * 100)

  const evalTime = todayWins?.evaluatedAt
    ? new Date(todayWins.evaluatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  return (
    <>
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
            <button className={`add-btn${addFlash ? ' add-btn-flash' : ''}`} onClick={addTask}>+</button>
          </div>

          <div className="task-list">
            {todayTasks.length === 0 && <p className="empty-msg">No tasks yet</p>}
            {[...todayTasks].sort((a, b) => a.done === b.done ? 0 : a.done ? 1 : -1).map((t, i) => (
              <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                <button className={`check-btn ${t.done ? 'checked' : ''}`} onClick={() => {
                  toggleTask('today', t.id)
                  if (!t.done && t.tag === 'challenge' && t.challengeId && completeChallenge) {
                    completeChallenge(t.challengeId, t.text)
                  }
                }} />
                <span className="task-num">T{i + 1}</span>
                {editingTaskId === t.id ? (
                  <input
                    className="task-input task-edit-input"
                    value={editingTaskText}
                    onChange={e => setEditingTaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveTaskEdit('today', t.id)
                      if (e.key === 'Escape') { setEditingTaskId(null); setEditingTaskText('') }
                    }}
                    onBlur={() => saveTaskEdit('today', t.id)}
                    autoFocus
                  />
                ) : (
                  <span className="task-text" onDoubleClick={() => { setEditingTaskId(t.id); setEditingTaskText(t.text) }}>
                    {t.text}
                    {t.carried && (
                      <span className={`tag carried-tag${(t.carryCount || 1) >= 3 ? ' carried-tag-urgent' : (t.carryCount || 1) >= 2 ? ' carried-tag-warn' : ''}`}>
                        carried{(t.carryCount || 1) > 1 ? ` ×${t.carryCount}` : ''}
                      </span>
                    )}
                    {t.fromDTask && <span className="tag daily-tag">daily</span>}
                    {t.tag === 'challenge' && (
                      <span className="tag" style={{ background: 'var(--accent-muted)', color: 'var(--accent)', marginLeft: 4 }}>
                        ⚡ {t.challengerName ? `from @${t.challengerName}` : 'challenge'}
                      </span>
                    )}
                  </span>
                )}
                <button className="delete-btn" onClick={() => deleteTask('today', t.id)}>×</button>
              </div>
            ))}
          </div>

          {/* ── AI WINS EVAL PANEL ── */}
          <div className={`wins-panel${tutorialStep === 4 ? ' tutorial-highlight' : ''}`}>
            <div className="wins-panel-header">
              <span className="wins-panel-title">Three Wins</span>
              <button className="eval-btn" onClick={evaluateWins} disabled={evalLoading}>
                {evalLoading ? 'Evaluating…' : todayWins?.evaluatedAt ? 'Re-evaluate' : 'Evaluate'}
              </button>
            </div>
            <p className="eval-scope-note">Evaluated from today's to-do list only. 3 per day.</p>

            {evalTime && <p className="eval-meta">Evaluated at {evalTime} · Powered by Claude AI</p>}
            {evalError && <p className="eval-error">{evalError}</p>}

            {['physical', 'mental', 'spiritual'].map(type => {
              const effective = getEffectiveWin(todayWins, type)
              const overrideKey = `override${type.charAt(0).toUpperCase() + type.slice(1)}`
              const noteKey = `note${type.charAt(0).toUpperCase() + type.slice(1)}`
              const isOverridden = todayWins?.[overrideKey] != null
              const isOverrideOpen = overrideOpen[type]
              const labels = { physical: 'Physical', mental: 'Mental', spiritual: 'Spiritual' }

              const fullReasoning = todayWins?.reasoning || ''
              const sentences = fullReasoning.split('. ')
              const relevantLine = sentences.find(s => s.toLowerCase().includes(type)) || fullReasoning

              const def = userProfile?.winsDefinition?.[type] || ''
              const iconState = effective === true ? 'achieved' : 'missed'
              const iconSrc = `/icons/wins/${type}_${iconState}.png`

              return (
                <div key={type} className={`win-row ${effective === true ? 'achieved' : effective === false ? 'missed' : 'pending'}${evalFlash[type] ? ` win-row-flash-${type}` : ''}`}>
                  <div className="win-row-top">
                    <div className="win-row-label-group">
                      <img src={iconSrc} alt={labels[type]} className="win-row-icon" />
                      <span className="win-row-label">{labels[type]}</span>
                    </div>
                    <div className="win-row-right">
                      <span className={`win-status-pill ${effective === true ? 'achieved' : effective === false ? 'missed' : 'pending'}`}>
                        {effective === true ? '✓ Achieved' : effective === false ? '✗ Not detected' : '– Pending'}
                      </span>
                      {todayWins?.evaluatedAt && !isOverridden && (
                        <button className="override-btn" onClick={() => openOverride(type)}>
                          {isOverrideOpen ? 'Cancel' : 'Override'}
                        </button>
                      )}
                      {isOverridden && (
                        <button className="override-btn" onClick={() => revertOverride(type)}>Revert</button>
                      )}
                    </div>
                  </div>

                  {!todayWins?.evaluatedAt && def && (
                    <p className="win-definition">{def}</p>
                  )}
                  {todayWins?.evaluatedAt && relevantLine && (
                    <p className="win-reasoning">{relevantLine}</p>
                  )}
                  {isOverridden && todayWins?.[noteKey] && (
                    <p className="win-override-note">Note: {todayWins[noteKey]}</p>
                  )}

                  {isOverrideOpen && !isOverridden && (
                    <div className="override-box">
                      <input
                        className="override-comment-input"
                        placeholder="Optional note (e.g. did a long walk)"
                        value={overrideComments[type]}
                        onChange={e => setOverrideComments(prev => ({ ...prev, [type]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && applyOverride(type)}
                      />
                      <button className="override-apply-btn" onClick={() => applyOverride(type)}>
                        Confirm override
                      </button>
                    </div>
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
            <button className={`add-btn${addFlash ? ' add-btn-flash' : ''}`} onClick={addTask}>+</button>
          </div>
          <div className="task-list">
            {tomorrowTasks.length === 0 && <p className="empty-msg">Nothing queued</p>}
            {[...tomorrowTasks].sort((a, b) => a.done === b.done ? 0 : a.done ? 1 : -1).map((t, i) => (
              <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                <button className={`check-btn ${t.done ? 'checked' : ''}`} onClick={() => toggleTask('tomorrow', t.id)} />
                <span className="task-num">Tm{i + 1}</span>
                {editingTaskId === t.id ? (
                  <input
                    className="task-input task-edit-input"
                    value={editingTaskText}
                    onChange={e => setEditingTaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveTaskEdit('tomorrow', t.id)
                      if (e.key === 'Escape') { setEditingTaskId(null); setEditingTaskText('') }
                    }}
                    onBlur={() => saveTaskEdit('tomorrow', t.id)}
                    autoFocus
                  />
                ) : (
                  <span className="task-text" onDoubleClick={() => { setEditingTaskId(t.id); setEditingTaskText(t.text) }}>
                    {t.text}
                  </span>
                )}
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
            <button className={`add-btn${addFlash ? ' add-btn-flash' : ''}`} onClick={addTask}>+</button>
          </div>
          <div className="task-list">
            {weeklyTasks.length === 0 && <p className="empty-msg">No weekly goals</p>}
            {[...weeklyTasks].sort((a, b) => a.done === b.done ? 0 : a.done ? 1 : -1).map((t, i) => (
              <div key={t.id} className={`task-item ${t.done ? 'done' : ''}`}>
                <button className={`check-btn ${t.done ? 'checked' : ''}`} onClick={() => toggleTask('weekly', t.id)} />
                <span className="task-num">W{i + 1}</span>
                {editingTaskId === t.id ? (
                  <input
                    className="task-input task-edit-input"
                    value={editingTaskText}
                    onChange={e => setEditingTaskText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveTaskEdit('weekly', t.id)
                      if (e.key === 'Escape') { setEditingTaskId(null); setEditingTaskText('') }
                    }}
                    onBlur={() => saveTaskEdit('weekly', t.id)}
                    autoFocus
                  />
                ) : (
                  <span className="task-text" onDoubleClick={() => { setEditingTaskId(t.id); setEditingTaskText(t.text) }}>
                    {t.text}
                    {t.carried && (
                      <span className={`tag carried-tag${(t.carryCount || 1) >= 3 ? ' carried-tag-urgent' : (t.carryCount || 1) >= 2 ? ' carried-tag-warn' : ''}`}>
                        carried{(t.carryCount || 1) > 1 ? ` ×${t.carryCount}` : ''}
                      </span>
                    )}
                  </span>
                )}
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
    </>
  )
}
