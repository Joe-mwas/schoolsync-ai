import { baseLevel, type BaseLevel } from "./cbc.ts";
import { feeStatement } from "./fees.ts";
import { examsFor, examPerformance } from "./results.ts";
import type { Database } from "./types.ts";

/** The figures behind the dashboard charts. Pure, so they're easy to test. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface MonthTotal {
  /** YYYY-MM */
  month: string;
  label: string;
  amount: number;
  payments: number;
}

/** Fees collected each month, oldest first, ending with this month (Nairobi time). */
export function monthlyCollections(db: Pick<Database, "fees">, months = 12, now = new Date()): MonthTotal[] {
  const nairobi = new Date(now.getTime() + 3 * 3600_000);
  let y = nairobi.getUTCFullYear();
  let m = nairobi.getUTCMonth();
  const out: MonthTotal[] = [];
  for (let i = 0; i < months; i++) {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    out.unshift({ month: key, label: m === 0 || i === months - 1 ? `${MONTHS[m]} ${String(y).slice(2)}` : MONTHS[m], amount: 0, payments: 0 });
    if (--m < 0) {
      m = 11;
      y--;
    }
  }
  const byKey = new Map(out.map((o) => [o.month, o]));
  for (const f of db.fees) {
    if (f.kind !== "payment") continue;
    const o = byKey.get(f.date.slice(0, 7));
    if (o) {
      o.amount += f.amount;
      o.payments++;
    }
  }
  return out;
}

export interface ClassMoney {
  className: string;
  paid: number;
  outstanding: number;
  learners: number;
}

/** Per class: fees paid so far and still owed (credit balances don't offset others' debts). */
export function feesByClass(db: Pick<Database, "fees" | "users" | "classes">): ClassMoney[] {
  const rows = new Map<string, ClassMoney>();
  for (const s of db.users.filter((u) => u.role === "student")) {
    const cls = db.classes.find((c) => s.classIds.includes(c.id));
    const name = cls?.name ?? "No class";
    const st = feeStatement(db, s.id);
    if (st.entries.length === 0) continue;
    const row = rows.get(name) ?? { className: name, paid: 0, outstanding: 0, learners: 0 };
    row.paid += st.paid;
    row.outstanding += Math.max(0, st.balance);
    row.learners++;
    rows.set(name, row);
  }
  const order = new Map(db.classes.map((c, i) => [c.name, i]));
  return [...rows.values()].sort((a, b) => (order.get(a.className) ?? 999) - (order.get(b.className) ?? 999));
}

export interface ExamPoint {
  exam: string;
  /** Share of all results at Meeting or Exceeding Expectations, 0–100. */
  meeting: number;
  learners: number;
}

/** How the whole school did in each exam, oldest first (the last `limit` exams). */
export function performanceTrend(db: Database, limit = 8): ExamPoint[] {
  return examsFor(db)
    .slice(0, limit)
    .reverse()
    .map((exam) => {
      const rs = db.results.filter((r) => r.exam === exam);
      const good = rs.filter((r) => ["EE", "ME"].includes(baseLevel(r.level))).length;
      return { exam, meeting: rs.length ? Math.round((good / rs.length) * 100) : 0, learners: new Set(rs.map((r) => r.studentId)).size };
    });
}

export interface ClassLevels {
  className: string;
  counts: Record<BaseLevel, number>;
  total: number;
  learners: number;
}

/** Each class's spread of CBC levels in one exam (the latest by default). */
export function classLevels(db: Database, exam = examsFor(db)[0]): { exam: string | null; classes: ClassLevels[] } {
  if (!exam) return { exam: null, classes: [] };
  return {
    exam,
    classes: examPerformance(db, exam).map((p) => ({
      className: p.className,
      counts: p.counts,
      total: p.counts.EE + p.counts.ME + p.counts.AE + p.counts.BE,
      learners: p.learners,
    })),
  };
}
