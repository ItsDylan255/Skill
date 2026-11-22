/**
 * Schema migrations. Each entry runs once, in order; the applied version is
 * kept in the `schema_version` table. Never edit an applied migration — add a new one.
 */
export const migrations: string[][] = [
  [
    `CREATE TABLE hobby (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT NOT NULL DEFAULT 'sparkles',
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE category (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#71717a'
    )`,
    `CREATE TABLE phase (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_date TEXT,
      end_date TEXT
    )`,
    `CREATE TABLE exercise (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      category_id INTEGER REFERENCES category(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'backlog',
      successor_id INTEGER REFERENCES exercise(id) ON DELETE SET NULL,
      tools TEXT NOT NULL DEFAULT '[]',
      default_bpm REAL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    )`,
    `CREATE TABLE link (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE attachment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      name TEXT NOT NULL
    )`,
    `CREATE TABLE checklist_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      done_at TEXT
    )`,
    `CREATE TABLE metric (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT '',
      kind TEXT NOT NULL DEFAULT 'number',
      aggregation TEXT NOT NULL DEFAULT 'latest',
      start_value REAL,
      target_value REAL,
      position INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE completion_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      metric_id INTEGER REFERENCES metric(id) ON DELETE CASCADE,
      threshold REAL,
      required_count INTEGER NOT NULL DEFAULT 1,
      date TEXT
    )`,
    `CREATE TABLE routine (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      phase_id INTEGER REFERENCES phase(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT ''
    )`,
    `CREATE TABLE routine_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      routine_id INTEGER NOT NULL REFERENCES routine(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      duration_min REAL NOT NULL DEFAULT 10
    )`,
    `CREATE TABLE session (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      routine_id INTEGER REFERENCES routine(id) ON DELETE SET NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    )`,
    `CREATE TABLE exercise_run (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      started_at TEXT NOT NULL,
      duration_sec INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE metric_value (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER NOT NULL REFERENCES exercise_run(id) ON DELETE CASCADE,
      metric_id INTEGER NOT NULL REFERENCES metric(id) ON DELETE CASCADE,
      value REAL NOT NULL
    )`,
    `CREATE TABLE note (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      session_id INTEGER REFERENCES session(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE goal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      phase_id INTEGER REFERENCES phase(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      deadline TEXT,
      kind TEXT NOT NULL DEFAULT 'manual',
      exercise_id INTEGER REFERENCES exercise(id) ON DELETE SET NULL,
      metric_id INTEGER REFERENCES metric(id) ON DELETE SET NULL,
      target_value REAL,
      status TEXT NOT NULL DEFAULT 'open',
      completed_at TEXT
    )`,
    `CREATE INDEX idx_exercise_hobby ON exercise(hobby_id)`,
    `CREATE INDEX idx_run_exercise ON exercise_run(exercise_id)`,
    `CREATE INDEX idx_value_run ON metric_value(run_id)`,
  ],
  [
    // "knowledge" = topics you understand once and tick off, "practice" = skills you repeat
    `ALTER TABLE exercise ADD COLUMN kind TEXT NOT NULL DEFAULT 'practice'`,
    `ALTER TABLE exercise ADD COLUMN position INTEGER NOT NULL DEFAULT 0`,
  ],
  [
    // Knowledge moves out of the exercise table into its own collections of topics.
    `CREATE TABLE knowledge_base (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE topic (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      base_id INTEGER NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      done_at TEXT,
      created_at TEXT NOT NULL
    )`,
    // one collection per hobby and former category of knowledge exercises
    `INSERT INTO knowledge_base (hobby_id, name, position, created_at)
     SELECT DISTINCT e.hobby_id, COALESCE(c.name, 'Wissen'), 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
     FROM exercise e LEFT JOIN category c ON c.id = e.category_id
     WHERE e.kind = 'knowledge'`,
    // sub-topics become a checklist at the end of the text
    `INSERT INTO topic (base_id, title, content, position, done_at, created_at)
     SELECT kb.id, e.name,
       trim(e.description || char(10) || char(10) || COALESCE((
         SELECT group_concat(line, char(10)) FROM (
           SELECT CASE WHEN ci.done_at IS NULL THEN '- [ ] ' ELSE '- [x] ' END || ci.text AS line
           FROM checklist_item ci WHERE ci.exercise_id = e.id ORDER BY ci.position
         )), '')),
       e.position,
       CASE WHEN e.status = 'completed' THEN COALESCE(e.completed_at, e.created_at) END,
       e.created_at
     FROM exercise e
     LEFT JOIN category c ON c.id = e.category_id
     JOIN knowledge_base kb ON kb.hobby_id = e.hobby_id AND kb.name = COALESCE(c.name, 'Wissen')
     WHERE e.kind = 'knowledge'`,
    `DELETE FROM exercise WHERE kind = 'knowledge'`,
    // exercises only know "active" and "archived" now
    `UPDATE exercise SET status = CASE WHEN status IN ('completed', 'archived') THEN 'archived' ELSE 'active' END`,
    `UPDATE routine SET phase_id = NULL`,
    `CREATE INDEX idx_topic_base ON topic(base_id)`,
  ],
  [
    // trim() without arguments left the line breaks of migrated topics in place
    `UPDATE topic SET content = trim(content, char(10) || char(13) || ' ')`,
  ],
  [
    // manual order (drag & drop) for exercises, routines, goals and phases
    `ALTER TABLE routine ADD COLUMN position INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE goal ADD COLUMN position INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE phase ADD COLUMN position INTEGER NOT NULL DEFAULT 0`,
    `UPDATE exercise SET position = id`,
    `UPDATE routine SET position = id`,
    `UPDATE goal SET position = id`,
    `UPDATE phase SET position = id`,
  ],
  [
    // an exercise can have several categories
    `CREATE TABLE exercise_category (
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
      PRIMARY KEY (exercise_id, category_id)
    )`,
    `INSERT INTO exercise_category (exercise_id, category_id)
     SELECT id, category_id FROM exercise WHERE category_id IN (SELECT id FROM category)`,
    // plan items can be nested (roadmap)
    `ALTER TABLE topic ADD COLUMN parent_id INTEGER REFERENCES topic(id) ON DELETE CASCADE`,
  ],
  [
    // sections of a hobby that are switched off (JSON list of tab ids)
    `ALTER TABLE hobby ADD COLUMN hidden_tabs TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE routine ADD COLUMN archived_at TEXT`,
  ],
  [
    // manual order of hobbies in the sidebar
    `ALTER TABLE hobby ADD COLUMN position INTEGER NOT NULL DEFAULT 0`,
    `UPDATE hobby SET position = id`,
    // an attachment can be a linked folder instead of a copied file
    `ALTER TABLE attachment ADD COLUMN kind TEXT NOT NULL DEFAULT 'file'`,
    // one-off things to do, e.g. "watch video about x"
    `CREATE TABLE item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hobby_id INTEGER NOT NULL REFERENCES hobby(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      done_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE item_category (
      item_id INTEGER NOT NULL REFERENCES item(id) ON DELETE CASCADE,
      category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, category_id)
    )`,
  ],
  [
    // songs are exercises of kind "song" with a structure of parts and a target tempo each
    `ALTER TABLE exercise ADD COLUMN difficulty INTEGER`,
    `CREATE TABLE song_section (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      exercise_id INTEGER NOT NULL REFERENCES exercise(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      target_bpm REAL,
      current_bpm REAL
    )`,
    // the songs section starts switched off
    `UPDATE hobby SET hidden_tabs = CASE
       WHEN trim(hidden_tabs) IN ('', '[]') THEN '["songs"]'
       ELSE substr(trim(hidden_tabs), 1, length(trim(hidden_tabs)) - 1) || ',"songs"]' END`,
  ],
  [
    // own countdown length of an exercise when practised alone (minutes)
    `ALTER TABLE exercise ADD COLUMN countdown_min INTEGER`,
    // categories can be hidden from the exercise list
    `ALTER TABLE category ADD COLUMN hidden_in_exercises INTEGER NOT NULL DEFAULT 0`,
    `UPDATE song_section SET name = 'Verse' WHERE name = 'Strophe'`,
  ],
  [
    // the metronome tempo an exercise was last practised with
    `ALTER TABLE exercise ADD COLUMN metronome_bpm REAL`,
  ],
  [
    // measure and subdivision of the metronome, also per exercise
    `ALTER TABLE exercise ADD COLUMN metronome_measure TEXT`,
    `ALTER TABLE exercise ADD COLUMN metronome_subdivision INTEGER`,
  ],
  [
    // plan items are learned in stages instead of ticked off
    `ALTER TABLE topic ADD COLUMN stage TEXT NOT NULL DEFAULT 'new'`,
    `UPDATE topic SET stage = 'understood' WHERE done_at IS NOT NULL`,
  ],
  [
    // own order of the sections in the hobby header (JSON list of tab ids)
    `ALTER TABLE hobby ADD COLUMN tab_order TEXT NOT NULL DEFAULT '[]'`,
  ],
];
