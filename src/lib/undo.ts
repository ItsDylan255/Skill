import type { HobbyData } from "../db/types";
import { toast } from "../components/ui";
import { invalidate } from "./store";

/*
 * Delete with "Rückgängig" instead of asking first: the item disappears at once,
 * a toast offers to bring it back, and only when the toast runs out is it really deleted.
 * Closing the app in those seconds keeps the item (the safe side).
 */

export type UndoKind = "exercise" | "routine" | "topic" | "knowledge_base" | "item" | "goal";

const UNDO_MS = 6000;
const pending: Record<UndoKind, Set<number>> = {
  exercise: new Set(),
  routine: new Set(),
  topic: new Set(),
  knowledge_base: new Set(),
  item: new Set(),
  goal: new Set(),
};

export function deleteWithUndo(kind: UndoKind, id: number, label: string, run: () => Promise<unknown>) {
  pending[kind].add(id);
  invalidate();
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    try {
      await run();
    } finally {
      pending[kind].delete(id);
      invalidate();
    }
  }, UNDO_MS);
  toast(`„${label || "Ohne Titel"}“ gelöscht`, {
    duration: UNDO_MS,
    action: {
      label: "Rückgängig",
      onClick: () => {
        undone = true;
        clearTimeout(timer);
        pending[kind].delete(id);
        invalidate();
      },
    },
  });
}

/** Hides everything that is waiting to be deleted, including what belongs to it. */
export function hidePending(data: HobbyData): HobbyData {
  const p = pending;
  if (Object.values(p).every((s) => s.size === 0)) return data;
  const exercises = data.exercises.filter((e) => !p.exercise.has(e.id));
  const exerciseIds = new Set(exercises.map((e) => e.id));
  const runs = data.runs.filter((r) => exerciseIds.has(r.exercise_id));
  const runIds = new Set(runs.map((r) => r.id));
  const routines = data.routines.filter((r) => !p.routine.has(r.id));
  const routineIds = new Set(routines.map((r) => r.id));
  const knowledgeBases = data.knowledgeBases.filter((k) => !p.knowledge_base.has(k.id));
  const baseIds = new Set(knowledgeBases.map((k) => k.id));
  // a topic goes with its plan and with every topic above it
  const byId = new Map(data.topics.map((t) => [t.id, t]));
  const hidden = (id: number | null): boolean => {
    if (id == null) return false;
    const t = byId.get(id);
    return !t || p.topic.has(id) || !baseIds.has(t.base_id) || hidden(t.parent_id);
  };
  return {
    ...data,
    exercises,
    runs,
    values: data.values.filter((v) => runIds.has(v.run_id)),
    routines,
    routineItems: data.routineItems.filter((i) => routineIds.has(i.routine_id) && exerciseIds.has(i.exercise_id)),
    knowledgeBases,
    topics: data.topics.filter((t) => !hidden(t.id)),
    items: data.items.filter((i) => !p.item.has(i.id)),
    goals: data.goals.filter((g) => !p.goal.has(g.id)),
  };
}
