export const ROLES = ["director", "teacher", "parent", "student"] as const;
export type Role = (typeof ROLES)[number];

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
}

export type PublicUser = Omit<User, "passwordHash">;

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

export interface Database {
  users: User[];
  classes: SchoolClass[];
  announcements: Announcement[];
  events: SchoolEvent[];
  posters: Poster[];
  whatsappMessages: WhatsAppMessage[];
}
