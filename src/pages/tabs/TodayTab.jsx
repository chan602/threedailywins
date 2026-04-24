// ── TODAY TAB ────────────────────────────────────────────
// Extracted from Home.jsx. Covers Today, Tomorrow, Weekly,
// and Daily Habits sub-tabs. All state and logic in Home.

import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

function weekRangeLabel() {
  const d = new Date()
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diff)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(mon)} – ${fmt(sun)}`
}

// ── GRIP ICON ─────────────────────────────────────────────
function GripIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/>
      <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
      <circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/>
    </svg>
  )
}

// ── SORTABLE TASK ITEM ────────────────────────────────────
function SortableTaskItem({
  t, label, rankClass,
  listType,
  editingTaskId, editingTaskText, setEditingTaskId, setEditingTaskText, saveTaskEdit,
  toggleTask, deleteTask, completeChallenge,
}) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: t.id })

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : undefined,
    position: isDragging ? 'relative' : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-item ${t.done ? 'done' : ''} ${isDragging ? 'dragging' : ''}`}
    >
      {/* Drag handle — listeners only here, so taps on the rest of the row work normally */}
      <span className="drag-handle" title="Drag to reorder" {...attributes} {...listeners}>
        <GripIcon />
      </span>

      <button
        className={`check-btn ${t.done ? 'checked' : ''}`}
        onClick={() => {
          toggleTask(listType, t.id)
          if (!t.done && t.tag === 'challenge' && t.challengeId && completeChallenge) {
            completeChallenge(t.challengeId, t.text)
          }
        }}
      />

      <span className={`task-num ${rankClass || ''}`}>{label}</span>

      {editingTaskId === t.id ? (
        <input
          className="task-input task-edit-input"
          value={editingTaskText}
          onChange={e => setEditingTaskText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') saveTaskEdit(listType, t.id)
            if (e.key === 'Escape') { setEditingTaskId(null); setEditingTaskText('') }
          }}
          onBlur={() => saveTaskEdit(listType, t.id)}
          autoFocus
        />
      ) : (
        <span
          className="task-text"
          onDoubleClick={() => { setEditingTaskId(t.id); setEditingTaskText(t.text) }}
        >
          {t.text}
          {t.carried && (
            <span className={`tag carried-tag${(t.carryCount || 1) >= 6 ? ' carried-tag-flash' : (t.carryCount || 1) >= 3 ? ' carried-tag-urgent' : (t.carryCount || 1) >= 2 ? ' carried-tag-warn' : ''}`}>
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

      <button className="delete-btn" onClick={() => deleteTask(listType, t.id)}>×</button>
    </div>
  )
}

// ── DRAGGABLE TASK LIST (dnd-kit, touch + mouse) ──────────
function DraggableTaskList({
  tasks, listType, labelPrefix,
  editingTaskId, editingTaskText, setEditingTaskId, setEditingTaskText, saveTaskEdit,
  toggleTask, deleteTask, reorderTask, completeChallenge,
  autoSortCompleted,
}) {
  const sensors = useSensors(
    // Mouse/trackpad: activate after 5px movement (avoids accidental drags on clicks)
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // Touch: activate after 150ms press-hold with ≤5px drift (avoids scroll conflicts)
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  )

  // Seed order field if missing
  const seeded = tasks.map((t, i) => t.order != null ? t : { ...t, order: i })
  const byOrder = [...seeded].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const displayed = autoSortCompleted
    ? [...byOrder.filter(t => !t.done), ...byOrder.filter(t => t.done)]
    : byOrder

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = displayed.findIndex(t => t.id === active.id)
    const newIdx = displayed.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return
    const reordered = arrayMove(displayed, oldIdx, newIdx)
    const withOrder = reordered.map((t, i) => ({ ...t, order: i }))
    reorderTask(listType, withOrder)
  }

  if (tasks.length === 0) {
    return <div className="task-list"><p className="empty-msg">No tasks yet</p></div>
  }

  // Rank counter for coloring T1/T2/T3 (today list only)
  let rankCounter = 0

  return (
    <div className="task-list">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={displayed.map(t => t.id)} strategy={verticalListSortingStrategy}>
          {displayed.map((t, visualIdx) => {
            const rank = !t.done ? ++rankCounter : null
            const rankClass = rank === 1 ? 'task-rank-1' : rank === 2 ? 'task-rank-2' : rank === 3 ? 'task-rank-3' : ''
            const label = `${labelPrefix}${visualIdx + 1}`
            return (
              <SortableTaskItem
                key={t.id}
                t={t}
                label={label}
                rankClass={rankClass}
                listType={listType}
                editingTaskId={editingTaskId}
                editingTaskText={editingTaskText}
                setEditingTaskId={setEditingTaskId}
                setEditingTaskText={setEditingTaskText}
                saveTaskEdit={saveTaskEdit}
                toggleTask={toggleTask}
                deleteTask={deleteTask}
                completeChallenge={completeChallenge}
              />
            )
          })}
        </SortableContext>
      </DndContext>
    </div>
  )
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
  evalsToday,
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
  reorderTask,
  autoSortCompleted,
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

          <DraggableTaskList
            tasks={todayTasks}
            listType="today"
            labelPrefix="T"
            editingTaskId={editingTaskId}
            editingTaskText={editingTaskText}
            setEditingTaskId={setEditingTaskId}
            setEditingTaskText={setEditingTaskText}
            saveTaskEdit={saveTaskEdit}
            toggleTask={toggleTask}
            deleteTask={deleteTask}
            reorderTask={reorderTask}
            completeChallenge={completeChallenge}
            autoSortCompleted={autoSortCompleted}
          />

          {/* ── AI WINS EVAL PANEL ── */}
          <div className={`wins-panel${tutorialStep === 4 ? ' tutorial-highlight' : ''}`}>
            <div className="wins-panel-header">
              <span className="wins-panel-title">Three Wins</span>
              <button className="eval-btn" onClick={evaluateWins} disabled={evalLoading}>
                {evalLoading ? 'Evaluating…' : todayWins?.evaluatedAt ? 'Re-evaluate' : 'Evaluate'}
              </button>
            </div>
            <p className="eval-scope-note">Evaluated from today's to-do list only. {evalsToday}/3 evals used today.</p>

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
          <DraggableTaskList
            tasks={tomorrowTasks}
            listType="tomorrow"
            labelPrefix="Tm"
            editingTaskId={editingTaskId}
            editingTaskText={editingTaskText}
            setEditingTaskId={setEditingTaskId}
            setEditingTaskText={setEditingTaskText}
            saveTaskEdit={saveTaskEdit}
            toggleTask={toggleTask}
            deleteTask={deleteTask}
            reorderTask={reorderTask}
            autoSortCompleted={false}
          />
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
          <DraggableTaskList
            tasks={weeklyTasks}
            listType="weekly"
            labelPrefix="W"
            editingTaskId={editingTaskId}
            editingTaskText={editingTaskText}
            setEditingTaskId={setEditingTaskId}
            setEditingTaskText={setEditingTaskText}
            saveTaskEdit={saveTaskEdit}
            toggleTask={toggleTask}
            deleteTask={deleteTask}
            reorderTask={reorderTask}
            autoSortCompleted={false}
          />

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
