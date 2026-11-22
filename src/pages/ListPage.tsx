import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ItemMenu } from "../components/menus";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import clsx from "clsx";
import { Check, ChevronDown, ChevronRight, CircleCheck, ExternalLink, GripVertical, Layers, Plus, Search, StickyNote } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { CategoryBadges, CategoryManager } from "../components/categories";
import { useHobby } from "../components/HobbyContext";
import { createAndOpenItem, ItemCheck } from "../components/ItemDialog";
import { HobbyHeader } from "../components/Layout";
import { useSortableItem } from "../components/sortable";
import { Chip, IconButton, MenuItem, MenuLabel, Popover, Toolbar, usePopover, useContextMenu } from "../components/ui";
import * as repo from "../db/repo";
import type { Item } from "../db/types";
import { openExternal } from "../lib/platform";
import { mutate } from "../lib/store";
import { openItem } from "../lib/uiState";

const COLS = "grid grid-cols-[1.5rem_1.25rem_minmax(0,1fr)_11rem_2rem_7rem] items-center gap-3";
const VIEW_KEY = "hobby-manager-list-group";

/** One-off things (watch a video, try a song …): a flat list like the exercises, grouped by category. */
export function ListPage() {
  const { data } = useHobby();
  const [query, setQuery] = useState("");
  const [doneView, setDoneView] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [group, setGroupState] = useState(() => {
    try {
      return localStorage.getItem(VIEW_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const groupMenu = usePopover();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const setGroup = (v: boolean) => {
    setGroupState(v);
    try {
      localStorage.setItem(VIEW_KEY, v ? "1" : "0");
    } catch {
      // ignore
    }
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = data.items.filter(
      (i) =>
        !!i.done_at === doneView &&
        (!q || i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q) || i.url.toLowerCase().includes(q)),
    );
    // finished entries: most recently done first
    return doneView ? list.sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")) : list;
  }, [data.items, query, doneView]);

  const groups = useMemo(() => {
    if (!group) return [{ key: "all", categoryId: null as number | null, label: "", color: "", items: rows }];
    return [...data.categories, { id: null, name: "Ohne Kategorie", color: "#a3a3a3" }]
      .map((c) => ({
        key: String(c.id),
        categoryId: c.id,
        label: c.name,
        color: c.color,
        items: rows.filter((i) => (c.id == null ? i.category_ids.length === 0 : i.category_ids.includes(c.id))),
      }))
      .filter((g) => g.items.length > 0);
  }, [rows, data.categories, group]);

  const canDrag = !query && !doneView;
  // an entry with several categories shows up in several groups, so drag ids are "group:item"
  const sortIds = groups.flatMap((g) => (collapsed.has(g.key) ? [] : g.items.map((i) => `${g.key}:${i.id}`)));
  const parseId = (id: string | number) => {
    const [g, item] = String(id).split(":");
    return { cat: g === "null" || g === "all" ? null : Number(g), item: data.items.find((i) => i.id === Number(item)) };
  };

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = parseId(e.active.id);
    const to = parseId(e.over.id);
    const active = from.item;
    const over = to.item;
    if (!active || !over) return;
    // Move within the full order, so finished entries keep their place.
    const all = [...data.items].sort((a, b) => a.position - b.position || a.id - b.id).filter((x) => x.id !== active.id);
    const fromIdx = rows.findIndex((x) => x.id === active.id);
    const toIdx = rows.findIndex((x) => x.id === over.id);
    const overIdx = all.findIndex((x) => x.id === over.id);
    if (active.id !== over.id) all.splice(toIdx > fromIdx ? overIdx + 1 : overIdx, 0, active);
    else all.push(active);
    await mutate(async () => {
      if (group && from.cat !== to.cat) {
        const ids = to.cat == null ? [] : [...active.category_ids.filter((c) => c !== from.cat && c !== to.cat), to.cat];
        await repo.updateItem(active.id, { category_ids: ids });
      }
      if (active.id !== over.id) await repo.reorder("item", all.map((x) => x.id));
    });
  };

  const doneCount = data.items.filter((i) => i.done_at).length;

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
        <Chip active={group} onClick={groupMenu.open}>
          <Layers /> {group ? "Nach Kategorie" : "Nicht gruppiert"} <ChevronDown />
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
                right={group === o.v && <Check size={13} />}
                onClick={() => {
                  setGroup(o.v);
                  groupMenu.close();
                }}
              >
                {o.label}
              </MenuItem>
            ))}
          </Popover>
        )}
        <Chip active={doneView} onClick={() => setDoneView(!doneView)}>
          {doneView ? <Check /> : <CircleCheck />} Erledigt
          <span className="tabular text-muted">{doneCount}</span>
        </Chip>
        <div className="ml-auto" />
        <CategoryManager />
      </Toolbar>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={clsx(COLS, "px-3 pb-2 text-xs font-medium text-muted")}>
          <span />
          <span />
          <span>Eintrag</span>
          <span>Kategorie</span>
          <span />
          <span>{doneView ? "Erledigt" : "Erstellt"}</span>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            <div className="overflow-hidden rounded-xl border border-line bg-card">
              {groups.map((g) => {
                const isCollapsed = collapsed.has(g.key);
                return (
                  <Fragment key={g.key}>
                    {group && (
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
                        {!doneView && (
                          <button
                            title="Eintrag in dieser Kategorie anlegen"
                            className="ml-auto flex size-6 items-center justify-center rounded-md text-muted opacity-0 group-hover:opacity-100 hover:bg-elev hover:text-fg"
                            onClick={() => createAndOpenItem(data.hobby.id, g.categoryId ? [g.categoryId] : [])}
                          >
                            <Plus size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    {!isCollapsed &&
                      g.items.map((i) => (
                        <Row key={i.id} sortId={`${g.key}:${i.id}`} item={i} canDrag={canDrag} doneView={doneView} />
                      ))}
                  </Fragment>
                );
              })}
              {!doneView && <QuickAdd />}
              {doneView && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">Noch nichts erledigt</p>}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}

/** Bottom row: type a title and press Enter to add it right away; the plus opens the full window. */
function QuickAdd() {
  const { data } = useHobby();
  const [title, setTitle] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    await mutate(() => repo.createItem(data.hobby.id, { title: title.trim() }));
    setTitle("");
  };
  return (
    <div className="flex h-10 items-center gap-2 px-3 text-[13px]">
      <button
        title="Neuer Eintrag"
        className="ml-0.5 text-muted hover:text-fg"
        onClick={() => createAndOpenItem(data.hobby.id)}
      >
        <Plus size={14} />
      </button>
      <input
        className="h-8 flex-1 bg-transparent outline-none placeholder:text-muted"
        placeholder="Neuer Eintrag …"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
    </div>
  );
}

function Row({ item, sortId, canDrag, doneView }: { item: Item; sortId: string; canDrag: boolean; doneView: boolean }) {
  const { ref, style, handle, isDragging } = useSortableItem(sortId);
  const menu = useContextMenu();
  const date = doneView ? item.done_at : item.created_at;
  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      onClick={() => openItem(item.id)}
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
      <ItemCheck item={item} />
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={clsx("shrink-0 truncate font-medium", item.done_at && "text-muted line-through")}>
          {item.title || "Ohne Titel"}
        </span>
        {item.notes && (
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted">
            <StickyNote size={11} className="shrink-0" />
            <span className="truncate">{item.notes.split("\n")[0]}</span>
          </span>
        )}
      </span>
      <span className="min-w-0">
        <CategoryBadges ids={item.category_ids} max={2} />
      </span>
      <span>
        {item.url && (
          <IconButton
            label={item.url}
            className="size-6"
            onClick={(e) => {
              e.stopPropagation();
              openExternal(item.url);
            }}
          >
            <ExternalLink size={13} />
          </IconButton>
        )}
      </span>
      <span className="tabular truncate text-xs text-muted">
        {date ? new Date(date).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : "–"}
      </span>
    </div>
    {menu.at && <ItemMenu item={item} at={menu.at} onClose={menu.close} />}
    </>
  );
}
