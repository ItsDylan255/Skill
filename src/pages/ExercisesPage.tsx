import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ExerciseMenu } from "../components/menus";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import clsx from "clsx";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Plus,
  Search,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { CategoryBadges, CategoryManager } from "../components/categories";
import { createAndOpenExercise } from "../components/ExerciseDialog";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader } from "../components/Layout";
import { useSortableItem } from "../components/sortable";
import { Chip, MenuItem, MenuLabel, MenuSeparator, Popover, ProgressBar, Toolbar, usePopover, useContextMenu } from "../components/ui";
import * as repo from "../db/repo";
import type { Exercise } from "../db/types";
import type { Derived } from "../domain/derived";
import { formatMinutes, totalMinutes } from "../domain/progress";
import { mutate } from "../lib/store";
import { openExercise } from "../lib/uiState";

type SortKey = "manual" | "name" | "category" | "last" | "total" | "progress" | "created";

const SORT_LABEL: Record<SortKey, string> = {
  manual: "Manuell",
  name: "Name",
  category: "Kategorie",
  last: "Zuletzt geübt",
  total: "Gesamtzeit",
  progress: "Fortschritt",
  created: "Erstellt",
};

const VIEW_KEY = "hobby-manager-exercise-view-v3";
const COLLAPSED_KEY = "hobby-manager-exercise-collapsed";

/** Collapsed category groups per hobby, kept across tab switches and restarts. */
function useCollapsed(hobbyId: number) {
  const key = `${COLLAPSED_KEY}-${hobbyId}`;
  const [collapsed, setState] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const setCollapsed = (next: Set<string>) => {
    setState(next);
    try {
      localStorage.setItem(key, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  };
  return [collapsed, setCollapsed] as const;
}

interface View {
  sort: SortKey;
  dir: 1 | -1;
  group: boolean;
}

function loadView(): View {
  try {
    const v = JSON.parse(localStorage.getItem(VIEW_KEY) ?? "");
    if (v?.sort) return v;
  } catch {
    // ignore
  }
  return { sort: "manual", dir: 1, group: true };
}

function sortValue(e: Exercise, key: SortKey, d: Derived): string | number {
  switch (key) {
    case "manual":
      return e.position;
    case "name":
      return e.name.toLowerCase();
    case "category":
      return d.category(e.category_ids[0])?.name.toLowerCase() ?? "￿";
    case "last":
      return d.lastRun(e.id) ?? "";
    case "total":
      return totalMinutes(d.runsOf(e.id));
    case "progress": {
      const c = d.completion(e);
      return c.results.length ? c.progress : -1;
    }
    case "created":
      return e.created_at;
  }
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

const COLS = "grid grid-cols-[1.5rem_minmax(0,1fr)_9rem_7rem_6rem_11rem] items-center gap-3";

export function ExercisesPage() {
  const { data, d } = useHobby();
  // songs have their own page
  const exercises = useMemo(() => data.exercises.filter((e) => e.kind !== "song"), [data.exercises]);
  const [query, setQuery] = useState("");
  const [archive, setArchive] = useState(false);
  const [collapsed, setCollapsed] = useCollapsed(data.hobby.id);
  const [view, setViewState] = useState<View>(loadView);
  const sortMenu = usePopover();
  const hiddenMenu = usePopover();
  const hiddenCats = data.categories.filter((c) => c.hidden_in_exercises);
  const isHidden = (id: number) => hiddenCats.some((c) => c.id === id);
  const setHidden = (id: number, hidden: boolean) =>
    mutate(() => repo.updateCategory(id, { hidden_in_exercises: hidden ? 1 : 0 }));
  const groupMenu = usePopover();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const setView = (patch: Partial<View>) => {
    const v = { ...view, ...patch };
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(v));
    } catch {
      // ignore
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = exercises.filter(
      (e) =>
        (e.status === "archived") === archive &&
        // only in hidden categories = not shown
        !(e.category_ids.length > 0 && e.category_ids.every(isHidden)) &&
        (!q || e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)),
    );
    const dir = view.sort === "manual" ? 1 : view.dir;
    return list
      .map((e) => ({ e, v: sortValue(e, view.sort, d) }))
      .sort((a, b) => (a.v < b.v ? -dir : a.v > b.v ? dir : a.e.id - b.e.id))
      .map((x) => x.e);
  }, [exercises, d, query, archive, view.sort, view.dir, data.categories]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    if (!view.group) return [{ key: "all", categoryId: null as number | null, label: "", color: "", items: rows }];
    return [...data.categories.filter((c) => !c.hidden_in_exercises), { id: null, name: "Ohne Kategorie", color: "#a3a3a3" }]
      .map((c) => ({
        key: String(c.id),
        categoryId: c.id,
        label: c.name,
        color: c.color,
        items: rows.filter((e) => (c.id == null ? e.category_ids.length === 0 : e.category_ids.includes(c.id))),
      }))
      .filter((g) => g.items.length > 0 || (g.categoryId != null && !archive && !query));
  }, [rows, data.categories, view.group, archive, query]);

  const canDrag = view.sort === "manual" && !query;
  // an exercise with several categories shows up in several groups, so drag ids are "group:exercise"
  const sortIds = groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.items.map((e) => `${g.key}:${e.id}`)));
  const parseId = (id: string | number) => {
    const [g, ex] = String(id).split(":");
    return { cat: g === "null" || g === "all" ? null : Number(g), exercise: d.exercise(Number(ex)) };
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = parseId(e.active.id);
    const to = parseId(e.over.id);
    const active = from.exercise;
    const over = to.exercise;
    if (!active || !over) return;
    // Move within the full manual order, so hidden (archived) exercises keep their place.
    const all = [...exercises].sort((a, b) => a.position - b.position || a.id - b.id).filter((x) => x.id !== active.id);
    const fromIdx = rows.findIndex((x) => x.id === active.id);
    const toIdx = rows.findIndex((x) => x.id === over.id);
    const overIdx = all.findIndex((x) => x.id === over.id);
    if (active.id !== over.id) all.splice(toIdx > fromIdx ? overIdx + 1 : overIdx, 0, active);
    else all.push(active);
    await mutate(async () => {
      if (view.group && from.cat !== to.cat) {
        // moving to another group swaps that one category, the others stay
        const ids = to.cat == null ? [] : [...active.category_ids.filter((c) => c !== from.cat && c !== to.cat), to.cat];
        await repo.updateExercise(active.id, { category_ids: ids });
      }
      if (active.id !== over.id) await repo.reorder("exercise", all.map((x) => x.id));
    });
  };

  const add = (categoryId: number | null) =>
    createAndOpenExercise(data.hobby, { category_ids: categoryId ? [categoryId] : [] });
  const archivedCount = exercises.filter((e) => e.status === "archived").length;

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
        <Chip active={view.group} onClick={groupMenu.open}>
          <Layers /> {view.group ? "Nach Kategorie" : "Nicht gruppiert"} <ChevronDown />
        </Chip>
        {groupMenu.anchor && (
          <Popover anchor={groupMenu.anchor} onClose={groupMenu.close} className="w-48">
            <MenuLabel>Gruppieren</MenuLabel>
            {[
              { v: false, label: "Keine" },
              { v: true, label: "Kategorie" },
            ].map((o) => (
              <MenuItem
                key={o.label}
                right={view.group === o.v && <Check size={13} />}
                onClick={() => {
                  setView({ group: o.v });
                  groupMenu.close();
                }}
              >
                {o.label}
              </MenuItem>
            ))}
          </Popover>
        )}
        <Chip active={view.sort !== "manual"} onClick={sortMenu.open}>
          <ArrowUpDown /> {SORT_LABEL[view.sort]}
          {view.sort !== "manual" && (view.dir === 1 ? <ArrowUp /> : <ArrowDown />)} <ChevronDown />
        </Chip>
        {sortMenu.anchor && (
          <Popover anchor={sortMenu.anchor} onClose={sortMenu.close} className="w-52">
            <MenuLabel>Sortieren nach</MenuLabel>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <MenuItem key={k} right={view.sort === k && <Check size={13} />} onClick={() => setView({ sort: k })}>
                {SORT_LABEL[k]}
              </MenuItem>
            ))}
            {view.sort !== "manual" && (
              <>
                <MenuSeparator />
                <MenuItem icon={<ArrowUp size={13} />} right={view.dir === 1 && <Check size={13} />} onClick={() => setView({ dir: 1 })}>
                  Aufsteigend
                </MenuItem>
                <MenuItem icon={<ArrowDown size={13} />} right={view.dir === -1 && <Check size={13} />} onClick={() => setView({ dir: -1 })}>
                  Absteigend
                </MenuItem>
              </>
            )}
          </Popover>
        )}
        {view.group && (
          <Chip
            onClick={() => setCollapsed(groups.some((g) => !collapsed.has(g.key)) ? new Set(groups.map((g) => g.key)) : new Set())}
          >
            {groups.some((g) => !collapsed.has(g.key)) ? (
              <>
                <ChevronsDownUp /> Alle einklappen
              </>
            ) : (
              <>
                <ChevronsUpDown /> Alle ausklappen
              </>
            )}
          </Chip>
        )}
        <Chip active={archive} onClick={() => setArchive(!archive)}>
          {archive ? <Check /> : <Archive />} Archiv
          <span className="tabular text-muted">{archivedCount}</span>
        </Chip>
        {hiddenCats.length > 0 && (
          <Chip onClick={hiddenMenu.open}>
            <EyeOff /> {hiddenCats.length} ausgeblendet <ChevronDown />
          </Chip>
        )}
        {hiddenMenu.anchor && (
          <Popover anchor={hiddenMenu.anchor} onClose={hiddenMenu.close} className="w-56">
            <MenuLabel>Ausgeblendete Kategorien</MenuLabel>
            {hiddenCats.map((c) => (
              <MenuItem
                key={c.id}
                icon={<span className="size-2 rounded-full" style={{ backgroundColor: c.color }} />}
                right={<Eye size={13} />}
                onClick={() => {
                  if (hiddenCats.length === 1) hiddenMenu.close();
                  setHidden(c.id, false);
                }}
              >
                {c.name}
              </MenuItem>
            ))}
          </Popover>
        )}
        <div className="ml-auto" />
        <CategoryManager />
      </Toolbar>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={clsx(COLS, "px-3 pb-2 text-xs font-medium text-muted")}>
          <span />
          <span>Name</span>
          <span>Kategorie</span>
          <span>Zuletzt geübt</span>
          <span>Gesamt</span>
          <span>Fortschritt</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            <div className="overflow-hidden rounded-xl border border-line bg-card">
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return (
                  <Fragment key={g.key}>
                    {view.group && (
                      <div className="group flex h-9 items-center gap-2 border-b border-line bg-panel/70 px-3 text-[13px]">
                        <button
                          className="flex items-center gap-2 font-medium"
                          onClick={() => {
                            const next = new Set(collapsed);
                            if (isCollapsed) next.delete(g.key);
                            else next.add(g.key);
                            setCollapsed(next);
                          }}
                        >
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          <span className="size-2 rounded-full" style={{ backgroundColor: g.color }} />
                          {g.label}
                          <span className="font-normal text-muted">{g.items.length}</span>
                        </button>
                        <span className="ml-auto flex items-center opacity-0 group-hover:opacity-100">
                          {g.categoryId != null && (
                            <button
                              title="In Übungen ausblenden"
                              className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-elev hover:text-fg"
                              onClick={() => setHidden(g.categoryId!, true)}
                            >
                              <EyeOff size={14} />
                            </button>
                          )}
                          {!archive && (
                            <button
                              title="Übung in dieser Kategorie anlegen"
                              className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-elev hover:text-fg"
                              onClick={() => add(g.categoryId)}
                            >
                              <Plus size={14} />
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                    {!isCollapsed && g.items.map((e) => <Row key={e.id} sortId={`${g.key}:${e.id}`} exercise={e} canDrag={canDrag} />)}
                  </Fragment>
                );
              })}
              {!archive && (
                <button
                  onClick={() => add(null)}
                  className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] text-muted transition-colors hover:bg-elev/60 hover:text-fg"
                >
                  <Plus size={14} className="ml-0.5" /> Neue Übung
                </button>
              )}
              {archive && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">Archiv ist leer</p>}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}

function Row({ exercise, sortId, canDrag }: { exercise: Exercise; sortId: string; canDrag: boolean }) {
  const { d } = useHobby();
  const { ref, style, handle, isDragging } = useSortableItem(sortId);
  const menu = useContextMenu();
  const c = d.completion(exercise);
  const last = d.lastRun(exercise.id);
  const total = totalMinutes(d.runsOf(exercise.id));
  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      onClick={() => openExercise(exercise.id)}
      className={clsx(
        COLS,
        "group h-11 cursor-pointer border-b border-line bg-card px-3 text-sm hover:bg-elev/60",
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
      <span className="truncate font-medium">{exercise.name || "Ohne Namen"}</span>
      <span className="min-w-0">
        <CategoryBadges ids={exercise.category_ids} max={2} />
      </span>
      <span className="tabular truncate text-muted">{last ? fmtDate(last) : "–"}</span>
      <span className="tabular truncate text-muted">{total > 0 ? formatMinutes(total) : "–"}</span>
      <span>
        {c.results.length > 0 && (
          <span className="flex items-center gap-2">
            <ProgressBar value={c.progress} color={c.complete ? "var(--ok)" : undefined} />
            <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted">{Math.round(c.progress * 100)}%</span>
          </span>
        )}
      </span>
    </div>
    {menu.at && <ExerciseMenu exercise={exercise} at={menu.at} onClose={menu.close} />}
    </>
  );
}
