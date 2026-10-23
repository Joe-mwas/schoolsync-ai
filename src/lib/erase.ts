import { HttpError } from "./errors.ts";
import { emptyProfile } from "./migrate.ts";
import type { Database, User } from "./types.ts";

/**
 * Erase everything the school put into the portal, to start again or reuse
 * it for another school: people (except the administrator doing it),
 * classes, fees, results, messages, posters, documents and the school's
 * details and logo. Settings (AI, security), the activity log's record of
 * this, and the backups stay. Document and logo files are left on disk
 * (encrypted, unreachable without the data), so restoring the "Before
 * erase" backup brings them back too.
 */
export function eraseSchool(db: Database, admin: User): { people: number; classes: number } {
  if (admin.role !== "admin") throw new HttpError(403, "Only the administrator can erase the school's data");
  const me = db.users.find((u) => u.id === admin.id);
  if (!me) throw new HttpError(404, "Account not found");
  const counts = { people: db.users.length - 1, classes: db.classes.length };

  me.classIds = [];
  me.childIds = [];
  db.users = [me];
  db.classes = [];
  db.announcements = [];
  db.events = [];
  db.posters = [];
  db.whatsappMessages = [];
  db.aiLogs = [];
  db.results = [];
  db.resultComments = [];
  db.exams = [];
  db.fees = [];
  db.facts = [];
  db.mpesaPayments = [];
  db.adminActions = [];
  db.featureRequests = [];
  db.forwardedQuestions = [];
  db.duties = [];
  db.assignments = [];
  db.passwordHelp = [];
  db.documents = [];
  db.profile = emptyProfile();
  db.insights = {};
  db.activity = [];
  db.push.subscriptions = db.push.subscriptions.filter((s) => s.userId === me.id);
  return counts;
}
