export const ROLES = ["admin", "director", "headteacher", "secretary", "teacher", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];

/*
 * Chain of command: administrator (system owner) → director → headteacher
 * (education) → secretary (office) → teacher. Each group below names who
 * may do one kind of thing.
 */

/** The system owner (the administrator / IT): Setup, AI Review, Admin AI, backups. */
export const ADMINS: Role[] = ["admin"];
/** School leadership: sees and decides across the school. */
export const LEADERS: Role[] = ["admin", "director"];
/** Add and manage accounts and classes: the headteacher only teachers, learners and parents (see canManageRole). */
export const PEOPLE_MANAGERS: Role[] = ["admin", "headteacher"];
/** Record fees and payments, school facts. */
export const OFFICE: Role[] = ["admin", "director", "secretary"];
/** See fees and balances (the headteacher can't change them). */
export const FEE_VIEWERS: Role[] = ["admin", "director", "headteacher", "secretary"];
/** Whole-school view: any class, school-wide announcements, events, the WhatsApp inbox, the brief. */
export const SCHOOL_WIDE: Role[] = ["admin", "director", "headteacher", "secretary"];
/** Assign duties to teachers. */
export const DUTY_MANAGERS: Role[] = ["admin", "headteacher"];
/** See every duty (the director follows them without assigning). */
export const DUTY_VIEWERS: Role[] = ["admin", "director", "headteacher"];
/** Read and answer parents in the WhatsApp inbox. */
export const WHATSAPP_INBOX: Role[] = ["admin", "headteacher", "secretary"];
/** Design posters. */
export const POSTER_MAKERS: Role[] = ["admin", "headteacher", "secretary", "teacher"];
/** Can publish announcements and open the Results page. */
export const STAFF: Role[] = ["admin", "director", "headteacher", "secretary", "teacher"];
/** Set assignments and revision work: teachers for their own classes, the headteacher and administrator for any class. */
export const ASSIGNMENT_SETTERS: Role[] = ["admin", "headteacher", "teacher"];
/** Who announcements can be addressed to. */
export const AUDIENCE_ROLES: Role[] = ["teacher", "parent", "student"];

export const isLeader = (role: Role): boolean => role === "admin" || role === "director";
export const isOffice = (role: Role): boolean => OFFICE.includes(role);
export const isSchoolWide = (role: Role): boolean => SCHOOL_WIDE.includes(role);

/** Which accounts each role may add, edit or remove. */
export function canManageRole(actor: Role, target: Role | string): boolean {
  if (actor === "admin") return true;
  // The director runs the school but doesn't administer accounts (the administrator does).
  if (actor === "headteacher") return target === "teacher" || target === "student" || target === "parent";
  return false;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
  phone?: string;
  /** Classes a teacher teaches or a student attends. */
  classIds: string[];
  /** For parents: the student user ids they are responsible for. */
  childIds: string[];
  /** Set for accounts created or reset by a director; cleared once the user picks their own password. */
  mustChangePassword?: boolean;
  /** Incremented on password change/reset to sign out existing sessions. */
  sessionVersion?: number;
  /** When this leader last received a brief (the default start of the next one). */
  lastBriefAt?: string | null;
  /** Learners: the school's admission number, used as the M-Pesa account number. */
  admissionNo?: string | null;
  /** Director and headteacher: the Nairobi date (YYYY-MM-DD) the last automatic morning brief went out. */
  morningBriefDate?: string | null;
  /** Staff: two-step sign-in with an authenticator app. */
  twoStep?: TwoStep | null;
  /** A two-step key shown during setup, kept until the first code confirms it. */
  twoStepPending?: { secret: string; createdAt: string } | null;
}

export interface TwoStep {
  /** The authenticator app's key (base32). */
  secret: string;
  enabledAt: string;
  /** SHA-256 hashes of the unused one-time backup codes. */
  backupCodes: string[];
  /** The last 30-second step a code was accepted for, so a code works only once. */
  lastStep?: number;
}

export type PublicUser = Omit<User, "passwordHash" | "sessionVersion" | "twoStep" | "twoStepPending">;

export interface SchoolClass {
  id: string;
  name: string;
  teacherId: string | null;
}

export type Priority = "normal" | "urgent";

export interface Announcement {
  id: string;
  title: string;
  body: string;
  /** Roles that should see this announcement. */
  audience: Role[];
  /** Restrict to one class; null means school-wide. */
  classId: string | null;
  priority: Priority;
  authorId: string;
  createdAt: string;
  posterId: string | null;
  whatsappSentAt: string | null;
}

export interface SchoolEvent {
  id: string;
  title: string;
  date: string;
  description: string;
}

export interface PosterDesign {
  template: string;
  title: string;
  subtitle: string;
  body: string;
  footer: string;
  background: string;
  accent: string;
  textColor: string;
}

export interface Poster {
  id: string;
  name: string;
  design: PosterDesign;
  authorId: string;
  createdAt: string;
}

export interface WhatsAppMessage {
  id: string;
  direction: "outbound" | "inbound";
  phone: string;
  userId: string | null;
  body: string;
  status: "sent" | "delivered" | "read" | "simulated" | "failed" | "received";
  error: string | null;
  announcementId: string | null;
  createdAt: string;
  /** How an outbound message was sent: free text, an approved template or a picture. */
  kind?: "text" | "template" | "image";
  /** For a picture: the school fact whose picture was sent (the body is its caption). */
  factId?: string | null;
  /** Why the school sent it, for messages the school starts. */
  purpose?: "fee-reminder" | "receipt" | "morning-brief" | "forwarded-question" | "duty" | "password-help" | null;
  /** Meta's message id (wamid), used to match delivery receipts. */
  providerMessageId?: string | null;
}

export type AiChannel = "assistant" | "whatsapp" | "draft" | "brief";

/** One question to the AI and its answer, kept so the administrator can review them. */
export interface AiLogEntry {
  id: string;
  channel: AiChannel;
  userId: string | null;
  question: string;
  answer: string;
  createdAt: string;
  flagged?: boolean;
  note?: string | null;
  reviewedAt?: string | null;
  /** Set when this answer was corrected with a school fact. */
  factId?: string | null;
}

/** One CBC learning-area level for one learner in one exam/assessment. */
export interface ResultEntry {
  id: string;
  studentId: string;
  exam: string;
  area: string;
  /** EE, ME, AE or BE, optionally with a sub-level (EE1, EE2, …). */
  level: string;
  /** Marks scored, when the assessment is marked out of a number (the level is worked out from them). */
  score?: number | null;
  updatedAt: string;
  updatedBy: string | null;
}

export const ASSESSMENT_TYPES = {
  quiz: "Quiz / CAT / test",
  opener: "Opener exam",
  midterm: "Mid-term exam",
  endterm: "End-term exam",
  other: "Other assessment",
} as const;
export type AssessmentType = keyof typeof ASSESSMENT_TYPES;

/** What kind of assessment an exam name is, and whether it's marked out of a number. */
export interface ExamInfo {
  name: string;
  type: AssessmentType;
  /** e.g. 20 for a quiz marked out of 20; null when levels are entered directly. */
  outOf: number | null;
  updatedAt: string;
}

/** The teacher's overall comment for one learner in one exam. */
export interface ResultComment {
  studentId: string;
  exam: string;
  comment: string;
  updatedAt: string;
}

export type FeeSource = "manual" | "class-charge" | "import" | "mpesa";

/** A fee charge or payment on a learner's statement (amounts in whole shillings). */
export interface FeeEntry {
  id: string;
  studentId: string;
  term: string;
  kind: "charge" | "payment";
  amount: number;
  date: string;
  reference: string | null;
  note: string | null;
  source: FeeSource;
  createdBy: string | null;
  createdAt: string;
}

export const FACT_TOPICS = [
  "Fees and payments",
  "Uniform",
  "Term dates",
  "School hours",
  "Contacts",
  "Transport",
  "Meals",
  "Policies",
  "Other",
] as const;
export type FactTopic = (typeof FACT_TOPICS)[number];

/** Something the school has confirmed; the AI treats it as the truth. */
export interface FactImage {
  /** File name inside the images folder next to the database. */
  file: string;
  type: "image/jpeg" | "image/png";
  size: number;
}

export interface SchoolFact {
  id: string;
  topic: FactTopic;
  title: string;
  details: string;
  /** "staff" facts are never shown to parents or learners. */
  visibleTo: "everyone" | "staff";
  /** Optional picture (e.g. the uniform), sent on WhatsApp when someone asks to see it. */
  image?: FactImage | null;
  /** The AI Review entry this fact corrected, if any. */
  fromAiLogId: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export interface Database {
  users: User[];
  classes: SchoolClass[];
  announcements: Announcement[];
  events: SchoolEvent[];
  posters: Poster[];
  whatsappMessages: WhatsAppMessage[];
  aiLogs: AiLogEntry[];
  results: ResultEntry[];
  resultComments: ResultComment[];
  exams: ExamInfo[];
  fees: FeeEntry[];
  facts: SchoolFact[];
  mpesaPayments: MpesaPayment[];
  adminActions: AdminAction[];
  featureRequests: FeatureRequest[];
  forwardedQuestions: ForwardedQuestion[];
  duties: Duty[];
  assignments: Assignment[];
  passwordHelp: PasswordHelpRequest[];
  /** The school's own details and logo, filled in during onboarding (Setup). */
  profile: SchoolProfile;
  documents: SchoolDocument[];
  /** The latest AI insights for each dashboard view, reused until the figures change. */
  insights: Partial<Record<InsightScope, SavedInsights>>;
  aiSettings: AiSettings;
  security: SecuritySettings;
  /** Who did what, newest last (capped). */
  activity: ActivityEntry[];
}

/** Choices for signing staff out after a while without activity, in minutes. */
export const IDLE_CHOICES = [15, 30, 60, 120] as const;

export interface SecuritySettings {
  /** Every staff account must use two-step sign-in. */
  requireTwoStep: boolean;
  /** Staff are signed out after this many minutes without activity. */
  idleMinutes: number;
}

export const ACTIVITY_KINDS = {
  signin: "Sign-ins",
  security: "Security",
  people: "People",
  fees: "Fees",
  results: "Results",
  data: "Data & backups",
  messages: "Messages",
  settings: "Settings",
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;

export interface ActivityEntry {
  id: string;
  at: string;
  /** Who did it; null for a stranger (e.g. a failed sign-in to an unknown account). */
  userId: string | null;
  name: string;
  role: Role | null;
  kind: ActivityKind;
  action: string;
  detail: string;
  ip?: string;
}

/** Which Claude model answers parents and learners (staff always get the top model). */
export type FamilyModel = "economy" | "balanced" | "top";

export interface AiSettings {
  familyModel: FamilyModel;
}

/** Which figures a dashboard shows: all (director, administrator), performance (headteacher), money (secretary). */
export type InsightScope = "all" | "performance" | "money";

export interface Insights {
  goingWell: string[];
  needsAttention: string[];
  nextSteps: string[];
}

export interface SavedInsights extends Insights {
  /** A fingerprint of the figures the AI read, so a change in the figures makes them stale. */
  factsKey: string;
  generatedAt: string;
}

export interface SchoolProfile {
  name: string;
  motto: string;
  website: string;
  phone: string;
  email: string;
  address: string;
  logo: FactImage | null;
  updatedAt: string | null;
}

export const DOCUMENT_CATEGORIES = {
  instructions: "Instructions from the director or principal",
  students: "Student and parent lists",
  fees: "Fees and finance",
  policies: "Policies and rules",
  other: "Other",
} as const;
export type DocumentCategory = keyof typeof DOCUMENT_CATEGORIES;

/** A file the school handed over during onboarding (stored encrypted when DATA_ENCRYPTION_KEY is set). */
export interface SchoolDocument {
  id: string;
  title: string;
  category: DocumentCategory;
  fileName: string;
  /** What the file is, e.g. "PDF", "Excel", "Word". */
  kind: string;
  size: number;
  /** Name of the stored file in the documents folder. */
  storedAs: string;
  note: string;
  uploadedBy: string;
  uploadedAt: string;
}

/** Someone who forgot their password asked, from the sign-in page, for a new one. */
export interface PasswordHelpRequest {
  id: string;
  /** What they typed: their email or phone, the role they picked, their name and an optional note. */
  contact: string;
  role: Role | null;
  name: string;
  note: string;
  /** The account those details match, if any (never told to the person asking). */
  userId: string | null;
  status: "open" | "reset" | "dismissed";
  createdAt: string;
  handledAt: string | null;
  handledBy: string | null;
}

/** Homework or revision material a teacher sets for one or more classes. */
export interface Assignment {
  id: string;
  /** "assignment" has a due date and is marked done; "revision" is notes or practice to revise from. */
  kind: "assignment" | "revision";
  title: string;
  /** Learning area, e.g. Mathematics. */
  subject: string;
  details: string;
  classIds: string[];
  /** YYYY-MM-DD, assignments only. */
  dueDate: string | null;
  /** Optional web link (a worksheet, video, past paper). */
  link: string | null;
  createdBy: string;
  createdAt: string;
  /** Learners who have marked it done. */
  doneBy: string[];
}

/** A duty the headteacher (or director) gives one or more teachers, e.g. "Duty teacher this week". */
export interface Duty {
  id: string;
  title: string;
  details: string;
  teacherIds: string[];
  /** Optional dates (YYYY-MM-DD). */
  startDate: string | null;
  endDate: string | null;
  status: "open" | "done";
  createdBy: string;
  createdAt: string;
  doneAt: string | null;
  doneBy: string | null;
}

/** A system question a director asked the School AI, passed to the administrator. */
export interface ForwardedQuestion {
  id: string;
  fromId: string;
  fromName: string;
  question: string;
  /** What the AI understood, for context. */
  details: string;
  status: "open" | "answered";
  createdAt: string;
  answeredAt: string | null;
}

/** Changes the admin AI can propose; each runs only when the administrator approves it. */
export type AdminActionKind = "update_person" | "reset_password" | "unlock_sign_in" | "match_payment" | "resend_message";

export interface AdminAction {
  id: string;
  kind: AdminActionKind;
  /** The proposal as the AI made it (validated again when approved). */
  input: Record<string, unknown>;
  /** One line for the approval card, e.g. "Change James Kamau's phone to +254712345678". */
  summary: string;
  /** Why the AI proposes it. */
  reason: string;
  status: "pending" | "approved" | "rejected" | "failed";
  /** What happened when it ran (never contains passwords). */
  result: string | null;
  proposedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

/** A new feature the administrator wants, written up by the admin AI. */
export interface FeatureRequest {
  id: string;
  title: string;
  problem: string;
  proposal: string;
  status: "new" | "sent" | "done";
  createdAt: string;
  createdBy: string;
}

/** How an M-Pesa payment was linked to a learner. */
export type MpesaMatch = "admission" | "name" | "phone" | "manual";

/** One M-Pesa payment to the school's Paybill, as Safaricom reported it. */
export interface MpesaPayment {
  id: string;
  /** M-Pesa receipt number, e.g. QJK3ABC123 (unique). */
  transId: string;
  amount: number;
  /** What the payer typed as the account number. */
  account: string;
  payerName: string;
  /** As Safaricom sends it (often masked). */
  phone: string;
  /** When the payment was made (from Safaricom). */
  paidAt: string;
  receivedAt: string;
  status: "recorded" | "unmatched" | "ignored";
  studentId: string | null;
  feeEntryId: string | null;
  matchedBy: MpesaMatch | null;
  /** True for payments entered with the test form. */
  test?: boolean;
}
