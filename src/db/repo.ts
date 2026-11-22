import { getDb, type Param } from "./client";
import type {
  Attachment,
  Category,
  ChecklistItem,
  CompletionRule,
  Exercise,
  ExerciseRun,
  Goal,
  Hobby,
  HobbyData,
  Item,
  KnowledgeBase,
  Link,
  Metric,
  MetricValue,
  Note,
  Phase,
  Routine,
  RoutineItem,
  Session,
  SongSection,
  Topic,
} from "./types";

type Row = Record<string, Param | undefined>;

const nowIso = () => new Date().toISOString();

function columns(obj: Row) {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
  for (const k of keys) if (!/^[a-z_]+$/.test(k)) throw new Error(`Bad column ${k}`);
  return keys;
}

async function insert(table: string, obj: Row): Promise<number> {
  const db = await getDb();
  const keys = columns(obj);
  return db.execute(
    `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`,
    keys.map((k) => obj[k] as Param),
  );
}

async function update(table: string, id: number, patch: Row) {
  const keys = columns(patch);
  if (keys.length === 0) return;
  const db = await getDb();
  await db.execute(
    `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    [...keys.map((k) => patch[k] as Param), id],
  );
}

async function remove(table: string, id: number) {
  const db = await getDb();
  await db.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

// ---------- Hobbies ----------

export async function listHobbies(): Promise<Hobby[]> {
  const db = await getDb();
  return db.select<Hobby>("SELECT * FROM hobby ORDER BY position, created_at");
}

export const createHobby = (h: Pick<Hobby, "name" | "color" | "icon">) =>
  insert("hobby", {
    ...h,
    // songs are switched on per hobby in the settings
    hidden_tabs: JSON.stringify(["songs"]),
    position: Math.floor(Date.now() / 1000),
    created_at: nowIso(),
  });
export const updateHobby = (id: number, p: Partial<Hobby>) => update("hobby", id, p);
export const deleteHobby = (id: number) => remove("hobby", id);

export async function loadHobbyData(hobbyId: number): Promise<HobbyData | null> {
  const db = await getDb();
  const [hobby] = await db.select<Hobby>("SELECT * FROM hobby WHERE id = ?", [hobbyId]);
  if (!hobby) return null;

  const byHobby = <T,>(table: string, order = "id") =>
    db.select<T>(`SELECT * FROM ${table} WHERE hobby_id = ? ORDER BY ${order}`, [hobbyId]);
  const byExercise = <T,>(table: string, order = "id") =>
    db.select<T>(
      `SELECT t.* FROM ${table} t JOIN exercise e ON e.id = t.exercise_id
       WHERE e.hobby_id = ? ORDER BY t.${order}`,
      [hobbyId],
    );

  const [
    categories,
    phases,
    rawExercises,
    links,
    attachments,
    checklist,
    metrics,
    rules,
    routines,
    routineItems,
    sessions,
    runs,
    values,
    notes,
    goals,
  ] = await Promise.all([
    byHobby<Category>("category", "name"),
    byHobby<Phase>("phase", "position, id"),
    byHobby<Omit<Exercise, "tools"> & { tools: string }>("exercise", "position, id"),
    byExercise<Link>("link"),
    byExercise<Attachment>("attachment"),
    byExercise<ChecklistItem>("checklist_item", "position"),
    byExercise<Metric>("metric", "position"),
    byExercise<CompletionRule>("completion_rule"),
    byHobby<Routine>("routine", "position, id"),
    db.select<RoutineItem>(
      `SELECT ri.* FROM routine_item ri JOIN routine r ON r.id = ri.routine_id
       WHERE r.hobby_id = ? ORDER BY ri.position`,
      [hobbyId],
    ),
    byHobby<Session>("session", "started_at"),
    db.select<ExerciseRun>(
      `SELECT er.* FROM exercise_run er JOIN session s ON s.id = er.session_id
       WHERE s.hobby_id = ? ORDER BY er.started_at`,
      [hobbyId],
    ),
    db.select<MetricValue>(
      `SELECT mv.* FROM metric_value mv
       JOIN exercise_run er ON er.id = mv.run_id
       JOIN session s ON s.id = er.session_id
       WHERE s.hobby_id = ?`,
      [hobbyId],
    ),
    byExercise<Note>("note", "created_at"),
    byHobby<Goal>("goal", "position, id"),
  ]);
  const [knowledgeBases, topics, exerciseCategories, rawItems, itemCategories, songSections] = await Promise.all([
    byHobby<KnowledgeBase>("knowledge_base", "position, id"),
    db.select<Topic>(
      `SELECT t.* FROM topic t JOIN knowledge_base kb ON kb.id = t.base_id
       WHERE kb.hobby_id = ? ORDER BY t.position, t.id`,
      [hobbyId],
    ),
    db.select<{ exercise_id: number; category_id: number }>(
      `SELECT ec.* FROM exercise_category ec JOIN exercise e ON e.id = ec.exercise_id
       JOIN category c ON c.id = ec.category_id
       WHERE e.hobby_id = ? ORDER BY c.name`,
      [hobbyId],
    ),
    byHobby<Omit<Item, "category_ids">>("item", "position, id"),
    db.select<{ item_id: number; category_id: number }>(
      `SELECT ic.* FROM item_category ic JOIN item i ON i.id = ic.item_id
       JOIN category c ON c.id = ic.category_id
       WHERE i.hobby_id = ? ORDER BY c.name`,
      [hobbyId],
    ),
    byExercise<SongSection>("song_section", "position"),
  ]);
  const items: Item[] = rawItems.map((i) => ({
    ...i,
    category_ids: itemCategories.filter((c) => c.item_id === i.id).map((c) => c.category_id),
  }));

  const exercises: Exercise[] = rawExercises.map((e) => {
    let tools: Exercise["tools"] = [];
    try {
      tools = JSON.parse(e.tools);
    } catch {
      tools = [];
    }
    const category_ids = exerciseCategories.filter((c) => c.exercise_id === e.id).map((c) => c.category_id);
    return { ...e, tools, category_ids };
  });

  return {
    hobby,
    categories,
    phases,
    exercises,
    links,
    attachments,
    checklist,
    metrics,
    rules,
    routines,
    routineItems,
    sessions,
    runs,
    values,
    notes,
    goals,
    knowledgeBases,
    topics,
    items,
    songSections,
  };
}

// ---------- Categories & phases ----------

/** Stores a manual order: position = index in `ids`. */
export async function reorder(
  table: "hobby" | "exercise" | "routine" | "goal" | "phase" | "knowledge_base" | "topic" | "routine_item" | "item" | "song_section",
  ids: number[],
) {
  for (let i = 0; i < ids.length; i++) await update(table, ids[i], { position: i });
}

export const createCategory = (c: Omit<Category, "id" | "hidden_in_exercises">) => insert("category", { ...c });
export const updateCategory = (id: number, p: Partial<Category>) => update("category", id, p);
export const deleteCategory = (id: number) => remove("category", id);

export const createPhase = (p: Omit<Phase, "id" | "position"> & { position?: number }) =>
  insert("phase", { ...p, position: p.position ?? Math.floor(Date.now() / 1000) });
export const updatePhase = (id: number, p: Partial<Phase>) => update("phase", id, p);
export const deletePhase = (id: number) => remove("phase", id);

// ---------- Exercises ----------

type ExerciseInput = Partial<Omit<Exercise, "id" | "created_at">>;

function exerciseRow(e: ExerciseInput): Row {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tools, category_ids, ...rest } = e;
  return { ...rest, tools: tools ? JSON.stringify(tools) : undefined };
}

export async function setExerciseCategories(exerciseId: number, ids: number[]) {
  const db = await getDb();
  await db.execute("DELETE FROM exercise_category WHERE exercise_id = ?", [exerciseId]);
  for (const c of new Set(ids))
    await db.execute("INSERT INTO exercise_category (exercise_id, category_id) VALUES (?, ?)", [exerciseId, c]);
}

export async function createExercise(hobbyId: number, e: ExerciseInput & { name: string }) {
  const id = await insert("exercise", {
    position: Math.floor(Date.now() / 1000),
    // the column default is still the old "backlog" status
    status: "active",
    ...exerciseRow(e),
    hobby_id: hobbyId,
    created_at: nowIso(),
  });
  if (e.category_ids?.length) await setExerciseCategories(id, e.category_ids);
  return id;
}
export async function updateExercise(id: number, p: ExerciseInput) {
  await update("exercise", id, exerciseRow(p));
  if (p.category_ids) await setExerciseCategories(id, p.category_ids);
}
export const deleteExercise = (id: number) => remove("exercise", id);

export const addLink = (l: Omit<Link, "id">) => insert("link", { ...l });
export const deleteLink = (id: number) => remove("link", id);

export const addAttachment = (a: Omit<Attachment, "id">) => insert("attachment", { ...a });
export const deleteAttachmentRow = (id: number) => remove("attachment", id);

export const addChecklistItem = (c: Omit<ChecklistItem, "id" | "done_at">) =>
  insert("checklist_item", { ...c });
export const updateChecklistItem = (id: number, p: Partial<ChecklistItem>) =>
  update("checklist_item", id, p);
export const deleteChecklistItem = (id: number) => remove("checklist_item", id);

export const createMetric = (m: Omit<Metric, "id">) => insert("metric", { ...m });
export const updateMetric = (id: number, p: Partial<Metric>) => update("metric", id, p);
export const deleteMetric = (id: number) => remove("metric", id);

export const createRule = (r: Omit<CompletionRule, "id">) => insert("completion_rule", { ...r });
export const updateRule = (id: number, p: Partial<CompletionRule>) =>
  update("completion_rule", id, p);
export const deleteRule = (id: number) => remove("completion_rule", id);

export const createSongSection = (p: Omit<SongSection, "id">) => insert("song_section", { ...p });
export const updateSongSection = (id: number, p: Partial<SongSection>) => update("song_section", id, p);
export const deleteSongSection = (id: number) => remove("song_section", id);

/** Inserts a copy of a row (without its id), with some columns changed. */
async function copyRow(table: string, row: Row, patch: Row): Promise<number> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id, ...rest } = row;
  return insert(table, { ...rest, ...patch });
}

/** Copies an exercise or song with its setup (metrics, criteria, links, files, parts), not its history. */
export async function duplicateExercise(exerciseId: number): Promise<number> {
  const db = await getDb();
  const [e] = await db.select<Row>("SELECT * FROM exercise WHERE id = ?", [exerciseId]);
  const id = await copyRow("exercise", e, {
    name: `${e.name} (Kopie)`,
    status: "active",
    completed_at: null,
    position: Number(e.position) + 0.5,
    created_at: nowIso(),
  });
  await db.execute(
    "INSERT INTO exercise_category (exercise_id, category_id) SELECT ?, category_id FROM exercise_category WHERE exercise_id = ?",
    [id, exerciseId],
  );
  const metricIds = new Map<number, number>();
  for (const m of await db.select<Row>("SELECT * FROM metric WHERE exercise_id = ?", [exerciseId]))
    metricIds.set(Number(m.id), await copyRow("metric", m, { exercise_id: id }));
  for (const r of await db.select<Row>("SELECT * FROM completion_rule WHERE exercise_id = ?", [exerciseId]))
    await copyRow("completion_rule", r, { exercise_id: id, metric_id: r.metric_id == null ? null : (metricIds.get(Number(r.metric_id)) ?? null) });
  for (const table of ["link", "attachment", "song_section"])
    for (const r of await db.select<Row>(`SELECT * FROM ${table} WHERE exercise_id = ?`, [exerciseId]))
      await copyRow(table, r, { exercise_id: id });
  return id;
}

// ---------- Routines ----------

export const createRoutine = (r: Omit<Routine, "id" | "position" | "archived_at"> & { position?: number }) =>
  insert("routine", { ...r, position: r.position ?? Math.floor(Date.now() / 1000) });
export const updateRoutine = (id: number, p: Partial<Routine>) => update("routine", id, p);
export const deleteRoutine = (id: number) => remove("routine", id);

export async function duplicateRoutine(routineId: number): Promise<number> {
  const db = await getDb();
  const [r] = await db.select<Row>("SELECT * FROM routine WHERE id = ?", [routineId]);
  const id = await copyRow("routine", r, { name: `${r.name} (Kopie)`, archived_at: null, position: Number(r.position) + 0.5 });
  for (const i of await db.select<Row>("SELECT * FROM routine_item WHERE routine_id = ?", [routineId]))
    await copyRow("routine_item", i, { routine_id: id });
  return id;
}

export const addRoutineItem = (i: Omit<RoutineItem, "id">) => insert("routine_item", { ...i });
export const updateRoutineItem = (id: number, p: Partial<RoutineItem>) =>
  update("routine_item", id, p);
export const deleteRoutineItem = (id: number) => remove("routine_item", id);

export async function reorderRoutineItems(ids: number[]) {
  for (let i = 0; i < ids.length; i++) await update("routine_item", ids[i], { position: i });
}

/** Puts `nextId` in place of `oldId` in every routine that contains the old exercise. */
export async function replaceExerciseInRoutines(oldId: number, nextId: number) {
  const db = await getDb();
  await db.execute("UPDATE routine_item SET exercise_id = ? WHERE exercise_id = ?", [
    nextId,
    oldId,
  ]);
}

// ---------- Sessions ----------

export const startSession = (hobbyId: number, routineId: number | null) =>
  insert("session", { hobby_id: hobbyId, routine_id: routineId, started_at: nowIso() });
export const endSession = (id: number) => update("session", id, { ended_at: nowIso() });
export const deleteSession = (id: number) => remove("session", id);

export async function saveRun(
  sessionId: number,
  exerciseId: number,
  startedAt: string,
  durationSec: number,
  values: { metric_id: number; value: number }[],
): Promise<number> {
  const runId = await insert("exercise_run", {
    session_id: sessionId,
    exercise_id: exerciseId,
    started_at: startedAt,
    duration_sec: Math.round(durationSec),
  });
  for (const v of values) await insert("metric_value", { run_id: runId, ...v });
  return runId;
}

export const deleteRun = (id: number) => remove("exercise_run", id);

/** Practice done outside the app: its own session on that day with one run. */
export async function addManualRun(
  hobbyId: number,
  exerciseId: number,
  startedAt: string,
  durationSec: number,
  values: { metric_id: number; value: number }[],
) {
  const sessionId = await insert("session", {
    hobby_id: hobbyId,
    routine_id: null,
    started_at: startedAt,
    ended_at: new Date(Date.parse(startedAt) + durationSec * 1000).toISOString(),
  });
  return saveRun(sessionId, exerciseId, startedAt, durationSec, values);
}

// ---------- Knowledge ----------

export const createKnowledgeBase = (hobbyId: number, name: string, position: number) =>
  insert("knowledge_base", { hobby_id: hobbyId, name, position, created_at: nowIso() });
export const updateKnowledgeBase = (id: number, p: Partial<KnowledgeBase>) =>
  update("knowledge_base", id, p);
export const deleteKnowledgeBase = (id: number) => remove("knowledge_base", id);

export const createTopic = (t: Pick<Topic, "base_id" | "title" | "position"> & Partial<Topic>) =>
  insert("topic", { ...t, created_at: nowIso() });
export const updateTopic = (id: number, p: Partial<Topic>) => update("topic", id, p);
export const deleteTopic = (id: number) => remove("topic", id);

/** Writes plan, parent and position of every item whose place changed. */
export async function placeTopics(places: Pick<Topic, "id" | "base_id" | "parent_id" | "position">[], current: Topic[]) {
  for (const p of places) {
    const t = current.find((x) => x.id === p.id);
    if (t && t.base_id === p.base_id && t.parent_id === p.parent_id && t.position === p.position) continue;
    await update("topic", p.id, { base_id: p.base_id, parent_id: p.parent_id, position: p.position });
  }
}

// ---------- Notes & goals ----------

export const addNote = (n: Omit<Note, "id" | "created_at">) =>
  insert("note", { ...n, created_at: nowIso() });
export const updateNote = (id: number, text: string) => update("note", id, { text });
export const deleteNote = (id: number) => remove("note", id);

export const createGoal = (g: Omit<Goal, "id" | "completed_at" | "position"> & { position?: number }) =>
  insert("goal", { ...g, position: g.position ?? Math.floor(Date.now() / 1000) });
export const updateGoal = (id: number, p: Partial<Goal>) => update("goal", id, p);
export const deleteGoal = (id: number) => remove("goal", id);

// ---------- One-off items ----------

type ItemInput = Partial<Omit<Item, "id" | "hobby_id" | "created_at">>;

async function setItemCategories(itemId: number, ids: number[]) {
  const db = await getDb();
  await db.execute("DELETE FROM item_category WHERE item_id = ?", [itemId]);
  for (const c of new Set(ids))
    await db.execute("INSERT INTO item_category (item_id, category_id) VALUES (?, ?)", [itemId, c]);
}

export async function createItem(hobbyId: number, i: ItemInput & { title: string }) {
  const { category_ids, ...rest } = i;
  const id = await insert("item", {
    position: Math.floor(Date.now() / 1000),
    ...rest,
    hobby_id: hobbyId,
    created_at: nowIso(),
  });
  if (category_ids?.length) await setItemCategories(id, category_ids);
  return id;
}
export async function updateItem(id: number, p: ItemInput) {
  const { category_ids, ...rest } = p;
  await update("item", id, rest);
  if (category_ids) await setItemCategories(id, category_ids);
}
export const deleteItem = (id: number) => remove("item", id);
