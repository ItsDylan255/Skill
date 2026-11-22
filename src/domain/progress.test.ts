import { describe, expect, it } from "vitest";
import type { CompletionRule, Exercise, ExerciseRun, Goal, Metric, MetricValue } from "../db/types";
import {
  currentStreak,
  deadlineState,
  evaluateCompletion,
  evaluateGoal,
  evaluateRule,
  fractionTowards,
  formatClock,
  formatMinutes,
  groupValuesByRun,
  type ExerciseContext,
} from "./progress";

const exercise: Exercise = {
  id: 1,
  hobby_id: 1,
  category_ids: [],
  name: "Alternate Picking",
  description: "",
  status: "active",
  successor_id: null,
  position: 0,
  tools: [],
  default_bpm: null,
  countdown_min: null,
  metronome_bpm: null,
  metronome_measure: null,
  metronome_subdivision: null,
  kind: "practice",
  difficulty: null,
  created_at: "2026-10-01T10:00:00.000Z",
  completed_at: null,
};

const bpm: Metric = {
  id: 10,
  exercise_id: 1,
  name: "BPM",
  unit: "BPM",
  kind: "number",
  aggregation: "max",
  start_value: 80,
  target_value: 140,
  position: 0,
};

function run(id: number, day: string, minutes: number): ExerciseRun {
  return {
    id,
    session_id: id,
    exercise_id: 1,
    started_at: `${day}T18:00:00`,
    duration_sec: minutes * 60,
  };
}

function rule(p: Partial<CompletionRule>): CompletionRule {
  return {
    id: 1,
    exercise_id: 1,
    type: "metric",
    metric_id: null,
    threshold: null,
    required_count: 1,
    date: null,
    ...p,
  };
}

function ctx(
  runs: ExerciseRun[],
  values: MetricValue[],
  rules: CompletionRule[],
  metrics: Metric[] = [bpm],
): ExerciseContext {
  return {
    exercise,
    metrics,
    rules,
    checklist: [],
    runs,
    byRun: groupValuesByRun(values),
    today: new Date(2026, 10, 1),
  };
}

const val = (id: number, runId: number, metricId: number, value: number): MetricValue => ({
  id,
  run_id: runId,
  metric_id: metricId,
  value,
});

describe("metric rules", () => {
  const runs = [run(1, "2026-10-20", 10), run(2, "2026-10-21", 10), run(3, "2026-10-22", 10)];
  const values = [val(1, 1, 10, 120), val(2, 2, 10, 140), val(3, 3, 10, 138)];

  it("is met once the threshold is hit", () => {
    const r = evaluateRule(rule({ metric_id: 10, threshold: 140 }), ctx(runs, values, []));
    expect(r.met).toBe(true);
    expect(r.progress).toBe(1);
  });

  it("needs the threshold hit several times when required_count > 1", () => {
    const r = evaluateRule(
      rule({ metric_id: 10, threshold: 140, required_count: 3 }),
      ctx(runs, values, []),
    );
    expect(r.met).toBe(false);
    expect(r.progress).toBeCloseTo(1 / 3);
    expect(r.label).toContain("1/3");
  });

  it("measures progress from the start value when not yet hit", () => {
    const r = evaluateRule(rule({ metric_id: 10, threshold: 160 }), ctx(runs, values, []));
    // best 140, start 80, target 160 → 60 / 80
    expect(r.progress).toBeCloseTo(0.75);
  });

  it("sums time metrics (immersion hours)", () => {
    const immersion: Metric = {
      ...bpm,
      id: 11,
      name: "Immersion",
      kind: "time",
      aggregation: "sum",
      start_value: null,
      target_value: 9000,
    };
    const v = [val(1, 1, 11, 4000), val(2, 2, 11, 3000)];
    const r = evaluateRule(rule({ metric_id: 11, threshold: 9000 }), ctx(runs, v, [], [immersion]));
    expect(r.met).toBe(false);
    expect(r.progress).toBeCloseTo(7000 / 9000);
    expect(r.label).toBe("116 h 40 min / 150 h");
  });
});

describe("other rules", () => {
  const runs = [run(1, "2026-10-20", 30), run(2, "2026-10-20", 30), run(3, "2026-10-21", 40)];

  it("counts total time", () => {
    const r = evaluateRule(rule({ type: "total_time", threshold: 120 }), ctx(runs, [], []));
    expect(r.met).toBe(false);
    expect(r.progress).toBeCloseTo(100 / 120);
  });

  it("counts distinct days", () => {
    const r = evaluateRule(rule({ type: "days", threshold: 2 }), ctx(runs, [], []));
    expect(r.met).toBe(true);
    expect(r.label).toBe("2 / 2 Tage");
  });

  it("combines rules with OR", () => {
    const c = evaluateCompletion(
      ctx(runs, [], [
        rule({ id: 1, type: "total_time", threshold: 1000 }),
        rule({ id: 2, type: "sessions", threshold: 3 }),
      ]),
    );
    expect(c.complete).toBe(true);
  });

  it("is never complete without rules", () => {
    expect(evaluateCompletion(ctx(runs, [], [])).complete).toBe(false);
  });
});

describe("lower-is-better metrics", () => {
  it("measures progress downwards", () => {
    const errors: Metric = { ...bpm, aggregation: "min", start_value: 10, target_value: 0 };
    expect(fractionTowards(errors, 5, 0)).toBeCloseTo(0.5);
    expect(fractionTowards(errors, 0, 0)).toBe(1);
  });
});

describe("goals", () => {
  const goal: Goal = {
    id: 1,
    hobby_id: 1,
    phase_id: null,
    position: 0,
    name: "140 BPM",
    description: "",
    deadline: "2026-12-31",
    kind: "metric",
    exercise_id: 1,
    metric_id: 10,
    target_value: 140,
    status: "open",
    completed_at: null,
  };

  it("reads progress from the linked metric", () => {
    const runs = [run(1, "2026-10-20", 10)];
    const r = evaluateGoal(goal, {
      metric: bpm,
      runs,
      byRun: groupValuesByRun([val(1, 1, 10, 110)]),
    });
    expect(r.progress).toBeCloseTo(0.5);
    expect(r.done).toBe(false);
  });

  it("flags deadlines", () => {
    const today = new Date(2026, 11, 28);
    expect(deadlineState("2026-12-31", false, today)).toEqual({ state: "soon", daysLeft: 3 });
    expect(deadlineState("2026-12-01", false, today).state).toBe("overdue");
    expect(deadlineState("2026-12-01", true, today).state).toBe("done");
  });
});

describe("helpers", () => {
  it("formats durations", () => {
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(0.2)).toBe("< 1 min");
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
  });

  it("computes streaks ending today or yesterday", () => {
    const days = new Set(["2026-10-29", "2026-10-30", "2026-10-31"]);
    expect(currentStreak(days, new Date(2026, 10, 1))).toBe(3);
    expect(currentStreak(days, new Date(2026, 10, 3))).toBe(0);
  });
});
