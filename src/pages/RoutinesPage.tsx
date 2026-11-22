import clsx from "clsx";
import { RoutineMenu } from "../components/menus";
import { Archive, Check, GripVertical, Play, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader } from "../components/Layout";
import { createAndOpenRoutine, TimeBar } from "../components/RoutineDialog";
import { SortableList, useSortableItem } from "../components/sortable";
import { Button, Chip, Toolbar, useContextMenu } from "../components/ui";
import * as repo from "../db/repo";
import type { Routine } from "../db/types";
import { formatMinutes } from "../domain/progress";
import { mutate } from "../lib/store";
import { openRoutine } from "../lib/uiState";

const COLS = "grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,14rem)_5rem_7rem_5.5rem] items-center gap-3";

/** Routines as a list like Slate's task list; a click opens the routine window. */
export function RoutinesPage() {
  const { data } = useHobby();
  const [query, setQuery] = useState("");
  const [archive, setArchive] = useState(false);
  const q = query.trim().toLowerCase();
  const routines = data.routines.filter((r) => !!r.archived_at === archive && (!q || r.name.toLowerCase().includes(q)));
  const archivedCount = data.routines.filter((r) => r.archived_at).length;

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
      </Toolbar>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={clsx(COLS, "px-3 pb-2 text-xs font-medium text-muted")}>
          <span />
          <span>Routine</span>
          <span>Ablauf</span>
          <span>Dauer</span>
          <span>Zuletzt</span>
          <span />
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-card">
          <SortableList items={routines} onReorder={(ids) => mutate(() => repo.reorder("routine", ids))}>
            {(items) => items.map((r) => <Row key={r.id} routine={r} canDrag={!q} />)}
          </SortableList>
          {archive && routines.length === 0 && <p className="py-10 text-center text-sm text-muted">Archiv ist leer</p>}
          {!archive && <button
            onClick={() => createAndOpenRoutine(data.hobby.id)}
            className="flex h-11 w-full items-center gap-2 px-3 text-left text-[13px] text-muted transition-colors hover:bg-elev/60 hover:text-fg"
          >
            <Plus size={14} className="ml-0.5" /> Neue Routine
          </button>}
        </div>
      </div>
    </>
  );
}

function Row({ routine: r, canDrag }: { routine: Routine; canDrag: boolean }) {
  const { data, d, base } = useHobby();
  const navigate = useNavigate();
  const { ref, style, handle, isDragging } = useSortableItem(r.id);
  const menu = useContextMenu();
  const items = d.routineItems(r.id);
  const total = items.reduce((a, i) => a + i.duration_min, 0);
  const sessions = data.sessions.filter((s) => s.routine_id === r.id && s.ended_at);
  const last = sessions.at(-1);
  const names = items.map((i) => d.exercise(i.exercise_id)?.name).filter(Boolean);

  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      onClick={() => openRoutine(r.id)}
      className={clsx(
        COLS,
        "group min-h-14 cursor-pointer border-b border-line bg-card px-3 py-2 text-sm hover:bg-elev/60",
        isDragging && "shadow-lg",
      )}
    >
      <span
        {...(canDrag ? handle : {})}
        onClick={(e) => e.stopPropagation()}
        className={clsx("text-muted opacity-0", canDrag && "cursor-grab group-hover:opacity-100")}
      >
        <GripVertical size={14} />
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium">{r.name || "Ohne Namen"}</div>
        <div className="mt-0.5 truncate text-xs text-muted">
          {names.length ? names.join(" · ") : "Noch keine Übungen"}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-2">
        {total > 0 && <TimeBar items={items} className="h-1.5 flex-1" />}
        <span className="tabular shrink-0 text-xs text-muted">{items.length} Üb.</span>
      </div>
      <span className="tabular text-muted">{total > 0 ? formatMinutes(total) : "–"}</span>
      <span className="truncate text-xs text-muted">
        {last ? new Date(last.started_at).toLocaleDateString("de-DE", { day: "numeric", month: "short" }) : "–"}
        {sessions.length > 0 && ` · ${sessions.length}×`}
      </span>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={items.length === 0}
          onClick={(e) => {
            e.stopPropagation();
            navigate(`${base}/practice/routine/${r.id}`);
          }}
        >
          <Play size={12} /> Start
        </Button>
      </div>
    </div>
    {menu.at && <RoutineMenu routine={r} at={menu.at} onClose={menu.close} />}
    </>
  );
}
