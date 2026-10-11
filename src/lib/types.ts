export const ROLES = ["admin", "director", "teacher", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];

/** Run the school: everything a director can do. The admin also owns Setup and AI review. */
export const LEADERS: Role[] = ["admin", "director"];
/** Can publish announcements and design posters. */
export const STAFF: Role[] = ["admin", "director", "teacher"];
/** Who announcements can be addressed to. */
export const AUDIENCE_ROLES: Role[] = ["teacher", "parent", "student"];

export const isLeader = (role: Role): boolean => role === "admin" || role === "director";

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
}

export type PublicUser = Omit<User, "passwordHash" | "sessionVersion">;

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
  /** How an outbound message was sent: free text or an approved template. */
  kind?: "text" | "template";
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
  updatedAt: string;
  updatedBy: string | null;
}

/** The teacher's overall comment for one learner in one exam. */
export interface ResultComment {
  studentId: string;
  exam: string;
  comment: string;
  updatedAt: string;
}

export type FeeSource = "manual" | "class-charge" | "import";

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
export interface SchoolFact {
  id: string;
  topic: FactTopic;
  title: string;
  details: string;
  /** "staff" facts are never shown to parents or learners. */
  visibleTo: "everyone" | "staff";
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
  fees: FeeEntry[];
  facts: SchoolFact[];
}
