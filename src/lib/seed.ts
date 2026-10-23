import { levelFromPercent } from "./cbc.ts";
import { defaultAiBudget, emptyProfile } from "./migrate.ts";
import { hashPassword } from "./password.ts";
import type { Database } from "./types.ts";

/** Password shared by every demo account. */
export const DEMO_PASSWORD = "schoolsync";

/**
 * An empty school with a single administrator account (the system owner),
 * used for real deployments so no account ships with a publicly known password.
 */
export function seedProductionDatabase(admin: { name: string; email: string; password: string }): Database {
  return {
    users: [
      {
        id: "u-admin",
        name: admin.name,
        email: admin.email.trim().toLowerCase(),
        role: "admin",
        passwordHash: hashPassword(admin.password),
        classIds: [],
        childIds: [],
      },
    ],
    classes: [],
    announcements: [],
    events: [],
    posters: [],
    whatsappMessages: [],
    aiLogs: [],
    results: [],
    resultComments: [],
    fees: [],
    facts: [],
    mpesaPayments: [],
    adminActions: [],
    featureRequests: [],
    forwardedQuestions: [],
    duties: [],
    assignments: [],
    passwordHelp: [],
    profile: emptyProfile(),
    documents: [],
    insights: {},
    aiSettings: { familyModel: "economy" },
    security: { requireTwoStep: false, idleMinutes: 30 },
    activity: [],
    exams: [],
    aiBudget: defaultAiBudget(),
  };
}

/** Demo data is used in development, or in production when SEED_DEMO=1. */
export function initialDatabase(env: NodeJS.ProcessEnv = process.env): Database {
  if (env.NODE_ENV !== "production" || env.SEED_DEMO === "1") return withDemoHistory(seedDatabase());
  const email = env.ADMIN_EMAIL?.trim();
  const password = env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    throw new Error(
      "First production start needs ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) to create the director account, or SEED_DEMO=1 for demo data.",
    );
  }
  return seedProductionDatabase({ name: env.ADMIN_NAME?.trim() || "Administrator", email, password });
}

/** Earlier exams and fully paid earlier terms, so the demo school's dashboard charts show a trend. */
export function withDemoHistory(db: Database): Database {
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString();
  db.results.push(
      ...demoResults("u-student1", { English: "AE", Kiswahili: "BE", Mathematics: "ME", "Integrated Science": "AE", "Social Studies": "ME" }, "Term 1 2026 End-term", -200),
      ...demoResults("u-student2", { English: "ME", Kiswahili: "AE", Mathematics: "BE", "Integrated Science": "BE", "Social Studies": "AE" }, "Term 1 2026 End-term", -200),
      ...demoResults("u-student1", { English: "ME", Kiswahili: "AE", Mathematics: "ME", "Integrated Science": "ME", "Social Studies": "AE" }, "Term 2 2026 End-term", -90),
      ...demoResults("u-student2", { English: "ME", Kiswahili: "ME", Mathematics: "AE", "Integrated Science": "AE", "Social Studies": "ME" }, "Term 2 2026 End-term", -90),
  );
  // A short quiz marked out of 20, so families see marks as well as levels.
  const quiz = "Maths & Science CAT 2";
  db.exams.push({ name: quiz, type: "quiz", outOf: 20, updatedAt: iso(-20) });
  for (const [sid, maths, science] of [["u-student1", 16, 12], ["u-student2", 9, 13]] as const) {
    for (const [area, score] of [["Mathematics", maths], ["Integrated Science", science]] as const) {
      db.results.push({ id: `r-cat-${sid}-${area.length}`, studentId: sid, exam: quiz, area, level: levelFromPercent((score / 20) * 100), score, updatedAt: iso(-20), updatedBy: "u-teacher1" });
    }
  }
  db.fees.push(
      ...[["u-student1", "f-t1"], ["u-student2", "f-t2"]].flatMap(([sid, p]) => [
        { ...demoFee(`${p}-c`, sid, "charge", 14000, iso(-200), null), term: "Term 2 2026" },
        { ...demoFee(`${p}-1`, sid, "payment", 5000, iso(-170), null), term: "Term 2 2026" },
        { ...demoFee(`${p}-2`, sid, "payment", 4000, iso(-140), null), term: "Term 2 2026" },
        { ...demoFee(`${p}-3`, sid, "payment", 3000, iso(-110), null), term: "Term 2 2026" },
        { ...demoFee(`${p}-4`, sid, "payment", 2000, iso(-75), null), term: "Term 2 2026" },
      ]),
  );
  return db;
}

export function seedDatabase(): Database {
  const pw = hashPassword(DEMO_PASSWORD);
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString();

  return {
    users: [
      { id: "u-admin", name: "System Administrator", email: "admin@schoolsync.test", role: "admin", passwordHash: pw, classIds: [], childIds: [] },
      { id: "u-director", name: "Grace Wanjiru", email: "director@schoolsync.test", role: "director", passwordHash: pw, phone: "+254700000001", classIds: [], childIds: [] },
      { id: "u-headteacher", name: "Samuel Mutiso", email: "headteacher@schoolsync.test", role: "headteacher", passwordHash: pw, phone: "+254700000007", classIds: [], childIds: [] },
      { id: "u-secretary", name: "Mary Achieng", email: "secretary@schoolsync.test", role: "secretary", passwordHash: pw, phone: "+254700000006", classIds: [], childIds: [] },
      { id: "u-teacher1", name: "Peter Otieno", email: "teacher@schoolsync.test", role: "teacher", passwordHash: pw, phone: "+254700000002", classIds: ["c-grade7"], childIds: [] },
      { id: "u-teacher2", name: "Mary Akinyi", email: "teacher2@schoolsync.test", role: "teacher", passwordHash: pw, phone: "+254700000003", classIds: ["c-grade8"], childIds: [] },
      { id: "u-student1", name: "Brian Kamau", email: "student@schoolsync.test", role: "student", passwordHash: pw, classIds: ["c-grade7"], childIds: [], admissionNo: "1001" },
      { id: "u-student2", name: "Faith Njeri", email: "student2@schoolsync.test", role: "student", passwordHash: pw, classIds: ["c-grade8"], childIds: [], admissionNo: "1002" },
      { id: "u-parent1", name: "James Kamau", email: "parent@schoolsync.test", role: "parent", passwordHash: pw, phone: "+254700000004", classIds: [], childIds: ["u-student1"] },
      { id: "u-parent2", name: "Ann Njeri", email: "parent2@schoolsync.test", role: "parent", passwordHash: pw, phone: "+254700000005", classIds: [], childIds: ["u-student2"] },
    ],
    classes: [
      { id: "c-grade7", name: "Grade 7 East", teacherId: "u-teacher1" },
      { id: "c-grade8", name: "Grade 8 West", teacherId: "u-teacher2" },
    ],
    announcements: [
      {
        id: "a-welcome",
        title: "Welcome to Term 3",
        body: "Classes resume on Monday at 7:30 AM. Please ensure all fees are cleared and uniforms are in good condition.",
        audience: ["teacher", "parent", "student"],
        classId: null,
        priority: "normal",
        authorId: "u-director",
        createdAt: iso(-3),
        posterId: null,
        whatsappSentAt: null,
      },
      {
        id: "a-grade7-trip",
        title: "Grade 7 science trip",
        body: "Grade 7 East will visit the National Museum next Friday. Consent forms are due by Wednesday.",
        audience: ["parent", "student"],
        classId: "c-grade7",
        priority: "urgent",
        authorId: "u-teacher1",
        createdAt: iso(-1),
        posterId: null,
        whatsappSentAt: null,
      },
    ],
    events: [
      { id: "e-pta", title: "PTA meeting", date: iso(7).slice(0, 10), description: "Termly parents and teachers meeting in the main hall, 2 PM." },
      { id: "e-sports", title: "Sports day", date: iso(14).slice(0, 10), description: "Inter-house athletics. Students should come in house colours." },
      { id: "e-exams", title: "Mid-term exams begin", date: iso(21).slice(0, 10), description: "Mid-term assessments for all grades run for one week." },
    ],
    posters: [],
    whatsappMessages: [],
    aiLogs: [],
    results: [
      ...demoResults("u-student1", { English: "ME", Kiswahili: "AE", Mathematics: "EE", "Integrated Science": "ME", "Social Studies": "ME" }),
      ...demoResults("u-student2", { English: "EE", Kiswahili: "ME", Mathematics: "AE", "Integrated Science": "BE", "Social Studies": "ME" }),
    ],
    resultComments: [
      { studentId: "u-student1", exam: DEMO_EXAM, comment: "Brian is confident in Mathematics; more Kiswahili reading at home will help.", updatedAt: iso(-2) },
      { studentId: "u-student2", exam: DEMO_EXAM, comment: "Faith expresses herself very well. Needs support in Integrated Science practicals.", updatedAt: iso(-2) },
    ],
    fees: [
      demoFee("f-1", "u-student1", "charge", 15000, iso(-30), null),
      demoFee("f-2", "u-student1", "payment", 10000, iso(-20), "QK7H2LM9XA"),
      demoFee("f-3", "u-student2", "charge", 15000, iso(-30), null),
      demoFee("f-4", "u-student2", "payment", 15000, iso(-25), "QK1B8NN3PZ"),
    ],
    facts: [
      demoFact("fact-fees", "Fees and payments", "How to pay school fees", "Pay by M-Pesa Paybill 247247, account number: the learner's admission number (e.g. 1001). Payments are recorded automatically and you get a WhatsApp receipt. Cash is not accepted at the school. Term 3 2026 fees are Ksh 15,000 for Grades 7 and 8."),
      demoFact("fact-uniform", "Uniform", "School uniform", "Red sweater with the school badge, white shirt, grey trousers or skirt, black shoes. Sports days: house T-shirt and track pants. Uniforms are sold at Sunrise Outfitters, Moi Avenue."),
      demoFact("fact-hours", "School hours", "School day times", "Gates open 7:00 AM. Lessons 7:30 AM to 3:30 PM, Monday to Friday. Clubs and games until 4:30 PM on Wednesdays."),
      demoFact("fact-staff", "Policies", "Staff meetings", "Staff meeting every Monday at 4:00 PM in the staffroom.", "staff"),
    ],
    mpesaPayments: [],
    adminActions: [],
    featureRequests: [],
    forwardedQuestions: [],
    duties: [
      {
        id: "duty-demo",
        title: "Duty teacher this week",
        details: "Morning gate 7:00–7:45 and lunch supervision.",
        teacherIds: ["u-teacher1"],
        startDate: iso(0).slice(0, 10),
        endDate: iso(4).slice(0, 10),
        status: "open",
        createdBy: "u-headteacher",
        createdAt: iso(-1),
        doneAt: null,
        doneBy: null,
      },
    ],
    assignments: [
      {
        id: "as-demo-maths",
        kind: "assignment",
        title: "Fractions worksheet",
        subject: "Mathematics",
        details: "Exercise 4B, questions 1–10 in the Spotlight Maths book. Show your working.",
        classIds: ["c-grade7"],
        dueDate: iso(3).slice(0, 10),
        link: null,
        createdBy: "u-teacher1",
        createdAt: iso(-1),
        doneBy: [],
      },
      {
        id: "as-demo-revision",
        kind: "revision",
        title: "End of term revision: Integrated Science",
        subject: "Integrated Science",
        details: "Revise: the human digestive system, states of matter, and simple machines. Try the end-of-topic questions on pages 42, 67 and 88.",
        classIds: ["c-grade7"],
        dueDate: null,
        link: null,
        createdBy: "u-teacher1",
        createdAt: iso(-2),
        doneBy: [],
      },
    ],
    passwordHelp: [],
    profile: emptyProfile(),
    documents: [],
    insights: {},
    aiSettings: { familyModel: "economy" },
    security: { requireTwoStep: false, idleMinutes: 30 },
    activity: [],
    exams: [],
    aiBudget: defaultAiBudget(),
  };
}

function demoFact(id: string, topic: Database["facts"][number]["topic"], title: string, details: string, visibleTo: "everyone" | "staff" = "everyone"): Database["facts"][number] {
  return { id, topic, title, details, visibleTo, fromAiLogId: null, updatedAt: new Date().toISOString(), updatedBy: null };
}

const DEMO_EXAM = "Term 3 2026 Mid-term";
const DEMO_TERM = "Term 3 2026";

function demoResults(studentId: string, levels: Record<string, string>, exam = DEMO_EXAM, offsetDays = -2): Database["results"] {
  return Object.entries(levels).map(([area, level], i) => ({
    id: exam === DEMO_EXAM ? `r-${studentId}-${i}` : `r-${studentId}-${exam.replace(/\W+/g, "")}-${i}`,
    studentId,
    exam,
    area,
    level,
    updatedAt: new Date(Date.now() + offsetDays * 86_400_000).toISOString(),
    updatedBy: null,
  }));
}

function demoFee(id: string, studentId: string, kind: "charge" | "payment", amount: number, at: string, reference: string | null): Database["fees"][number] {
  return { id, studentId, term: DEMO_TERM, kind, amount, date: at.slice(0, 10), reference, note: null, source: "manual", createdBy: null, createdAt: at };
}
