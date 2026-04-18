const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

initializeApp();
const db = getFirestore();

// ── HELPERS ──────────────────────────────────────────────
function todayStrFor(date) {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
}

function weekKeyFor(date) {
  const d = new Date(date.toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }))
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d); mon.setDate(d.getDate() + diff)
  const jan1 = new Date(mon.getFullYear(), 0, 1)
  const week = Math.ceil(((mon - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  return `${mon.getFullYear()}-W${String(week).padStart(2, '0')}`
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

function isThreeWinDay(w) {
  if (!w) return false
  const p = w.overridePhysical != null ? w.overridePhysical : w.physical
  const m = w.overrideMental != null ? w.overrideMental : w.mental
  const s = w.overrideSpiritual != null ? w.overrideSpiritual : w.spiritual
  return p && m && s
}

// ── DAILY ROLLOVER FOR ONE USER ───────────────────────────
async function runDailyRollover(uid, today, yesterday) {
  const rolloverRef = db.doc(`meta/${uid}/rollover/data`)
  const metaSnap = await rolloverRef.get()
  const meta = metaSnap.exists ? metaSnap.data() : {}

  // Already rolled over today — skip
  if (meta.lastRollover === today) return

  const todayRef = db.doc(`tasks/${uid}/today/data`)
  const ySnap = await todayRef.get()

  // Archive yesterday's tasks
  if (ySnap.exists && (ySnap.data().tasks || []).length > 0) {
    const yTasks = ySnap.data().tasks
    const done = yTasks.filter(t => t.done).length
    await db.doc(`archive/${uid}/days/${yesterday}`).set({
      date: yesterday,
      tasks: yTasks,
      summary: `${done}/${yTasks.length} completed`,
      archivedAt: Date.now()
    })
  }

  // Carry over unfinished tasks
  const existingToday = ySnap.exists ? (ySnap.data().tasks || []) : []
  const carryOver = existingToday
    .filter(t => !t.done)
    .map(t => ({ ...t, carried: true, carryCount: (t.carryCount || 0) + 1 }))

  // Pull tomorrow queue into today
  const tmrwSnap = await db.doc(`tasks/${uid}/tomorrow/${today}`).get()
  const fromTmrw = tmrwSnap.exists
    ? (tmrwSnap.data().tasks || []).map(t => ({ ...t, carried: false, carryCount: 0 }))
    : []

  // Merge and dedup by id
  const allTasks = [...carryOver, ...fromTmrw]
  const seen = new Set()
  const merged = allTasks.filter(t => seen.has(t.id) ? false : seen.add(t.id))
  await todayRef.set({ tasks: merged, date: today })

  // Weekly rollover on Monday
  const nowLA = new Date(new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' }))
  if (nowLA.getDay() === 1 && meta.lastWeekRollover !== weekKeyFor(new Date())) {
    await runWeeklyRollover(uid, meta)
  }

  await rolloverRef.set({ ...meta, lastRollover: today })
  console.log(`Rollover complete for uid: ${uid}`)
}

// ── WEEKLY ROLLOVER FOR ONE USER ─────────────────────────
async function runWeeklyRollover(uid, meta) {
  const now = new Date()
  const prevWeek = new Date(now); prevWeek.setDate(now.getDate() - 7)
  const prevDay = prevWeek.getDay()
  const diff = prevDay === 0 ? -6 : 1 - prevDay
  const prevMon = new Date(prevWeek); prevMon.setDate(prevWeek.getDate() + diff)
  const jan1 = new Date(prevMon.getFullYear(), 0, 1)
  const wk = Math.ceil(((prevMon - jan1) / 86400000 + jan1.getDay() + 1) / 7)
  const prevKey = `${prevMon.getFullYear()}-W${String(wk).padStart(2, '0')}`
  const currentKey = weekKeyFor(now)

  const prevSnap = await db.doc(`tasks/${uid}/weekly/${prevKey}`).get()
  const prevRepeat = await db.doc(`tasks/${uid}/dailyRepeat/${prevKey}`).get()
  const wTasks = prevSnap.exists ? (prevSnap.data().tasks || []) : []
  const dTasks = prevRepeat.exists ? (prevRepeat.data().tasks || []) : []

  // Archive previous week
  if (wTasks.length > 0 || dTasks.length > 0) {
    const wDone = wTasks.filter(t => t.done).length
    await db.doc(`archive/${uid}/weeks/${prevKey}`).set({
      weekKey: prevKey,
      weekStart: prevMon.toLocaleDateString('en-CA'),
      wTasks, dTasks,
      summary: `${wDone}/${wTasks.length} weekly goals`,
      archivedAt: Date.now()
    })
  }

  // Carry unfinished weekly goals forward
  if (prevSnap.exists) {
    const unfinished = wTasks.filter(t => !t.done)
      .map(t => ({ ...t, carried: true, carryCount: (t.carryCount || 0) + 1 }))
    const thisSnap = await db.doc(`tasks/${uid}/weekly/${currentKey}`).get()
    const current = thisSnap.exists ? (thisSnap.data().tasks || []) : []
    await db.doc(`tasks/${uid}/weekly/${currentKey}`).set({
      tasks: [...unfinished, ...current],
      weekKey: currentKey
    })
  }

  // Reset daily habits count for new week
  const newDTasks = dTasks.map(t => ({ ...t, count: 0 }))
  await db.doc(`tasks/${uid}/dailyRepeat/${currentKey}`).set({
    tasks: newDTasks,
    weekKey: currentKey
  })

  // Auto weekly win calculation
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(prevMon)
    d.setDate(prevMon.getDate() + i)
    return d.toLocaleDateString('en-CA')
  })
  const dayWinsSnaps = await Promise.all(
    weekDates.map(date => db.doc(`wins/${uid}/days/${date}`).get())
  )
  const threeWinDayCount = dayWinsSnaps.filter(snap => {
    if (!snap.exists) return false
    return isThreeWinDay(snap.data())
  }).length
  const weekIsWin = threeWinDayCount >= 5
  await db.doc(`wins/${uid}/weeks/${prevKey}`).set({
    weekKey: prevKey,
    physical: weekIsWin,
    mental: weekIsWin,
    spiritual: weekIsWin,
    threeWinDays: threeWinDayCount,
    calculatedAt: Date.now()
  })

  await db.doc(`meta/${uid}/rollover/data`).set(
    { ...meta, lastWeekRollover: currentKey },
    { merge: true }
  )
}

// ── SCHEDULED FUNCTION — runs at midnight PST (8am UTC) ──
exports.midnightRollover = onSchedule(
  {
    schedule: "0 8 * * *",   // 8:00 UTC = midnight PST / 3am EST
    timeZone: "UTC",
    memory: "256MiB",
    timeoutSeconds: 540,
  },
  async () => {
    const now = new Date()
    const today = todayStrFor(now)
    const yesterdayDate = new Date(now)
    yesterdayDate.setDate(now.getDate() - 1)
    const yesterday = todayStrFor(yesterdayDate)

    console.log(`Starting midnight rollover. Today (PST): ${today}`)

    // Get all users
    const usersSnap = await db.collection('users').get()
    console.log(`Processing ${usersSnap.size} users`)

    // Process in batches of 10 to avoid overwhelming Firestore
    const uids = usersSnap.docs.map(d => d.data().uid).filter(Boolean)
    const batchSize = 10
    for (let i = 0; i < uids.length; i += batchSize) {
      const batch = uids.slice(i, i + batchSize)
      await Promise.all(batch.map(uid =>
        runDailyRollover(uid, today, yesterday).catch(err =>
          console.error(`Rollover failed for uid ${uid}:`, err)
        )
      ))
    }

    console.log('Midnight rollover complete')
  }
)

// ── EVALUATE WIN — callable function ─────────────────────
const { onCall, HttpsError } = require("firebase-functions/v2/https");

exports.evaluateWin = onCall(
  { memory: "256MiB", timeoutSeconds: 30, secrets: ["ANTHROPIC_KEY"] },
  async (request) => {
    // 1. Verify auth
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in to evaluate wins.");
    }
    const uid = request.auth.uid;
    const { prompt, type, date } = request.data;

    if (!prompt || !type || !date) {
      throw new HttpsError("invalid-argument", "Missing prompt, type, or date.");
    }

    // 2. Rate limit — 3 evals/day for free users
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const evalCountRef = db.doc(`meta/${uid}/evalCount/${today}`);
    const evalSnap = await evalCountRef.get();
    const evalData = evalSnap.exists ? evalSnap.data() : { count: 0 };

    const userSnap = await db.doc(`users/${uid}`).get();
    const isPro = userSnap.exists ? (userSnap.data().isPro || false) : false;
    const dailyLimit = isPro ? Infinity : 3;

    if (evalData.count >= dailyLimit) {
      throw new HttpsError("resource-exhausted", `Free tier limit is ${dailyLimit} evals per day.`);
    }

    // 3. Call Anthropic
    const anthropicKey = process.env.ANTHROPIC_KEY;
    if (!anthropicKey) {
      throw new HttpsError("internal", "Anthropic key not configured.");
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new HttpsError("internal", "Anthropic API call failed.");
    }

    const data = await response.json();
    const text = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
    const result = JSON.parse(text);

    // 4. Increment eval count
    await evalCountRef.set({ count: evalData.count + 1, updatedAt: Date.now() });

    return result;
  }
);
