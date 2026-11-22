import type { Topic } from "../db/types";
import type { OutlineRow } from "./derived";

/** Where an item sits after a change: plan, parent and position (= index in outline order). */
export type Placement = Pick<Topic, "id" | "base_id" | "parent_id" | "position">;

/** Indexes of an item and its nested items in an outline (they follow it with greater depth). */
function subtreeRange(rows: OutlineRow[], index: number) {
  let end = index + 1;
  while (end < rows.length && rows[end].depth > rows[index].depth) end++;
  return [index, end] as const;
}

function placements(rows: OutlineRow[], changed: Map<number, Partial<Placement>>): Placement[] {
  return rows.map((r, i) => ({
    id: r.topic.id,
    base_id: r.topic.base_id,
    parent_id: r.topic.parent_id,
    ...changed.get(r.topic.id),
    position: i,
  }));
}

/**
 * Drag & drop: moves an item with everything below it next to `overId`, as its
 * sibling (and into its plan). Moving down lands after the target's own sub-items.
 */
export function moveItem(rows: OutlineRow[], activeId: number, overId: number): Placement[] | null {
  const from = rows.findIndex((r) => r.topic.id === activeId);
  const overIdx = rows.findIndex((r) => r.topic.id === overId);
  if (from < 0 || overIdx < 0) return null;
  const [s, e] = subtreeRange(rows, from);
  if (overIdx >= s && overIdx < e) return null;
  const moving = rows.slice(s, e);
  const rest = [...rows.slice(0, s), ...rows.slice(e)];
  let at = rest.findIndex((r) => r.topic.id === overId);
  if (overIdx > from) at = subtreeRange(rest, at)[1];
  rest.splice(at, 0, ...moving);
  const over = rows[overIdx].topic;
  const changed = new Map<number, Partial<Placement>>();
  changed.set(activeId, { parent_id: over.parent_id, base_id: over.base_id });
  for (const m of moving.slice(1)) changed.set(m.topic.id, { base_id: over.base_id });
  return placements(rest, changed);
}

/** Makes an item a sub-item of the sibling above it. */
export function indentItem(rows: OutlineRow[], id: number): Placement[] | null {
  const i = rows.findIndex((r) => r.topic.id === id);
  if (i < 0) return null;
  const depth = rows[i].depth;
  for (let j = i - 1; j >= 0 && rows[j].depth >= depth; j--) {
    if (rows[j].depth === depth && rows[j].topic.base_id === rows[i].topic.base_id)
      return placements(rows, new Map([[id, { parent_id: rows[j].topic.id }]]));
  }
  return null;
}

/** Moves a sub-item one level up, right after its former parent. */
export function outdentItem(rows: OutlineRow[], id: number): Placement[] | null {
  const i = rows.findIndex((r) => r.topic.id === id);
  if (i < 0 || rows[i].depth === 0) return null;
  let p = i - 1;
  while (p >= 0 && rows[p].depth >= rows[i].depth) p--;
  if (p < 0) return null;
  const [s, e] = subtreeRange(rows, i);
  const moving = rows.slice(s, e);
  const rest = [...rows.slice(0, s), ...rows.slice(e)];
  const at = subtreeRange(rest, rest.indexOf(rows[p]))[1];
  rest.splice(at, 0, ...moving);
  return placements(rest, new Map([[id, { parent_id: rows[p].topic.parent_id }]]));
}
