import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();
const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Demo data for one student ("Olivia Wilson"), her assigned counselor and a
// linked parent/guardian, so every student- and counselor-facing screen has
// something to show. Safe to re-run: it wipes and recreates Olivia's demo rows
// (biometrics, moods, messages, appointments, notes, alerts other than her
// panic-button alerts, counselor-change requests) and upserts the rest.
//
//   node prisma/seed-demo-olivia.js
//
// Passwords are never touched. Timestamps are relative to "now", so re-running
// refreshes the data to the present day.
// ---------------------------------------------------------------------------

const STUDENT_EMAIL = "olivia.wilson@example.com";
const PARENT = {
  firstName: "Rebecca",
  lastName: "Wilson",
  email: "rebecca.wilson.parent@example.com",
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MIN = 60 * 1000;

const NOW = Date.now();
const ago = (ms) => new Date(NOW - ms);

// A moment `daysAgo` days back at hh:mm UTC (negative daysAgo = in the future).
function at(daysAgo, hour, minute = 0) {
  const d = new Date(NOW - daysAgo * DAY);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}

// Counselor office hours are Mon-Fri, so push weekend dates to Monday.
function weekday(date) {
  const d = new Date(date);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

// Small deterministic PRNG so re-runs produce the same shape of data.
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260920);
const jitter = (amount) => (rand() * 2 - 1) * amount;
const round = (n, dp = 0) => Number(n.toFixed(dp));

// ---------------------------------------------------------------------------
// Biometrics: 14 days, four readings a day. Days 13-7 are a calm baseline;
// days 6-0 show rising stress, poor sleep and less movement (mock-exam week).
// ---------------------------------------------------------------------------
function buildBiometricLogs(userId) {
  const slots = [
    { hour: 7,  minute: 40, steps: 0.12, cal: 0.62, stress: -4 },
    { hour: 11, minute: 30, steps: 0.40, cal: 0.78, stress: 2 },
    { hour: 15, minute: 45, steps: 0.72, cal: 0.90, stress: 6 },
    { hour: 19, minute: 50, steps: 1.0,  cal: 1.0,  stress: 2 },
  ];
  const logs = [];

  for (let d = 13; d >= 1; d--) {
    const recent = d < 7;
    const stressBase = recent ? 46 + (6 - d) * 4.2 : 32;
    const daySteps = recent ? 4500 + rand() * 2500 : 7500 + rand() * 3000;
    const dayCalories = recent ? 1850 + rand() * 250 : 2000 + rand() * 350;
    const sleep = recent ? 5 + rand() * 1.3 : 7 + rand() * 1.2;

    for (const s of slots) {
      let stress = stressBase + s.stress + jitter(5);
      let heartRate = 68 + stress * 0.32 + jitter(4);
      // The afternoon of the panic episode (two days ago).
      if (d === 2 && s.hour === 15) { stress = 74; heartRate = 104; }

      logs.push({
        userId,
        timestamp: at(d, s.hour, s.minute),
        heartRate: round(heartRate, 0),
        skinTemp: round(33.6 + stress * 0.006 + jitter(0.4), 1),
        gsr: round(1.2 + stress * 0.05 + jitter(0.3), 2),
        movement: round((daySteps * s.steps) / 100, 1),
        stressLevelScore: round(Math.min(stress, 100), 0),
        steps: round(daySteps * s.steps, 0),
        calories: round(dayCalories * s.cal, 0),
        sleepHours: round(sleep, 1),
      });
    }
  }

  // Today: three readings, the last a few minutes ago so the home screen
  // shows fresh vitals (elevated stress, short sleep).
  const today = [
    { back: 6 * HOUR,  hr: 82, stress: 55, steps: 1100, cal: 900,  gsr: 3.9, temp: 33.9, mov: 11 },
    { back: 3 * HOUR,  hr: 88, stress: 61, steps: 2600, cal: 1300, gsr: 4.4, temp: 34.0, mov: 26 },
    { back: 12 * MIN,  hr: 94, stress: 68, steps: 4200, cal: 1650, gsr: 4.9, temp: 34.2, mov: 42 },
  ];
  for (const t of today) {
    logs.push({
      userId,
      timestamp: ago(t.back),
      heartRate: t.hr,
      skinTemp: t.temp,
      gsr: t.gsr,
      movement: t.mov,
      stressLevelScore: t.stress,
      steps: t.steps,
      calories: t.cal,
      sleepHours: 5.4,
    });
  }

  return logs.map((l) => ({ ...l, createdAt: l.timestamp }));
}

// ---------------------------------------------------------------------------
// Mood journal (values the mobile app understands: GREAT/GOOD/OKAY/LOW/AWFUL)
// ---------------------------------------------------------------------------
function buildMoodLogs(userId) {
  const entries = [
    [13, 7, 45, "GOOD",  "Started the week well. Netball practice was fun."],
    [12, 18, 5, "GREAT", "Got a good mark on my history quiz!"],
    [11, 7, 50, "GOOD",  null],
    [10, 19, 20, "OKAY", "Tired, but managed."],
    [9,  18, 40, "GOOD", "Hung out with friends after school."],
    [8,  10, 15, "GREAT", "Weekend was relaxing."],
    [7,  7, 55, "GOOD",  null],
    [6,  7, 30, "OKAY",  "Mock exams announced for next week."],
    [5,  8, 0, "OKAY",   "Can't stop thinking about the exams."],
    [5,  19, 30, "LOW",  "Couldn't focus on revision."],
    [4,  7, 35, "LOW",   "Slept badly again. Everything feels like too much."],
    [3,  18, 45, "LOW",  null],
    [2,  15, 10, "AWFUL", "Panic before maths class. Felt like I couldn't breathe."],
    [1,  19, 15, "OKAY", "The breathing exercise helped a bit."],
  ];
  const logs = entries.map(([d, h, m, moodEmoji, notes]) => {
    const ts = at(d, h, m);
    return { userId, moodEmoji, notes, timestamp: ts, createdAt: ts };
  });
  const ts = ago(3.5 * HOUR);
  logs.push({ userId, moodEmoji: "LOW", notes: "Slept 5 hours. Mock exam tomorrow.", timestamp: ts, createdAt: ts });
  return logs;
}

async function main() {
  console.log("🌱 Seeding demo data for Olivia Wilson...");

  // Refuse to touch anything that isn't a local dev database.
  const dbHost = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(dbHost)) {
    throw new Error(`Refusing to seed demo data into non-local database host "${dbHost}"`);
  }

  const student = await prisma.user.findUnique({
    where: { email: STUDENT_EMAIL },
    include: { role: true, assignedCounselor: true },
  });
  if (!student || student.role?.name !== "STUDENT") {
    throw new Error(`Student ${STUDENT_EMAIL} not found`);
  }
  if (!student.orgId) throw new Error("Student has no organisation");
  const counselor = student.assignedCounselor;
  if (!counselor) throw new Error("Student has no assigned counselor to seed against");

  const parentRole = await prisma.role.findUnique({ where: { name: "PARENT" } });
  if (!parentRole) throw new Error("PARENT role missing — run `npm run seed` first");

  const orgAdmin = await prisma.user.findFirst({
    where: { orgId: student.orgId, role: { name: "ORG_ADMIN" } },
    select: { id: true },
  });

  const S = student.id;
  const C = counselor.id;
  const name = `${student.firstName} ${student.lastName}`;

  // Appointment slots: the next whole hour at least 2h out, for "today's schedule".
  const todaySlot = new Date(NOW + 2 * HOUR);
  todaySlot.setUTCMinutes(0, 0, 0);
  todaySlot.setUTCHours(todaySlot.getUTCHours() + 1);
  const slot = (start, minutes = 50) => ({
    startTime: start,
    endTime: new Date(start.getTime() + minutes * MIN),
  });
  const groupId = crypto.randomUUID();

  const result = await prisma.$transaction(
    async (tx) => {
      // 1. Clear prior demo rows (keep real panic-button alerts).
      await tx.biometricLog.deleteMany({ where: { userId: S } });
      await tx.moodLog.deleteMany({ where: { userId: S } });
      await tx.message.deleteMany({
        where: { OR: [{ senderId: S, recipientId: C }, { senderId: C, recipientId: S }] },
      });
      await tx.appointment.deleteMany({ where: { studentId: S } });
      await tx.counselorNote.deleteMany({ where: { studentId: S } });
      await tx.counselorChangeRequest.deleteMany({ where: { studentId: S } });
      await tx.alert.deleteMany({ where: { studentId: S, alertType: { not: "PANIC_BUTTON" } } });

      // 2. Student profile: a date of birth makes her a minor, so the parental
      //    consent flow applies. Never overwrite one that's already set.
      if (!student.dateOfBirth) {
        await tx.user.update({ where: { id: S }, data: { dateOfBirth: new Date("2010-04-03T00:00:00Z") } });
      }

      // 3. Linked Fitbit (placeholder credentials — enough for the app to treat
      //    the wearable as connected and read the seeded biometric logs).
      await tx.fitbitCredential.upsert({
        where: { userId: S },
        update: {},
        create: {
          userId: S,
          fitbitUserId: "DEMO-OLIVIA-WILSON",
          accessToken: "demo-access-token-not-a-real-fitbit-token",
          refreshToken: "demo-refresh-token-not-a-real-fitbit-token",
          expiresAt: new Date(NOW + 30 * DAY),
          scope: "activity heartrate sleep profile",
          tokenType: "Bearer",
        },
      });

      // 4. Biometrics + mood journal
      const biometrics = buildBiometricLogs(S);
      await tx.biometricLog.createMany({ data: biometrics });
      const moods = buildMoodLogs(S);
      await tx.moodLog.createMany({ data: moods });

      // 5. Counselor weekly hours (Mon-Fri; Thursday late) — only if none set.
      const hoursSet = await tx.counselorAvailability.count({ where: { counselorId: C } });
      if (hoursSet === 0) {
        await tx.counselorAvailability.createMany({
          data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            counselorId: C,
            dayOfWeek,
            startTime: "09:00",
            endTime: dayOfWeek === 4 ? "19:00" : "17:00",
          })),
        });
      }

      // 6. Appointments in every status the UI knows about
      const appts = [
        { ...slot(weekday(at(9, 10, 0))), status: "COMPLETED", reason: "Intro session — settling into term", notes: "Rapport established. Fortnightly check-ins agreed." },
        { ...slot(weekday(at(6, 11, 0))), status: "CANCELLED", reason: "Student-initiated booking", notes: null },
        { ...slot(weekday(at(3, 14, 0))), status: "COMPLETED", reason: "Exam anxiety and sleep", notes: "Taught 4-7-8 breathing and 5-4-3-2-1 grounding." },
        { ...slot(todaySlot), status: "CONFIRMED", reason: "Pre-mock exam check-in", notes: null },
        { ...slot(weekday(at(-3, 15, 0))), status: "PENDING", reason: "Student-initiated booking", notes: null },
        ...[
          weekday(at(-5, 9, 30)),
          weekday(at(-6, 13, 0)),
          weekday(at(-7, 15, 30)),
        ].map((start) => ({ ...slot(start), status: "OPTION", groupId, reason: "Post-mocks debrief", notes: null })),
      ].map((a) => ({ studentId: S, counselorId: C, ...a }));
      await tx.appointment.createMany({ data: appts });

      // 7. Alerts (a mix of open and resolved, all severities)
      const alerts = [
        { alertType: "STRESS_HIGH", severity: "HIGH", message: `${name}'s stress level is elevated at 68/100.`, isResolved: false, notes: null, timestamp: ago(10 * MIN) },
        { alertType: "HEART_RATE_HIGH", severity: "HIGH", message: `${name}'s heart rate is elevated at 104 bpm.`, isResolved: true, notes: "Checked in by message; settled after breathing exercise.", timestamp: at(2, 15, 46) },
        { alertType: "MOOD_CRITICAL", severity: "CRITICAL", message: `${name} has logged negative mood (LOW) 3 times in a row — wellbeing check recommended.`, isResolved: true, notes: "Session held the same afternoon.", timestamp: at(3, 18, 46) },
        { alertType: "MOOD_LOW", severity: "MODERATE", message: `${name} logged a low mood: LOW.`, isResolved: true, notes: null, timestamp: at(5, 19, 31) },
      ].map((a) => ({ studentId: S, counselorId: C, createdAt: a.timestamp, ...a }));
      await tx.alert.createMany({ data: alerts });

      // 8. Counselor <-> student messages (last one is unread by the student)
      const msgs = [
        [C, S, at(3, 14, 40), true,  "Hi Olivia, thanks for coming in today. Remember the 4-7-8 breathing we practised — try it before bed and before your mock exams."],
        [S, C, at(3, 15, 5),  true,  "Thank you Mr. Reed. I'll try it tonight."],
        [S, C, at(2, 16, 20), true,  "I had a really bad moment before maths today. My heart was racing and I felt dizzy."],
        [C, S, at(2, 16, 34), true,  "I'm sorry that happened, Olivia — thank you for telling me. Are you feeling safe and okay right now?"],
        [S, C, at(2, 16, 41), true,  "A bit better now. I went to the library and sat quietly."],
        [C, S, at(2, 16, 52), true,  "That was a good call. Let's book a session before your mocks so we can plan for exam days. I'll send you a few times."],
        [S, C, at(1, 19, 10), true,  "The breathing exercise helped a bit last night. Still only slept about 5 hours though."],
        [C, S, at(1, 19, 32), true,  "Good progress! For sleep: screens off 30 minutes earlier and write tomorrow's worries in a notebook before bed."],
        [S, C, ago(95 * MIN), true,  "Mock exams start tomorrow and I'm really nervous."],
        [C, S, ago(40 * MIN), false, "You're more prepared than you think. Have a look at the session times I proposed and pick one that works. I'm here if you need me."],
      ].map(([senderId, recipientId, createdAt, isRead, content]) => ({ senderId, recipientId, createdAt, isRead, content }));
      await tx.message.createMany({ data: msgs });

      // 9. Private counselor notes
      const notes = [
        [at(9, 11, 0),  "Intake: 16, Year 11. Adjusting well to the term; sleeping ~7h. No safeguarding concerns. Enjoys netball. Agreed to fortnightly check-ins."],
        [at(3, 15, 0),  "Presenting with exam-related anxiety, sleeping ~5-6h. Physical symptoms (racing heart, dizziness) before maths. Taught 4-7-8 breathing and grounding. Follow up within a week."],
        [at(2, 17, 0),  "Panic episode reported by message after maths; settled independently in the library. Wearable HR peaked ~104 bpm. Plan: propose sessions around mocks; monitor sleep and mood trend."],
      ].map(([createdAt, content]) => ({ counselorId: C, studentId: S, createdAt, content }));
      await tx.counselorNote.createMany({ data: notes });

      // 10. A resolved counselor-change request (profile screen history)
      await tx.counselorChangeRequest.create({
        data: {
          studentId: S,
          currentCounselorId: C,
          reason: "I'd like a counselor with evening availability because of netball practice after school.",
          status: "DENIED",
          adminNote: "Mr. Reed now offers Thursday evening slots — please try those first. You can submit a new request any time.",
          resolvedById: orgAdmin?.id ?? null,
          resolvedAt: ago(9 * DAY),
          createdAt: ago(10 * DAY),
        },
      });

      // 11. Consent (student privacy toggles + parental consent granted)
      await tx.consent.upsert({
        where: { userId: S },
        update: { consentGiven: true, anonymizeData: false, parentalConsentGiven: true },
        create: { userId: S, consentGiven: true, anonymizeData: false, parentalConsentGiven: true },
      });

      // 12. Parent/guardian (passwordless; signs in with an emailed code)
      const parent = await tx.user.upsert({
        where: { email: PARENT.email },
        update: {},
        create: { ...PARENT, passwordHash: null, orgId: student.orgId, roleId: parentRole.id },
      });
      await tx.parentStudentRelationship.upsert({
        where: { parentId_studentId: { parentId: parent.id, studentId: S } },
        update: {},
        create: { parentId: parent.id, studentId: S },
      });
      await tx.parentConsentToken.deleteMany({ where: { studentId: S, parentId: parent.id } });
      await tx.parentConsentToken.create({
        data: {
          tokenHash: crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex"),
          studentId: S,
          parentId: parent.id,
          decision: "GRANTED",
          createdAt: ago(9 * DAY),
          usedAt: ago(9 * DAY - 2 * HOUR),
          expiresAt: new Date(NOW - 9 * DAY + 7 * DAY),
        },
      });

      return {
        biometricLogs: biometrics.length,
        moodLogs: moods.length,
        appointments: appts.length,
        alerts: alerts.length,
        messages: msgs.length,
        counselorNotes: notes.length,
        parent: parent.email,
      };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );

  console.log(`✨ Done. Student: ${student.email} | Counselor: ${counselor.email}`);
  console.table(result);
}

main()
  .catch((err) => { console.error("❌ Demo seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
