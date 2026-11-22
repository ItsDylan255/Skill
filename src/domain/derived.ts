import type { Exercise, HobbyData, Topic } from "../db/types";
import {
  dateKey,
  evaluateCompletion,
  evaluateGoal,
  groupValuesByRun,
  type CompletionResult,
  type ExerciseContext,
  type GoalResult,
  type ValuesByRun,
} from "./progress";

export type OutlineRow = { topic: Topic; depth: number; children: Topic[] };

/** Precomputed lookups for one hobby; build once per render with useMemo. */
export class Derived {
  readonly byRun: ValuesByRun;
  private completionCache = new Map<number, CompletionResult>();

  constructor(
    readonly data: HobbyData,
    readonly today = new Date(),
  ) {
    this.byRun = groupValuesByRun(data.values);
  }

  exercise(id: number | null | undefined) {
    return id == null ? undefined : this.data.exercises.find((e) => e.id === id);
  }

  /** Exercises that are not archived. */
  get active() {
    return this.data.exercises.filter((e) => e.status === "active");
  }

  /** Exercises used in at least one routine: the current plan. */
  get planned() {
    const ids = new Set(this.data.routineItems.map((i) => i.exercise_id));
    return this.active.filter((e) => ids.has(e.id));
  }

  topicsOf(baseId: number) {
    return this.data.topics.filter((t) => t.base_id === baseId);
  }

  /** What to learn next: the first item being learned, else the first one not understood yet. */
  nextTopic(baseId: number) {
    const rows = this.planOutline(baseId);
    return (rows.find((r) => r.topic.stage === "learning") ?? rows.find((r) => !r.topic.done_at))?.topic;
  }

  /** Items of a plan in outline order (depth first), with depth and direct children. */
  planOutline(baseId: number): OutlineRow[] {
    const topics = this.topicsOf(baseId);
    const ids = new Set(topics.map((t) => t.id));
    const kids = new Map<number | null, Topic[]>();
    for (const t of topics) {
      const parent = t.parent_id != null && ids.has(t.parent_id) ? t.parent_id : null;
      const list = kids.get(parent);
      if (list) list.push(t);
      else kids.set(parent, [t]);
    }
    const out: OutlineRow[] = [];
    const walk = (parent: number | null, depth: number) => {
      for (const t of kids.get(parent) ?? []) {
        const children = kids.get(t.id) ?? [];
        out.push({ topic: t, depth, children });
        walk(t.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  }

  /** The item and everything nested below it. */
  subtree(topicId: number): Topic[] {
    const out: Topic[] = [];
    const add = (id: number) => {
      const t = this.data.topics.find((x) => x.id === id);
      if (!t) return;
      out.push(t);
      for (const c of this.data.topics) if (c.parent_id === id) add(c.id);
    };
    add(topicId);
    return out;
  }

  sectionsOf(exerciseId: number) {
    return this.data.songSections.filter((s) => s.exercise_id === exerciseId);
  }

  /** Tempo progress of a song: average over its parts of current / target BPM. */
  songProgress(exerciseId: number) {
    const parts = this.sectionsOf(exerciseId).filter((s) => s.target_bpm);
    if (parts.length === 0) return null;
    const share = (s: (typeof parts)[number]) => Math.min(1, (s.current_bpm ?? 0) / s.target_bpm!);
    return {
      progress: parts.reduce((a, s) => a + share(s), 0) / parts.length,
      done: parts.filter((s) => share(s) >= 1).length,
      total: parts.length,
    };
  }

  lastRun(exerciseId: number) {
    let last: string | undefined;
    for (const r of this.data.runs)
      if (r.exercise_id === exerciseId && (!last || r.started_at > last)) last = r.started_at;
    return last;
  }

  category(id: number | null | undefined) {
    return id == null ? undefined : this.data.categories.find((c) => c.id === id);
  }

  runsOf(exerciseId: number) {
    return this.data.runs.filter((r) => r.exercise_id === exerciseId);
  }

  metricsOf(exerciseId: number) {
    return this.data.metrics.filter((m) => m.exercise_id === exerciseId);
  }

  context(exercise: Exercise): ExerciseContext {
    return {
      exercise,
      metrics: this.metricsOf(exercise.id),
      rules: this.data.rules.filter((r) => r.exercise_id === exercise.id),
      checklist: this.data.checklist.filter((c) => c.exercise_id === exercise.id),
      runs: this.runsOf(exercise.id),
      byRun: this.byRun,
      today: this.today,
    };
  }

  completion(exercise: Exercise): CompletionResult {
    let c = this.completionCache.get(exercise.id);
    if (!c) {
      c = evaluateCompletion(this.context(exercise));
      this.completionCache.set(exercise.id, c);
    }
    return c;
  }

  goal(goalId: number): GoalResult {
    const goal = this.data.goals.find((g) => g.id === goalId)!;
    const exercise = this.exercise(goal.exercise_id);
    return evaluateGoal(goal, {
      exercise,
      metric: this.data.metrics.find((m) => m.id === goal.metric_id),
      runs: goal.exercise_id ? this.runsOf(goal.exercise_id) : [],
      byRun: this.byRun,
      completion: exercise ? this.completion(exercise) : undefined,
    });
  }

  routineItems(routineId: number) {
    return this.data.routineItems
      .filter((i) => i.routine_id === routineId)
      .sort((a, b) => a.position - b.position);
  }

  routinesContaining(exerciseId: number) {
    const ids = new Set(
      this.data.routineItems.filter((i) => i.exercise_id === exerciseId).map((i) => i.routine_id),
    );
    return this.data.routines.filter((r) => ids.has(r.id));
  }

  /** Persistent notes (not bound to a session), newest first. */
  exerciseNotes(exerciseId: number) {
    return this.data.notes
      .filter((n) => n.exercise_id === exerciseId && n.session_id == null)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  /** Session notes grouped by session, newest session first. */
  sessionNotes(exerciseId: number, excludeSession?: number) {
    const notes = this.data.notes.filter(
      (n) => n.exercise_id === exerciseId && n.session_id != null && n.session_id !== excludeSession,
    );
    const groups = new Map<number, typeof notes>();
    for (const n of notes) {
      const g = groups.get(n.session_id!);
      if (g) g.push(n);
      else groups.set(n.session_id!, [n]);
    }
    return [...groups.entries()]
      .map(([sessionId, list]) => ({
        session: this.data.sessions.find((s) => s.id === sessionId),
        notes: list,
      }))
      .sort((a, b) => (b.session?.started_at ?? "").localeCompare(a.session?.started_at ?? ""));
  }

  /** Candidates to follow a finished exercise: successor first, then same category outside any routine. */
  nextCandidates(exercise: Exercise): Exercise[] {
    const successor = this.exercise(exercise.successor_id);
    const inRoutine = new Set(this.data.routineItems.map((i) => i.exercise_id));
    const sameCat = this.active.filter(
      (e) =>
        e.id !== exercise.id &&
        e.id !== successor?.id &&
        !inRoutine.has(e.id) &&
        e.category_ids.some((c) => exercise.category_ids.includes(c)),
    );
    return successor && successor.status === "active" ? [successor, ...sameCat] : sameCat;
  }

  activePhase() {
    const key = dateKey(this.today);
    return this.data.phases.find(
      (p) => (!p.start_date || p.start_date <= key) && (!p.end_date || p.end_date >= key),
    );
  }
}
