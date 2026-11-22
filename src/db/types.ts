export type ExerciseStatus = "active" | "archived";

export type ToolType = "countdown" | "stopwatch" | "metronome";

/**
 * "time" metrics are filled automatically from the run duration (in minutes);
 * "memo" only remembers the last value (where you stopped), without start, target or rating.
 */
export type MetricKind = "number" | "time" | "memo";
export type Aggregation = "latest" | "max" | "min" | "sum";

export type RuleType =
  | "metric"
  | "total_time"
  | "days"
  | "sessions"
  | "date"
  | "checklist";

export type GoalKind = "manual" | "metric" | "total_time" | "exercise_done";

export interface Hobby {
  id: number;
  name: string;
  color: string;
  icon: string;
  /** JSON list of switched off sections, see `hiddenTabs` */
  hidden_tabs: string;
  /** JSON list of tab ids in the order chosen by drag & drop */
  tab_order: string;
  created_at: string;
}

export interface Category {
  id: number;
  hobby_id: number;
  name: string;
  color: string;
  /** 1 = not shown in the exercise list */
  hidden_in_exercises: number;
}

export interface Phase {
  id: number;
  hobby_id: number;
  position: number;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
}

export interface Exercise {
  id: number;
  hobby_id: number;
  category_ids: number[];
  name: string;
  description: string;
  status: ExerciseStatus;
  successor_id: number | null;
  /** manual order in the exercise list */
  position: number;
  tools: ToolType[];
  default_bpm: number | null;
  /** countdown length when practised on its own, in minutes */
  countdown_min: number | null;
  /** metronome tempo of the last practice */
  metronome_bpm: number | null;
  metronome_measure: string | null;
  metronome_subdivision: number | null;
  /** "song" = shown under Songs, with parts and tempo progress */
  kind: "practice" | "song";
  /** 1 = leicht, 2 = normal, 3 = schwer */
  difficulty: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface Link {
  id: number;
  exercise_id: number;
  url: string;
  title: string;
}

export interface Attachment {
  id: number;
  exercise_id: number;
  path: string;
  name: string;
  /** "file" = copied into the app folder, "folder" = linked folder that is opened in the explorer */
  kind: "file" | "folder";
}

export interface ChecklistItem {
  id: number;
  exercise_id: number;
  text: string;
  position: number;
  done_at: string | null;
}

export interface Metric {
  id: number;
  exercise_id: number;
  name: string;
  unit: string;
  kind: MetricKind;
  aggregation: Aggregation;
  start_value: number | null;
  target_value: number | null;
  position: number;
}

export interface CompletionRule {
  id: number;
  exercise_id: number;
  type: RuleType;
  metric_id: number | null;
  threshold: number | null;
  required_count: number;
  date: string | null;
}

export interface Routine {
  id: number;
  hobby_id: number;
  position: number;
  name: string;
  description: string;
  archived_at: string | null;
}

export interface RoutineItem {
  id: number;
  routine_id: number;
  exercise_id: number;
  position: number;
  duration_min: number;
}

export interface Session {
  id: number;
  hobby_id: number;
  routine_id: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface ExerciseRun {
  id: number;
  session_id: number;
  exercise_id: number;
  started_at: string;
  duration_sec: number;
}

export interface MetricValue {
  id: number;
  run_id: number;
  metric_id: number;
  value: number;
}

export interface Note {
  id: number;
  exercise_id: number;
  /** null = persistent exercise note, otherwise bound to one session */
  session_id: number | null;
  text: string;
  created_at: string;
}

export interface Goal {
  id: number;
  hobby_id: number;
  position: number;
  phase_id: number | null;
  name: string;
  description: string;
  deadline: string | null;
  kind: GoalKind;
  exercise_id: number | null;
  metric_id: number | null;
  target_value: number | null;
  status: "open" | "done";
  completed_at: string | null;
}

/** A named collection of topics, e.g. "Musiktheorie" or "Grammatik". */
export interface KnowledgeBase {
  id: number;
  hobby_id: number;
  name: string;
  position: number;
  created_at: string;
}

export interface Topic {
  id: number;
  base_id: number;
  /** nested under another item of the same plan */
  parent_id: number | null;
  title: string;
  content: string;
  position: number;
  /** set while the stage is "understood" */
  done_at: string | null;
  stage: TopicStage;
  created_at: string;
}

export type TopicStage = "new" | "learning" | "understood";

/** A part of a song (Intro, Chorus …) with the tempo it should reach. */
export interface SongSection {
  id: number;
  exercise_id: number;
  name: string;
  position: number;
  target_bpm: number | null;
  current_bpm: number | null;
}

/** A one-off thing to do, e.g. "watch video about x". */
export interface Item {
  id: number;
  hobby_id: number;
  title: string;
  notes: string;
  url: string;
  position: number;
  done_at: string | null;
  created_at: string;
  category_ids: number[];
}

/** Everything belonging to one hobby, loaded at once and computed in memory. */
export interface HobbyData {
  hobby: Hobby;
  categories: Category[];
  phases: Phase[];
  exercises: Exercise[];
  links: Link[];
  attachments: Attachment[];
  checklist: ChecklistItem[];
  metrics: Metric[];
  rules: CompletionRule[];
  routines: Routine[];
  routineItems: RoutineItem[];
  sessions: Session[];
  runs: ExerciseRun[];
  values: MetricValue[];
  notes: Note[];
  goals: Goal[];
  knowledgeBases: KnowledgeBase[];
  topics: Topic[];
  items: Item[];
  songSections: SongSection[];
}
