import { migrations } from "./migrations";

export type Param = string | number | null;

export interface Db {
  select<T>(sql: string, params?: Param[]): Promise<T[]>;
  /** Runs a statement and returns the id of the inserted row (if any). */
  execute(sql: string, params?: Param[]): Promise<number>;
}

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function openTauriDb(): Promise<Db> {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const db = await Database.load("sqlite:hobby-manager.db");
  return {
    select: (sql, params = []) => db.select(sql, params),
    execute: async (sql, params = []) => {
      const res = await db.execute(sql, params);
      return res.lastInsertId ?? 0;
    },
  };
}

const BROWSER_KEY = "hobby-manager-db";

/**
 * Browser fallback (plain `npm run dev` without Tauri): the same SQLite engine
 * compiled to WASM, persisted in localStorage. Meant for UI development only.
 */
async function openBrowserDb(): Promise<Db> {
  const { default: initSqlJs } = await import("sql.js");
  const { default: wasmUrl } = await import("sql.js/dist/sql-wasm.wasm?url");
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });

  let saved: Uint8Array | undefined;
  try {
    const raw = localStorage.getItem(BROWSER_KEY);
    if (raw) saved = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  } catch {
    saved = undefined;
  }
  const db = new SQL.Database(saved);
  db.run("PRAGMA foreign_keys = ON");

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const bytes = db.export();
        let bin = "";
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        localStorage.setItem(BROWSER_KEY, btoa(bin));
      } catch {
        // storage unavailable – data lives for this tab only
      }
    }, 200);
  };

  return {
    select: async <T,>(sql: string, params: Param[] = []) => {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    },
    execute: async (sql, params = []) => {
      db.run(sql, params);
      const id = db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0];
      persist();
      return Number(id ?? 0);
    },
  };
}

async function migrate(db: Db) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)",
  );
  const rows = await db.select<{ version: number }>(
    "SELECT version FROM schema_version",
  );
  let version = rows[0]?.version ?? 0;
  if (rows.length === 0) await db.execute("INSERT INTO schema_version VALUES (0)");
  while (version < migrations.length) {
    for (const stmt of migrations[version]) await db.execute(stmt);
    version++;
    await db.execute("UPDATE schema_version SET version = ?", [version]);
  }
}

let dbPromise: Promise<Db> | null = null;

export function getDb(): Promise<Db> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = isTauri() ? await openTauriDb() : await openBrowserDb();
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}
