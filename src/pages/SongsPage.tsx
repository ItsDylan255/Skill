import clsx from "clsx";
import { ExerciseMenu } from "../components/menus";
import { Archive, Check, GripVertical, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CategoryBadges, CategoryManager } from "../components/categories";
import { createAndOpenExercise } from "../components/ExerciseDialog";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader } from "../components/Layout";
import { SongProgress } from "../components/song";
import { SortableList, useSortableItem } from "../components/sortable";
import { Chip, Toolbar, useContextMenu } from "../components/ui";
import * as repo from "../db/repo";
import type { Exercise } from "../db/types";
import { mutate } from "../lib/store";
import { openExercise } from "../lib/uiState";

const COLS = "grid grid-cols-[1.5rem_minmax(0,1fr)_9rem_8rem_7rem_11rem] items-center gap-3";

/** Songs to learn, built like the exercise list; each song has parts with a target tempo. */
export function SongsPage() {
  const { data } = useHobby();
  const [query, setQuery] = useState("");
  const [archive, setArchive] = useState(false);
  const songs = useMemo(() => data.exercises.filter((e) => e.kind === "song"), [data.exercises]);
  const q = query.trim().toLowerCase();
  const rows = songs.filter(
    (e) => (e.status === "archived") === archive && (!q || e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)),
  );
  const archivedCount = songs.filter((e) => e.status === "archived").length;

  return (
    <>
      <HobbyHeader />
      <Toolbar>
        <div className="relative w-56">
          <Search size={13} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted" />
          <input
            className="h-7 w-full rounded-lg border border-input bg-bg dark:bg-white/[0.03] pr-2 pl-8 text-[13px] shadow-xs outline-none placeholder:text-muted/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            id="filter-search"
            placeholder="Suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Chip active={archive} onClick={() => setArchive(!archive)}>
          {archive ? <Check /> : <Archive />} Archiv
          <span className="tabular text-muted">{archivedCount}</span>
        </Chip>
        <div className="ml-auto" />
        <CategoryManager />
      </Toolbar>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={clsx(COLS, "px-3 pb-2 text-xs font-medium text-muted")}>
          <span />
          <span>Song</span>
          <span>Kategorie</span>
          <span>Tempo</span>
          <span>Zuletzt geübt</span>
          <span>Fortschritt</span>
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <SortableList items={rows} onReorder={(ids) => mutate(() => repo.reorder("exercise", ids))}>
            {(items) => items.map((e) => <Row key={e.id} song={e} canDrag={!q} />)}
          </SortableList>
          {!archive && (
            <button
              onClick={() => createAndOpenExercise(data.hobby, { kind: "song", tools: ["stopwatch", "metronome"] })}
              className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] text-muted transition-colors hover:bg-elev/60 hover:text-fg"
            >
              <Plus size={14} className="ml-0.5" /> Neuer Song
            </button>
          )}
          {archive && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">Archiv ist leer</p>}
        </div>
      </div>
    </>
  );
}

function Row({ song, canDrag }: { song: Exercise; canDrag: boolean }) {
  const { d } = useHobby();
  const { ref, style, handle, isDragging } = useSortableItem(song.id);
  const menu = useContextMenu();
  const last = d.lastRun(song.id);
  const parts = d.sectionsOf(song.id);
  // tempo column: lowest current tempo against the highest target
  const cur = parts.map((p) => p.current_bpm).filter((x): x is number => x != null);
  const target = parts.map((p) => p.target_bpm).filter((x): x is number => x != null);
  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      onClick={() => openExercise(song.id)}
      className={clsx(COLS, "group h-11 cursor-pointer border-b border-line bg-card px-3 text-sm hover:bg-elev/60", isDragging && "shadow-lg")}
    >
      <span
        {...(canDrag ? handle : {})}
        onClick={(e) => e.stopPropagation()}
        className={clsx("text-muted opacity-0", canDrag && "cursor-grab group-hover:opacity-100")}
      >
        <GripVertical size={14} />
      </span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 truncate font-medium">{song.name || "Ohne Namen"}</span>
        {parts.length > 0 && <span className="truncate text-xs text-muted">{parts.map((p) => p.name).join(" · ")}</span>}
      </span>
      <span className="min-w-0">
        <CategoryBadges ids={song.category_ids} max={2} />
      </span>
      <span className="tabular truncate text-xs text-muted">
        {target.length ? `${cur.length ? Math.min(...cur) : "–"} / ${Math.max(...target)} BPM` : "–"}
      </span>
      <span className="tabular truncate text-muted">
        {last ? new Date(last).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–"}
      </span>
      <SongProgress exercise={song} />
    </div>
    {menu.at && <ExerciseMenu exercise={song} at={menu.at} onClose={menu.close} />}
    </>
  );
}
