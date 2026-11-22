import type {
  ChecklistItem,
  CompletionRule,
  Exercise,
  ExerciseRun,
  Goal,
  Metric,
  MetricValue,
} from "../db/types";

// ---------- Dates & formatting ----------

/** Local calendar day as YYYY-MM-DD. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = parseDateKey(dateKey(b)).getTime() - parseDateKey(dateKey(a)).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatMinutes(min: number): string {
  if (min > 0 && min < 0.5) return "< 1 min";
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(r).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Formats a metric value; time metrics are stored in minutes. */
export function formatMetricValue(metric: Pick<Metric, "kind" | "unit">, v: number): string {
  if (metric.kind === "time") return formatMinutes(v);
  return metric.unit ? `${formatNumber(v)} ${metric.unit}` : formatNumber(v);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

// ---------- Metrics ----------

export type ValuesByRun = Map<number, MetricValue[]>;

export function groupValuesByRun(values: MetricValue[]): ValuesByRun {
  const map: ValuesByRun = new Map();
  for (const v of values) {
    const list = map.get(v.run_id);
    if (list) list.push(v);
    else map.set(v.run_id, [v]);
  }
  return map;
}

/** Values of one metric in run order (oldest first). */
export function metricSeries(
  metric: Metric,
  runs: ExerciseRun[],
  byRun: ValuesByRun,
): { run: ExerciseRun; value: number }[] {
  const out: { run: ExerciseRun; value: number }[] = [];
  const sorted = [...runs].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const run of sorted) {
    const v = byRun.get(run.id)?.find((x) => x.metric_id === metric.id);
    if (v) out.push({ run, value: v.value });
  }
  return out;
}

export function isLowerBetter(metric: Metric): boolean {
  if (metric.aggregation === "min") return true;
  return (
    metric.start_value != null &&
    metric.target_value != null &&
    metric.target_value < metric.start_value
  );
}

export function aggregateMetric(
  metric: Metric,
  runs: ExerciseRun[],
  byRun: ValuesByRun,
): number | null {
  const series = metricSeries(metric, runs, byRun).map((s) => s.value);
  if (series.length === 0) return null;
  switch (metric.aggregation) {
    case "sum":
      return series.reduce((a, b) => a + b, 0);
    case "max":
      return Math.max(...series);
    case "min":
      return Math.min(...series);
    default:
      return series[series.length - 1];
  }
}

/** How far `current` is from the metric's start value towards `target` (0–1). */
export function fractionTowards(metric: Metric, current: number | null, target: number | null) {
  if (current == null || target == null) return 0;
  const start = metric.start_value;
  const lower = metric.aggregation === "min" || (start != null && target < start);
  // Without a start value, "lower is better" has no reference point to measure from.
  if (lower && start == null) return current <= target ? 1 : 0;
  const from = start ?? 0;
  if (target === from) return meets(current, target, lower) ? 1 : 0;
  return clamp01((current - from) / (target - from));
}

const meets = (value: number, threshold: number, lower: boolean) =>
  lower ? value <= threshold : value >= threshold;

// ---------- Completion rules ----------

export interface ExerciseContext {
  exercise: Exercise;
  metrics: Metric[];
  rules: CompletionRule[];
  checklist: ChecklistItem[];
  runs: ExerciseRun[];
  byRun: ValuesByRun;
  today: Date;
}

export interface RuleResult {
  rule: CompletionRule;
  met: boolean;
  progress: number;
  /** e.g. "104 / 140 BPM" */
  label: string;
}

export function totalMinutes(runs: ExerciseRun[]): number {
  return runs.reduce((a, r) => a + r.duration_sec, 0) / 60;
}

export function practiceDays(runs: ExerciseRun[]): Set<string> {
  return new Set(runs.map((r) => dateKey(new Date(r.started_at))));
}

export function evaluateRule(rule: CompletionRule, ctx: ExerciseContext): RuleResult {
  const none = (label: string): RuleResult => ({ rule, met: false, progress: 0, label });
  switch (rule.type) {
    case "metric": {
      const metric = ctx.metrics.find((m) => m.id === rule.metric_id);
      if (!metric || rule.threshold == null) return none("Messwert fehlt");
      const fmt = (v: number) => formatMetricValue(metric, v);
      if (metric.aggregation === "sum") {
        const total = aggregateMetric(metric, ctx.runs, ctx.byRun) ?? 0;
        return {
          rule,
          met: total >= rule.threshold,
          progress: rule.threshold > 0 ? clamp01(total / rule.threshold) : 1,
          label: `${fmt(total)} / ${fmt(rule.threshold)}`,
        };
      }
      const lower = isLowerBetter(metric);
      const series = metricSeries(metric, ctx.runs, ctx.byRun);
      const hits = series.filter((s) => meets(s.value, rule.threshold!, lower)).length;
      const required = Math.max(1, rule.required_count);
      const best = aggregateMetric(
        { ...metric, aggregation: lower ? "min" : "max" },
        ctx.runs,
        ctx.byRun,
      );
      const met = hits >= required;
      const progress = met
        ? 1
        : hits > 0
          ? hits / required
          : fractionTowards(metric, best, rule.threshold) * (1 / required);
      const current = best == null ? "–" : fmt(best);
      const count = required > 1 ? ` (${hits}/${required}×)` : "";
      return { rule, met, progress, label: `${current} / ${fmt(rule.threshold)}${count}` };
    }
    case "total_time": {
      if (rule.threshold == null) return none("Zielzeit fehlt");
      const min = totalMinutes(ctx.runs);
      return {
        rule,
        met: min >= rule.threshold,
        progress: rule.threshold > 0 ? clamp01(min / rule.threshold) : 1,
        label: `${formatMinutes(min)} / ${formatMinutes(rule.threshold)}`,
      };
    }
    case "days": {
      const target = Math.max(1, rule.threshold ?? 1);
      const days = practiceDays(ctx.runs).size;
      return {
        rule,
        met: days >= target,
        progress: clamp01(days / target),
        label: `${days} / ${target} Tage`,
      };
    }
    case "sessions": {
      const target = Math.max(1, rule.threshold ?? 1);
      const n = ctx.runs.length;
      return {
        rule,
        met: n >= target,
        progress: clamp01(n / target),
        label: `${n} / ${target} Durchgänge`,
      };
    }
    case "date": {
      if (!rule.date) return none("Datum fehlt");
      const end = parseDateKey(rule.date);
      const start = new Date(ctx.exercise.created_at);
      const total = Math.max(1, daysBetween(start, end));
      const left = daysBetween(ctx.today, end);
      return {
        rule,
        met: left <= 0,
        progress: clamp01(1 - left / total),
        label: left <= 0 ? "Datum erreicht" : `noch ${left} Tage`,
      };
    }
    case "checklist": {
      const total = ctx.checklist.length;
      const done = ctx.checklist.filter((c) => c.done_at).length;
      return {
        rule,
        met: total > 0 && done === total,
        progress: total > 0 ? done / total : 0,
        label: `${done} / ${total} erledigt`,
      };
    }
  }
}

export interface CompletionResult {
  /** true once any rule is met (rules are combined with OR) */
  complete: boolean;
  progress: number;
  results: RuleResult[];
}

export function evaluateCompletion(ctx: ExerciseContext): CompletionResult {
  const results = ctx.rules.map((r) => evaluateRule(r, ctx));
  return {
    complete: results.some((r) => r.met),
    progress: results.reduce((a, r) => Math.max(a, r.progress), 0),
    results,
  };
}

// ---------- Goals ----------

export interface GoalResult {
  progress: number;
  label: string;
  done: boolean;
}

export function evaluateGoal(
  goal: Goal,
  opts: {
    exercise?: Exercise;
    metric?: Metric;
    runs: ExerciseRun[];
    byRun: ValuesByRun;
    completion?: CompletionResult;
  },
): GoalResult {
  if (goal.status === "done") return { progress: 1, label: "Erreicht", done: true };
  switch (goal.kind) {
    case "metric": {
      const m = opts.metric;
      if (!m || goal.target_value == null) return { progress: 0, label: "–", done: false };
      const cur = aggregateMetric(m, opts.runs, opts.byRun);
      const progress = fractionTowards(m, cur, goal.target_value);
      const lower = isLowerBetter(m) || (m.start_value != null && goal.target_value < m.start_value);
      const done = cur != null && meets(cur, goal.target_value, lower);
      return {
        progress: done ? 1 : progress,
        label: `${cur == null ? "–" : formatMetricValue(m, cur)} / ${formatMetricValue(m, goal.target_value)}`,
        done,
      };
    }
    case "total_time": {
      if (goal.target_value == null) return { progress: 0, label: "–", done: false };
      const min = totalMinutes(opts.runs);
      return {
        progress: goal.target_value > 0 ? clamp01(min / goal.target_value) : 1,
        label: `${formatMinutes(min)} / ${formatMinutes(goal.target_value)}`,
        done: min >= goal.target_value,
      };
    }
    case "exercise_done": {
      const ex = opts.exercise;
      if (!ex) return { progress: 0, label: "Übung fehlt", done: false };
      if (ex.status === "archived" || opts.completion?.complete) return { progress: 1, label: "Übung abgeschlossen", done: true };
      const p = opts.completion?.progress ?? 0;
      return { progress: p, label: `${Math.round(p * 100)} %`, done: false };
    }
    default:
      return { progress: 0, label: "Offen", done: false };
  }
}

export type DeadlineState = "none" | "done" | "overdue" | "soon" | "ok";

export function deadlineState(
  deadline: string | null,
  done: boolean,
  today: Date,
): { state: DeadlineState; daysLeft: number | null } {
  if (done) return { state: "done", daysLeft: null };
  if (!deadline) return { state: "none", daysLeft: null };
  const left = daysBetween(today, parseDateKey(deadline));
  if (left < 0) return { state: "overdue", daysLeft: left };
  if (left <= 7) return { state: "soon", daysLeft: left };
  return { state: "ok", daysLeft: left };
}

// ---------- Streaks ----------

/** Consecutive practice days ending today (or yesterday, if today is still open). */
export function currentStreak(days: Set<string>, today: Date): number {
  const d = new Date(today);
  if (!days.has(dateKey(d))) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (days.has(dateKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function minutesSince(runs: ExerciseRun[], since: Date): number {
  return totalMinutes(runs.filter((r) => new Date(r.started_at) >= since));
}
