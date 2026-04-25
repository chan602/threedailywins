const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const sgMail = require("@sendgrid/mail");

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

// ── RECALCULATE STREAK FOR ONE USER ──────────────────────
// Walk backward from today (or yesterday) while days are consecutive wins.
async function recalculateStreakForUser(uid, today) {
  // Build Set of 3-win dates + total count
  const winsSnap = await db.collection('wins').doc(uid).collection('days').get()
  const winSet = new Set()
  let total = 0
  winsSnap.forEach(d => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d.id) && isThreeWinDay(d.data())) {
      winSet.add(d.id)
      total++
    }
  })

  // Walk backward from today (or yesterday if today isn't a win)
  const cursor = new Date(today + 'T12:00:00Z')
  if (!winSet.has(today)) cursor.setDate(cursor.getDate() - 1)
  const walkStart = cursor.toLocaleDateString('en-CA')

  let current = 0
  while (winSet.has(cursor.toLocaleDateString('en-CA'))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  const lastWinDate = current > 0 ? walkStart : ''

  // Preserve existing best
  const streakRef = db.doc(`streak/${uid}`)
  const streakSnap = await streakRef.get()
  const existingBest = streakSnap.exists ? (streakSnap.data().best || 0) : 0
  const best = Math.max(existingBest, current)

  await streakRef.set({ current, total, best, lastWinDate })

  const userSnap = await db.doc(`users/${uid}`).get()
  const userData = userSnap.exists ? userSnap.data() : {}
  await db.doc(`leaderboard/${uid}`).set({
    uid,
    username: userData.username || '',
    photoURL: userData.photoURL || '',
    current, total, best,
    updatedAt: Date.now(),
  })

  console.log(`Streak recalculated for uid ${uid}: current=${current}, total=${total}, best=${best}`)
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

  // Recalculate streak now that yesterday is archived and wins are settled
  await recalculateStreakForUser(uid, today)

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


// ── SOCIAL FUNCTIONS ─────────────────────────────────────
// Shared imports already loaded above (onCall, HttpsError)
const { v4: uuidv4 } = require("uuid");

// Helper — write a notification to a user's inbox
async function writeNotif(recipientUid, notif) {
  const id = uuidv4();
  await db.doc(`notifications/${recipientUid}/items/${id}`).set({
    id,
    ...notif,
    read: false,
    createdAt: Date.now(),
  });
  return id;
}

// ── SEND KUDOS ───────────────────────────────────────────
exports.sendKudos = onCall(
  { memory: "256MiB", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { recipientUid, accomplishmentId, accomplishmentLabel, senderDisplayName } = request.data;
    if (!recipientUid || !accomplishmentId) throw new HttpsError("invalid-argument", "Missing fields.");
    if (request.auth.uid === recipientUid) throw new HttpsError("invalid-argument", "Can't kudos yourself.");

    // Increment kudosCount on the accomplishment doc
    const accRef = db.doc(`accomplishments/${recipientUid}/items/${accomplishmentId}`);
    const accSnap = await accRef.get();
    if (accSnap.exists) {
      await accRef.update({ kudosCount: (accSnap.data().kudosCount || 0) + 1 });
    }

    await writeNotif(recipientUid, {
      type: "kudos",
      senderUid: request.auth.uid,
      senderDisplayName: senderDisplayName || "Someone",
      accomplishmentId,
      accomplishmentLabel,
      message: `${senderDisplayName || "Someone"} gave you a thumbs up for: ${accomplishmentLabel}`,
    });

    return { success: true };
  }
);

// ── SEND NUDGE ───────────────────────────────────────────
exports.sendNudge = onCall(
  { memory: "256MiB", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { recipientUid, taskText, senderDisplayName } = request.data;
    if (!recipientUid || !taskText) throw new HttpsError("invalid-argument", "Missing fields.");
    if (request.auth.uid === recipientUid) throw new HttpsError("invalid-argument", "Can't nudge yourself.");

    await writeNotif(recipientUid, {
      type: "nudge",
      senderUid: request.auth.uid,
      senderDisplayName: senderDisplayName || "Someone",
      taskText,
      message: `${senderDisplayName || "Someone"} nudged you: "${taskText}"`,
    });

    return { success: true };
  }
);

// ── SEND CHALLENGE ───────────────────────────────────────
exports.sendChallenge = onCall(
  { memory: "256MiB", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { recipientUid, taskText, destination, senderDisplayName } = request.data;
    // destination: 'today' | 'weekly'
    if (!recipientUid || !taskText) throw new HttpsError("invalid-argument", "Missing fields.");
    if (request.auth.uid === recipientUid) throw new HttpsError("invalid-argument", "Can't challenge yourself.");

    const challengeId = uuidv4();
    await db.doc(`challenges/${challengeId}`).set({
      id: challengeId,
      senderUid: request.auth.uid,
      senderDisplayName: senderDisplayName || "Someone",
      recipientUid,
      taskText,
      destination: destination || "today",
      status: "pending",
      createdAt: Date.now(),
    });

    await writeNotif(recipientUid, {
      type: "challenge",
      senderUid: request.auth.uid,
      senderDisplayName: senderDisplayName || "Someone",
      challengeId,
      taskText,
      destination: destination || "today",
      message: `${senderDisplayName || "Someone"} challenged you: "${taskText}"`,
    });

    return { challengeId };
  }
);

// ── RESPOND TO CHALLENGE (accept / decline) ──────────────
exports.respondToChallenge = onCall(
  { memory: "256MiB", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { challengeId, response: resp, notifId } = request.data;
    // resp: 'accepted' | 'declined'
    if (!challengeId || !resp) throw new HttpsError("invalid-argument", "Missing fields.");

    const challengeRef = db.doc(`challenges/${challengeId}`);
    const snap = await challengeRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Challenge not found.");

    const challenge = snap.data();
    if (challenge.recipientUid !== request.auth.uid)
      throw new HttpsError("permission-denied", "Not your challenge.");
    if (challenge.status !== "pending")
      throw new HttpsError("failed-precondition", "Challenge already responded to.");

    await challengeRef.update({ status: resp, respondedAt: Date.now() });

    // Mark notification read
    if (notifId) {
      await db.doc(`notifications/${request.auth.uid}/items/${notifId}`).update({ read: true });
    }

    if (resp === "accepted") {
      // Drop task into recipient's today or weekly list
      const uid = request.auth.uid;
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
      const newTask = {
        id: uuidv4(),
        text: challenge.taskText,
        done: false,
        carried: false,
        carryCount: 0,
        tag: "challenge",
        challengeId,
        challengerUid: challenge.senderUid,
        challengerName: challenge.senderDisplayName,
        createdAt: Date.now(),
      };

      if (challenge.destination === "weekly") {
        const wKey = weekKeyFor(new Date());
        const weekRef = db.doc(`tasks/${uid}/weekly/${wKey}`);
        const wSnap = await weekRef.get();
        const existing = wSnap.exists ? (wSnap.data().tasks || []) : [];
        await weekRef.set({ tasks: [...existing, newTask], weekKey: wKey });
      } else {
        const todayRef = db.doc(`tasks/${uid}/today/data`);
        const tSnap = await todayRef.get();
        const existing = tSnap.exists ? (tSnap.data().tasks || []) : [];
        await todayRef.set({ tasks: [...existing, newTask], date: today });
      }

      // Notify sender of acceptance
      await writeNotif(challenge.senderUid, {
        type: "challenge_accepted",
        senderUid: uid,
        senderDisplayName: request.auth.token?.name || "Your friend",
        challengeId,
        taskText: challenge.taskText,
        message: `${request.auth.token?.name || "Your friend"} accepted your challenge: "${challenge.taskText}"`,
      });
    } else {
      // Notify sender of decline
      await writeNotif(challenge.senderUid, {
        type: "challenge_declined",
        senderUid: request.auth.uid,
        senderDisplayName: request.auth.token?.name || "Your friend",
        challengeId,
        taskText: challenge.taskText,
        message: `${request.auth.token?.name || "Your friend"} declined your challenge: "${challenge.taskText}"`,
      });
    }

    return { success: true };
  }
);

// ── COMPLETE CHALLENGE ───────────────────────────────────
exports.completeChallenge = onCall(
  { memory: "256MiB", timeoutSeconds: 15 },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Must be logged in.");
    const { challengeId, taskText } = request.data;
    if (!challengeId) throw new HttpsError("invalid-argument", "Missing challengeId.");

    const uid = request.auth.uid;
    const challengeRef = db.doc(`challenges/${challengeId}`);
    const snap = await challengeRef.get();
    if (!snap.exists) throw new HttpsError("not-found", "Challenge not found.");

    const challenge = snap.data();
    if (challenge.recipientUid !== uid)
      throw new HttpsError("permission-denied", "Not your challenge.");
    if (challenge.status === "completed") return { success: true }; // idempotent

    await challengeRef.update({ status: "completed", completedAt: Date.now() });

    // Write accomplishment for recipient
    const accomplishmentId = uuidv4();
    await db.doc(`accomplishments/${uid}/items/${accomplishmentId}`).set({
      id: accomplishmentId,
      type: "challenge_completed",
      challengeId,
      taskText: taskText || challenge.taskText,
      challengerUid: challenge.senderUid,
      challengerName: challenge.senderDisplayName,
      createdAt: Date.now(),
    });

    // Notify sender
    await writeNotif(challenge.senderUid, {
      type: "challenge_completed",
      senderUid: uid,
      senderDisplayName: request.auth.token?.name || "Your friend",
      challengeId,
      accomplishmentId,
      taskText: taskText || challenge.taskText,
      message: `${request.auth.token?.name || "Your friend"} completed your challenge: "${taskText || challenge.taskText}"`,
    });

    return { accomplishmentId };
  }
);

// ── EMAIL NOTIFICATIONS ──────────────────────────────────
const APP_URL = "https://threedailywins.com";
const ICON_URL = "https://threedailywins.com/icons/icon-192.png";
// Types that trigger an email to the recipient:
// - nudge: someone nudged you
// - challenge: someone challenged you
// - challenge_completed: someone completed YOUR challenge (you're the sender)
const EMAIL_TYPES = ["nudge", "challenge", "challenge_completed"];

function emailHtml(subject, bodyLines, ctaText, ctaUrl) {
  const bodyHtml = bodyLines.map(l => l ? `<p style="margin:0 0 12px">${l}</p>` : "").join("");
  const ctaBlock = ctaText && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:8px;padding:10px 22px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem">${ctaText}</a>`
    : `<a href="${APP_URL}" style="display:inline-block;margin-top:8px;padding:10px 22px;background:#7c3aed;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.95rem">Open Three Daily Wins</a>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0f13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e2e8f0">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:40px auto">
    <tr><td style="padding:32px 32px 24px;background:#1a1a2e;border-radius:16px 16px 0 0;text-align:center;border-bottom:1px solid #2d2d4e">
      <img src="${ICON_URL}" width="56" height="56" alt="3W" style="border-radius:12px;display:block;margin:0 auto 12px">
      <span style="font-size:0.8rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#7c3aed">Three Daily Wins</span>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;background:#1a1a2e">
      <h2 style="margin:0 0 16px;font-size:1.15rem;font-weight:700;color:#f1f5f9">${subject}</h2>
      <div style="font-size:0.95rem;line-height:1.6;color:#94a3b8">${bodyHtml}</div>
    </td></tr>
    <tr><td style="padding:8px 32px 32px;background:#1a1a2e;border-radius:0 0 16px 16px">
      ${ctaBlock}
    </td></tr>
    <tr><td style="padding:20px 0;text-align:center">
      <p style="font-size:0.75rem;color:#4a4a6a;margin:0">You're receiving this because email notifications are on.</p>
      <p style="font-size:0.75rem;color:#4a4a6a;margin:4px 0 0">Turn them off in <a href="${APP_URL}/home/profile" style="color:#7c3aed;text-decoration:none">Settings → Customization</a>.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildEmailTemplate(notif) {
  const name = notif.senderDisplayName || "Someone";
  const task = notif.taskText ? `"${notif.taskText}"` : "";
  const acc = notif.accomplishmentLabel ? `"${notif.accomplishmentLabel}"` : "";

  // For challenge_completed: link to completer's profile if username available
  const completerProfile = notif.senderUsername
    ? `${APP_URL}/u/${notif.senderUsername}`
    : APP_URL;

  const templates = {
    nudge: {
      subject: `${name} nudged you`,
      html: emailHtml(
        `${name} nudged you`,
        [`${name} gave you a nudge${task ? ` about: ${task}` : ""}.`, "Sometimes that's all it takes."],
        "Open the app",
        APP_URL,
      ),
    },
    challenge: {
      subject: `${name} challenged you`,
      html: emailHtml(
        `${name} challenged you`,
        [`${name} challenged you to: ${task}`, "Accept or decline in the app."],
        "View challenge",
        APP_URL,
      ),
    },
    challenge_completed: {
      subject: `${name} completed your challenge`,
      html: emailHtml(
        `${name} completed your challenge`,
        [`${name} completed your challenge: ${task}`, "Send them some kudos for pulling it off."],
        "Send kudos →",
        completerProfile,
      ),
    },
  };

  return templates[notif.type] || null;
}

exports.sendFriendRequestEmail = onDocumentCreated(
  {
    document: "friendRequests/{uid}/incoming/{requestId}",
    memory: "256MiB",
    timeoutSeconds: 30,
    secrets: ["SENDGRID_KEY"],
  },
  async (event) => {
    const uid = event.params.uid;
    const req = event.data?.data();
    if (!req) return;

    try {
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) return;
      if (userSnap.data().emailNotifications === false) return;

      const userRecord = await getAuth().getUser(uid);
      const email = userRecord.email;
      if (!email) return;

      const senderName = req.username || "Someone";
      sgMail.setApiKey(process.env.SENDGRID_KEY);
      await sgMail.send({
        to: email,
        from: { email: "noreply@threedailywins.com", name: "Three Daily Wins" },
        subject: `${senderName} sent you a friend request`,
        html: emailHtml(
          `${senderName} sent you a friend request`,
          [`${senderName} wants to connect with you on Three Daily Wins.`, "Accept or decline in the app."],
          "View request",
          APP_URL,
        ),
      });

      console.log(`Friend request email sent → ${email} from ${senderName}`);
    } catch (err) {
      console.error("sendFriendRequestEmail error:", err.message || err);
    }
  }
);

exports.sendEmailNotification = onDocumentCreated(
  {
    document: "notifications/{uid}/items/{notifId}",
    memory: "256MiB",
    timeoutSeconds: 30,
    secrets: ["SENDGRID_KEY"],
  },
  async (event) => {
    const uid = event.params.uid;
    const notif = event.data?.data();
    if (!notif) return;

    // Only send for relevant notification types
    if (!EMAIL_TYPES.includes(notif.type)) return;

    try {
      // Check user's email preference — default-on (send unless explicitly false)
      const userSnap = await db.doc(`users/${uid}`).get();
      if (!userSnap.exists) return;
      if (userSnap.data().emailNotifications === false) return;

      // Get email address from Firebase Auth (always accurate)
      const userRecord = await getAuth().getUser(uid);
      const email = userRecord.email;
      if (!email) return;

      const template = buildEmailTemplate(notif);
      if (!template) return;

      sgMail.setApiKey(process.env.SENDGRID_KEY);
      await sgMail.send({
        to: email,
        from: { email: "noreply@threedailywins.com", name: "Three Daily Wins" },
        subject: template.subject,
        html: template.html,
      });

      console.log(`Email sent → ${email} [${notif.type}]`);
    } catch (err) {
      console.error("sendEmailNotification error:", err.message || err);
    }
  }
);
