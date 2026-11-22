import { getDb } from "./client";
import * as repo from "./repo";
import { dateKey } from "../domain/progress";
import type { ToolType } from "./types";

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

const at = (daysAgo: number, hour: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

async function history(
  hobbyId: number,
  routineId: number,
  daysBack: number,
  entries: { exerciseId: number; minutes: number; metric?: (day: number) => [number, number] }[],
) {
  const db = await getDb();
  for (let day = daysBack; day >= 1; day--) {
    if (day % 6 === 0) continue; // a few rest days
    const sessionId = await db.execute(
      "INSERT INTO session (hobby_id, routine_id, started_at, ended_at) VALUES (?, ?, ?, ?)",
      [hobbyId, routineId, at(day, 18), at(day, 19)],
    );
    for (const e of entries) {
      const run = await repo.saveRun(sessionId, e.exerciseId, at(day, 18), e.minutes * 60, []);
      if (e.metric) {
        const [metricId, value] = e.metric(daysBack - day);
        await db.execute("INSERT INTO metric_value (run_id, metric_id, value) VALUES (?, ?, ?)", [
          run,
          metricId,
          value,
        ]);
      }
    }
  }
}

async function exercise(
  hobbyId: number,
  categoryId: number,
  name: string,
  opts: {
    description?: string;
    tools?: ToolType[];
    bpm?: number;
  } = {},
) {
  return repo.createExercise(hobbyId, {
    name,
    category_ids: [categoryId],
    description: opts.description ?? "",
    tools: opts.tools ?? ["countdown"],
    default_bpm: opts.bpm ?? null,
  });
}

/** Creates a knowledge collection; the first `done` topics are already ticked off. */
async function knowledge(
  hobbyId: number,
  name: string,
  position: number,
  topics: (string | [string, string])[],
  done = 0,
) {
  const base = await repo.createKnowledgeBase(hobbyId, name, position);
  for (let i = 0; i < topics.length; i++) {
    const [title, content] = typeof topics[i] === "string" ? [topics[i] as string, ""] : (topics[i] as [string, string]);
    await repo.createTopic({
      base_id: base,
      title,
      content,
      position: i,
      done_at: i < done ? new Date().toISOString() : null,
      stage: i < done ? "understood" : i === done ? "learning" : "new",
    });
  }
}

/** Creates the two example hobbies (E-Gitarre, Spanisch) with some history. */
export async function seedExamples() {
  // ---------- E-Gitarre ----------
  const g = await repo.createHobby({ name: "E-Gitarre", color: "#f97316", icon: "guitar" });
  const cat = async (name: string, color: string) =>
    repo.createCategory({ hobby_id: g, name, color });
  const picking = await cat("Picking", "#3b82f6");
  const fretting = await cat("Fretting Hand", "#22c55e");
  const musik = await cat("Musikalität", "#eab308");
  const technik = await cat("Technik", "#8b5cf6");
  const repertoire = await cat("Repertoire", "#ec4899");

  const phase = await repo.createPhase({
    hobby_id: g,
    name: "Phase 1 – Technik-Fundament",
    description: "Saubere Grundtechnik in beiden Händen aufbauen.",
    start_date: daysFromNow(-30),
    end_date: daysFromNow(60),
  });

  const stringSkip = await exercise(g, picking, "String Skipping Picking", {
    tools: ["countdown", "metronome"],
    bpm: 80,
  });
  const alt = await exercise(g, picking, "Alternate Picking – 16tel auf einer Saite", {
    description: "Strikter Wechselschlag, Handgelenk locker. Erst sauber, dann schnell.",
    tools: ["countdown", "metronome"],
    bpm: 104,
  });
  await repo.updateExercise(alt, { successor_id: stringSkip });
  const altBpm = await repo.createMetric({
    exercise_id: alt,
    name: "Tempo",
    unit: "BPM",
    kind: "number",
    aggregation: "max",
    start_value: 80,
    target_value: 140,
    position: 0,
  });
  await repo.createRule({
    exercise_id: alt,
    type: "metric",
    metric_id: altBpm,
    threshold: 140,
    required_count: 3,
    date: null,
  });
  await repo.createRule({
    exercise_id: alt,
    type: "days",
    metric_id: null,
    threshold: 45,
    required_count: 1,
    date: null,
  });
  await repo.addNote({ exercise_id: alt, session_id: null, text: "Daumen locker lassen, nicht pressen." });
  await repo.addLink({ exercise_id: alt, url: "https://www.youtube.com", title: "Video-Lektion" });

  const chroma = await exercise(g, fretting, "Chromatik-Permutationen", {
    tools: ["countdown", "metronome"],
  });
  const spider = await exercise(g, fretting, "Spider Walk", {
    description: "1-2-3-4 über alle Saiten, ein Finger pro Bund.",
    tools: ["countdown", "metronome"],
    bpm: 90,
  });
  await repo.updateExercise(spider, { successor_id: chroma });
  const spiderBpm = await repo.createMetric({
    exercise_id: spider,
    name: "Tempo",
    unit: "BPM",
    kind: "number",
    aggregation: "max",
    start_value: 60,
    target_value: 120,
    position: 0,
  });
  await repo.createRule({
    exercise_id: spider,
    type: "metric",
    metric_id: spiderBpm,
    threshold: 120,
    required_count: 3,
    date: null,
  });

  const ear = await exercise(g, musik, "Intervalle hören");
  await repo.createRule({
    exercise_id: ear,
    type: "total_time",
    metric_id: null,
    threshold: 300,
    required_count: 1,
    date: null,
  });

  const legato = await exercise(g, technik, "Legato Hammer-on / Pull-off", {
    tools: ["countdown", "metronome"],
    bpm: 70,
  });
  const legatoBpm = await repo.createMetric({
    exercise_id: legato,
    name: "Tempo",
    unit: "BPM",
    kind: "number",
    aggregation: "max",
    start_value: 60,
    target_value: 110,
    position: 0,
  });
  await repo.createRule({
    exercise_id: legato,
    type: "metric",
    metric_id: legatoBpm,
    threshold: 110,
    required_count: 1,
    date: null,
  });

  const song = await exercise(g, repertoire, "Song: Intro-Riff lernen", { tools: ["countdown"] });
  let pos = 0;
  for (const text of ["Intro-Riff", "Strophe", "Refrain", "Solo-Teil"]) {
    await repo.addChecklistItem({ exercise_id: song, text, position: pos++ });
  }
  await repo.createRule({
    exercise_id: song,
    type: "checklist",
    metric_id: null,
    threshold: null,
    required_count: 1,
    date: null,
  });

  await knowledge(g, "Musiktheorie", 0, [
    "Noten auf dem Griffbrett",
    "Intervalle benennen",
    ["Aufbau der Dur-Tonleiter", "Ganz- und Halbtonschritte: W-W-H-W-W-W-H\n\nIn C, G und F aufschreiben."],
    "Quintenzirkel",
    "Akkordaufbau: Dur, Moll, vermindert",
    "Modes verstehen",
  ], 2);
  await knowledge(g, "Gitarren-Setup", 1, ["Saiten wechseln", "Oktavreinheit einstellen", "Halsspannung"], 1);

  await exercise(g, technik, "Sweep Picking – 3 Saiten", {
    description: "Für später – erst wenn Alternate Picking sitzt.",
  });
  await exercise(g, musik, "Modes über Backing Tracks");

  const routine = await repo.createRoutine({
    hobby_id: g,
    name: "Tägliche Stunde",
    description: "Die Standard-Session für jeden Tag.",
  });
  const items: [number, number][] = [
    [alt, 10],
    [spider, 10],
    [ear, 10],
    [legato, 15],
    [song, 15],
  ];
  for (let i = 0; i < items.length; i++) {
    await repo.addRoutineItem({
      routine_id: routine,
      exercise_id: items[i][0],
      position: i,
      duration_min: items[i][1],
    });
  }

  await repo.createGoal({
    hobby_id: g,
    phase_id: phase,
    name: "Alternate Picking mit 140 BPM",
    description: "16tel, sauber, drei Mal hintereinander.",
    deadline: daysFromNow(90),
    kind: "metric",
    exercise_id: alt,
    metric_id: altBpm,
    target_value: 140,
    status: "open",
  });
  await repo.createGoal({
    hobby_id: g,
    phase_id: phase,
    name: "Ersten Song komplett spielen",
    description: "",
    deadline: daysFromNow(5),
    kind: "exercise_done",
    exercise_id: song,
    metric_id: null,
    target_value: null,
    status: "open",
  });

  await history(g, routine, 24, [
    { exerciseId: alt, minutes: 10, metric: (n) => [altBpm, 84 + n] },
    { exerciseId: spider, minutes: 10, metric: (n) => [spiderBpm, 62 + Math.round(n * 1.2)] },
    { exerciseId: ear, minutes: 10 },
    { exerciseId: legato, minutes: 15, metric: (n) => [legatoBpm, 60 + Math.round(n / 2)] },
  ]);

  // ---------- Spanisch ----------
  const s = await repo.createHobby({ name: "Spanisch", color: "#ef4444", icon: "languages" });
  const imm = await repo.createCategory({ hobby_id: s, name: "Immersion", color: "#ef4444" });
  const anki = await repo.createCategory({ hobby_id: s, name: "Anki", color: "#3b82f6" });

  const ci = await exercise(s, imm, "Comprehensible Input (Beginner)", {
    tools: ["stopwatch"],
    description: "Videos auf Beginner-Niveau, ohne Untertitel.",
  });
  const ciTime = await repo.createMetric({
    exercise_id: ci,
    name: "Immersion",
    unit: "",
    kind: "time",
    aggregation: "sum",
    start_value: null,
    target_value: 9000,
    position: 0,
  });
  await repo.createRule({
    exercise_id: ci,
    type: "metric",
    metric_id: ciTime,
    threshold: 9000,
    required_count: 1,
    date: null,
  });

  const ankiEx = await exercise(s, anki, "Anki – tägliche Wiederholung", { tools: ["countdown"] });
  const cards = await repo.createMetric({
    exercise_id: ankiEx,
    name: "Karten",
    unit: "Karten",
    kind: "number",
    aggregation: "sum",
    start_value: null,
    target_value: 2000,
    position: 0,
  });
  await repo.createRule({
    exercise_id: ankiEx,
    type: "metric",
    metric_id: cards,
    threshold: 2000,
    required_count: 1,
    date: null,
  });

  await knowledge(s, "Grammatik", 0, [
    ["Presente", "- [x] Regelmäßige Verben\n- [ ] Stammwechsel (e→ie, o→ue)\n- [ ] Unregelmäßige Verben"],
    "ser vs. estar",
    "Pretérito indefinido",
    "Pretérito imperfecto",
    "Subjuntivo – Grundlagen",
  ]);
  await knowledge(s, "Aussprache", 1, ["Das gerollte R", "b und v", "Betonung und Akzente"], 1);

  const sRoutine = await repo.createRoutine({
    hobby_id: s,
    name: "Spanisch täglich",
    description: "",
  });
  await repo.addRoutineItem({ routine_id: sRoutine, exercise_id: ci, position: 0, duration_min: 45 });
  await repo.addRoutineItem({ routine_id: sRoutine, exercise_id: ankiEx, position: 1, duration_min: 15 });

  await repo.createGoal({
    hobby_id: s,
    phase_id: null,
    name: "150 Stunden Immersion",
    description: "",
    deadline: daysFromNow(200),
    kind: "metric",
    exercise_id: ci,
    metric_id: ciTime,
    target_value: 9000,
    status: "open",
  });

  await history(s, sRoutine, 14, [
    { exerciseId: ci, minutes: 45, metric: () => [ciTime, 45] },
    { exerciseId: ankiEx, minutes: 15, metric: () => [cards, 40] },
  ]);

  return g;
}
