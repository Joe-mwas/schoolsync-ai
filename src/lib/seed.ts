import { hashPassword } from "./password.ts";
import type { Database } from "./types.ts";

/** Password shared by every demo account. */
export const DEMO_PASSWORD = "schoolsync";

export function seedDatabase(): Database {
  const pw = hashPassword(DEMO_PASSWORD);
  const now = Date.now();
  const iso = (offsetDays: number) => new Date(now + offsetDays * 86_400_000).toISOString();

  return {
    users: [
      { id: "u-director", name: "Grace Wanjiru", email: "director@schoolsync.test", role: "director", passwordHash: pw, phone: "+254700000001", classIds: [], childIds: [] },
      { id: "u-teacher1", name: "Peter Otieno", email: "teacher@schoolsync.test", role: "teacher", passwordHash: pw, phone: "+254700000002", classIds: ["c-grade7"], childIds: [] },
      { id: "u-teacher2", name: "Mary Akinyi", email: "teacher2@schoolsync.test", role: "teacher", passwordHash: pw, phone: "+254700000003", classIds: ["c-grade8"], childIds: [] },
      { id: "u-student1", name: "Brian Kamau", email: "student@schoolsync.test", role: "student", passwordHash: pw, classIds: ["c-grade7"], childIds: [] },
      { id: "u-student2", name: "Faith Njeri", email: "student2@schoolsync.test", role: "student", passwordHash: pw, classIds: ["c-grade8"], childIds: [] },
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
  };
}
