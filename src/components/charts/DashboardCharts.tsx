"use client";

import type { ClassLevels, ClassMoney, ExamPoint, MonthTotal } from "@/lib/charts";
import { ChartCard, ColumnChart, LineChart, StackedBars, type LegendItem } from "./Charts";

export interface DashboardChartData {
  currency: string;
  months?: MonthTotal[];
  byClass?: ClassMoney[];
  trend?: ExamPoint[];
  levels?: { exam: string | null; classes: ClassLevels[] };
}

const LEVELS: (LegendItem & { key: "EE" | "ME" | "AE" | "BE" })[] = [
  { key: "EE", label: "Exceeding", color: "var(--lvl-ee)" },
  { key: "ME", label: "Meeting", color: "var(--lvl-me)" },
  { key: "AE", label: "Approaching", color: "var(--lvl-ae)" },
  { key: "BE", label: "Below", color: "var(--lvl-be)" },
];

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <section className="card viz">
      <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{title}</h2>
      <p className="muted small" style={{ margin: 0 }}>{text}</p>
    </section>
  );
}

/** The charts on a leader's dashboard: only the ones passed in are shown. */
export default function DashboardCharts({ currency, months, byClass, trend, levels }: DashboardChartData) {
  const money = (v: number) => `${currency} ${Math.round(v).toLocaleString("en-US")}`;
  const cards: React.ReactNode[] = [];

  if (trend) {
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const delta = last && prev ? last.meeting - prev.meeting : null;
    cards.push(
      trend.length === 0 ? (
        <Empty key="trend" title="School performance" text="Appears once results are recorded on the Results page." />
      ) : (
        <ChartCard
          key="trend"
          title="School performance"
          subtitle="Share of results at Meeting or Exceeding Expectations, exam by exam"
          headline={{
            value: `${last.meeting}%`,
            label: delta === null ? last.exam : `${delta > 0 ? "▲" : delta < 0 ? "▼" : "■"} ${Math.abs(delta)} pts vs ${prev.exam}`,
          }}
          table={{ columns: ["Exam", "Meeting or exceeding", "Learners"], rows: trend.map((t) => [t.exam, `${t.meeting}%`, String(t.learners)]) }}
        >
          <LineChart data={trend.map((t) => ({ label: t.exam, value: t.meeting }))} detail={(i) => `${trend[i].learners} learners`} />
        </ChartCard>
      ),
    );
  }

  if (levels) {
    cards.push(
      levels.classes.length === 0 ? (
        <Empty key="levels" title="Performance by class" text="Appears once results are recorded on the Results page." />
      ) : (
        <ChartCard
          key="levels"
          title="Performance by class"
          subtitle={`${levels.exam}: how each class's results spread across the CBC levels`}
          legend={LEVELS}
          table={{
            columns: ["Class", ...LEVELS.map((l) => l.label), "Meeting or exceeding"],
            rows: levels.classes.map((c) => [c.className, ...LEVELS.map((l) => String(c.counts[l.key])), `${c.total ? Math.round(((c.counts.EE + c.counts.ME) / c.total) * 100) : 0}%`]),
          }}
        >
          <StackedBars
            percent
            rows={levels.classes.map((c) => ({ label: c.className, values: LEVELS.map((l) => c.counts[l.key]) }))}
            series={LEVELS}
            format={(v) => `${v} result${v === 1 ? "" : "s"}`}
            endLabel={(r) => {
              const c = levels.classes[r];
              return `${c.total ? Math.round(((c.counts.EE + c.counts.ME) / c.total) * 100) : 0}%`;
            }}
          />
          <p className="viz-sub" style={{ marginTop: -4 }}>The figure at the end of each bar is the share meeting or exceeding expectations.</p>
        </ChartCard>
      ),
    );
  }

  if (months) {
    const total = months.reduce((s, m) => s + m.amount, 0);
    cards.push(
      total === 0 ? (
        <Empty key="months" title="Fees collected" text="Appears once payments are recorded on the Fees page or arrive by M-Pesa." />
      ) : (
        <ChartCard
          key="months"
          title="Fees collected"
          subtitle="Payments received each month, last 12 months"
          headline={{ value: money(total), label: "in the last 12 months" }}
          table={{ columns: ["Month", "Collected", "Payments"], rows: months.map((m) => [m.month, money(m.amount), String(m.payments)]) }}
        >
          <ColumnChart data={months.map((m) => ({ label: m.label, value: m.amount }))} format={money} detail={(i) => `${months[i].payments} payment${months[i].payments === 1 ? "" : "s"}`} />
        </ChartCard>
      ),
    );
  }

  if (byClass) {
    const owed = byClass.reduce((s, c) => s + c.outstanding, 0);
    const paid = byClass.reduce((s, c) => s + c.paid, 0);
    const series: LegendItem[] = [
      { label: "Paid", color: "var(--viz-1)" },
      { label: "Still owed", color: "var(--viz-2)" },
    ];
    cards.push(
      byClass.length === 0 ? (
        <Empty key="byClass" title="Fees by class" text="Appears once term fees are set on the Fees page." />
      ) : (
        <ChartCard
          key="byClass"
          title="Fees by class"
          subtitle="What each class has paid and still owes, all terms"
          headline={{ value: money(owed), label: `still owed · ${paid + owed ? Math.round((paid / (paid + owed)) * 100) : 0}% collected` }}
          legend={series}
          table={{ columns: ["Class", "Paid", "Still owed", "Learners"], rows: byClass.map((c) => [c.className, money(c.paid), money(c.outstanding), String(c.learners)]) }}
        >
          <StackedBars
            rows={byClass.map((c) => ({ label: c.className, values: [c.paid, c.outstanding] }))}
            series={series}
            format={money}
            endLabel={(r) => {
              const c = byClass[r];
              return `${c.paid + c.outstanding ? Math.round((c.paid / (c.paid + c.outstanding)) * 100) : 0}%`;
            }}
          />
          <p className="viz-sub" style={{ marginTop: -4 }}>The figure at the end of each bar is the share of that class&apos;s fees collected.</p>
        </ChartCard>
      ),
    );
  }

  if (cards.length === 0) return null;
  return <div className="viz-grid-2">{cards}</div>;
}
