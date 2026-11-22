import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { PlanMenu, TopicMenu } from "../components/menus";
import { SortableContext, arrayMove, rectSortingStrategy, verticalListSortingStrategy } from "@dnd-kit/sortable";
import clsx from "clsx";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  EyeOff,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader } from "../components/Layout";
import { swallowNextClick, useSortableItem } from "../components/sortable";
import { createAndOpenTopic, StageButton, stageLabel } from "../components/TopicDialog";
import { Button, Chip, confirmDialog, IconButton, ProgressBar, Toolbar, useContextMenu } from "../components/ui";
import * as repo from "../db/repo";
import type { KnowledgeBase, Topic, TopicStage } from "../db/types";
import type { OutlineRow } from "../domain/derived";
import { indentItem, moveItem, outdentItem, type Placement } from "../domain/plan";
import { dateKey, parseDateKey } from "../domain/progress";
import { mutate } from "../lib/store";
import { openTopic } from "../lib/uiState";

const COLLAPSED_KEY = "hobby-manager-plan-collapsed";
const COLS = "grid grid-cols-[1.5rem_minmax(0,1fr)_6.5rem_8rem_6.5rem] items-center gap-3";

/** First line of the notes, shown next to the title. */
const notePreview = (content: string) =>
  content
    .split("\n")
    .map((l) => l.replace(/^\s*([-*]\s*(\[[ xX]\]\s*)?|#+\s*)/, "").trim())
    .find((l) => l) ?? "";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" });

function relativeDay(iso: string) {
  const days = Math.round((parseDateKey(dateKey(new Date())).getTime() - parseDateKey(dateKey(new Date(iso))).getTime()) / 864e5);
  if (days <= 0) return "heute";
  if (days === 1) return "gestern";
  if (days < 30) return `vor ${days} Tagen`;
  return fmtDate(iso);
}

const STAGE_RANK: Record<TopicStage, number> = { new: 0, learning: 1, understood: 2 };
const STAGE_COLOR: Record<TopicStage, string> = { new: "text-muted", learning: "text-accent", understood: "text-ok" };

/** Thin bar in three parts: understood, learning, new. */
function StageBar({ topics, className }: { topics: Topic[]; className?: string }) {
  const n = topics.length || 1;
  const understood = topics.filter((t) => t.stage === "understood").length;
  const learning = topics.filter((t) => t.stage === "learning").length;
  return (
    <div className={clsx("flex h-1.5 w-full overflow-hidden rounded-full bg-elev", className)}>
      <div className="h-full bg-ok transition-[width] duration-500" style={{ width: `${(understood / n) * 100}%` }} />
      <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${(learning / n) * 100}%` }} />
    </div>
  );
}

// ---------- Overview: one card per plan ----------

export function PlanPage() {
  const { data, base } = useHobby();
  const navigate = useNavigate();
  const [bases, setBases] = useState(data.knowledgeBases);
  useEffect(() => setBases(data.knowledgeBases), [data.knowledgeBases]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const create = async () => {
    const id = await mutate(() => repo.createKnowledgeBase(data.hobby.id, "Neuer Plan", Math.floor(Date.now() / 1000)));
    navigate(`${base}/plan/${id}?new=1`);
  };

  const onDragEnd = (e: DragEndEvent) => {
    swallowNextClick();
    if (!e.over || e.active.id === e.over.id) return;
    const ids = bases.map((b) => b.id);
    const next = arrayMove(ids, ids.indexOf(Number(e.active.id)), ids.indexOf(Number(e.over.id)));
    setBases(next.map((id) => bases.find((b) => b.id === id)!));
    mutate(() => repo.reorder("knowledge_base", next));
  };

  return (
    <>
      <HobbyHeader />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} onDragCancel={swallowNextClick}>
          <SortableContext items={bases.map((b) => b.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-4">
              {bases.map((b) => (
                <PlanCard key={b.id} kb={b} />
              ))}
              <button
                onClick={create}
                className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line text-sm text-muted transition-colors hover:border-muted/60 hover:bg-elev/40 hover:text-fg"
              >
                <Plus size={18} /> Neuer Plan
              </button>
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </>
  );
}

/** A plan at a glance: how far it is, what is being learned right now and what comes next. */
function PlanCard({ kb }: { kb: KnowledgeBase }) {
  const { d, base } = useHobby();
  const navigate = useNavigate();
  const { ref, style, handle, isDragging } = useSortableItem(kb.id);
  const menu = useContextMenu();
  const topics = d.planOutline(kb.id).map((r) => r.topic);
  const understood = topics.filter((t) => t.stage === "understood").length;
  const finished = topics.length > 0 && understood === topics.length;
  const current = topics.filter((t) => t.stage === "learning");
  const next = topics.find((t) => t.stage === "new");
  const lastDone = topics.reduce<Topic | null>((a, t) => (t.done_at && (!a || t.done_at > a.done_at!) ? t : a), null);

  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      {...handle}
      onClick={() => navigate(`${base}/plan/${kb.id}`)}
      className={clsx(
        "group flex min-h-48 cursor-pointer flex-col gap-4 rounded-xl border bg-tile p-4 text-left shadow-tile outline-none transition-[border-color,box-shadow] hover:border-tile-border-hover focus-visible:border-tile-border-hover",
        finished ? "border-ok/40" : "border-tile-border",
        isDragging && "shadow-lg",
      )}
    >
      <div className="flex items-start gap-2">
        <h3 className={clsx("min-w-0 flex-1 truncate text-[15px] font-semibold", finished && "text-muted")}>{kb.name}</h3>
        {finished && (
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-ok text-white">
            <Check size={12} strokeWidth={3} />
          </span>
        )}
      </div>

      {topics.length > 0 && (
        <div className="flex items-center gap-3">
          <StageBar topics={topics} />
          <span className="tabular shrink-0 text-xs text-muted">
            {understood}/{topics.length}
          </span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 text-[13px]">
        {topics.length === 0 && <span className="text-muted">Noch keine Themen</span>}
        {finished && <span className="text-ok">Alles verstanden</span>}
        {current.length > 0 && (
          <CardTopics label="Gerade dran" topics={current.slice(0, 2)} more={current.length - 2} />
        )}
        {next && <CardTopics label="Als Nächstes" topics={[next]} />}
      </div>

      {lastDone && (
        <span className="truncate text-[11px] text-muted">
          Zuletzt verstanden {relativeDay(lastDone.done_at!)}: {lastDone.title}
        </span>
      )}
    </div>
    {menu.at && <PlanMenu kb={kb} at={menu.at} onClose={menu.close} />}
    </>
  );
}

function CardTopics({ label, topics, more = 0 }: { label: string; topics: Topic[]; more?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      {topics.map((t) => (
        <span key={t.id} className="flex min-w-0 items-center gap-2">
          <StageButton topic={t} />
          <button
            className="min-w-0 truncate text-left hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              openTopic(t.id);
            }}
          >
            {t.title || "Ohne Titel"}
          </button>
        </span>
      ))}
      {more > 0 && <span className="pl-6 text-[11px] text-muted">+ {more} weitere</span>}
    </div>
  );
}

// ---------- One plan: all topics as a table ----------

type SortKey = "order" | "title" | "stage" | "sub" | "done";

function loadSet(key: string) {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set<number>();
  }
}

export function PlanBasePage() {
  const { data, base } = useHobby();
  const kb = data.knowledgeBases.find((k) => k.id === Number(useParams().baseId));
  if (!kb) return <Navigate to={`${base}/plan`} replace />;
  return <PlanBaseView key={kb.id} kb={kb} />;
}

function PlanBaseView({ kb }: { kb: KnowledgeBase }) {
  const { d, data, base } = useHobby();
  const navigate = useNavigate();
  const isNew = useSearchParams()[0].has("new");
  const outline = d.planOutline(kb.id);
  const topics = outline.map((r) => r.topic);
  const done = topics.filter((t) => t.done_at).length;
  const [name, setName] = useState(kb.name);
  useEffect(() => setName(kb.name), [kb.name]);
  const [query, setQuery] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "order", asc: true });
  const [collapsed, setCollapsed] = useState(() => loadSet(COLLAPSED_KEY));
  const toggle = (id: number) => {
    const next = new Set(collapsed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]));
    } catch {
      // ignore
    }
  };

  const flat = sort.key !== "order" || !!query.trim();
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (t: Topic) => !q || t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
    const subOf = (t: Topic) => {
      const sub = d.subtree(t.id).slice(1);
      return sub.length ? sub.filter((x) => x.done_at).length / sub.length : -1;
    };
    if (flat) {
      const list = outline.filter((r) => matches(r.topic) && !(hideDone && r.topic.done_at)).map((r) => ({ ...r, depth: 0 }));
      if (sort.key === "order") return list;
      const val = (t: Topic): string | number => {
        switch (sort.key) {
          case "title":
            return t.title.toLowerCase();
          case "stage":
            return STAGE_RANK[t.stage];
          case "sub":
            return subOf(t);
          default:
            return t.done_at ?? (sort.asc ? "9999" : "");
        }
      };
      return list.sort((a, b) => {
        const va = val(a.topic);
        const vb = val(b.topic);
        const r = va < vb ? -1 : va > vb ? 1 : 0;
        return sort.asc ? r : -r;
      });
    }
    // outline order: an understood item still shows while something below it is open (it holds the structure)
    const out: OutlineRow[] = [];
    let skipDepth = Infinity;
    for (const r of outline) {
      if (r.depth > skipDepth) continue;
      skipDepth = Infinity;
      if (hideDone && r.topic.done_at && d.subtree(r.topic.id).every((t) => t.done_at)) {
        skipDepth = r.depth;
        continue;
      }
      out.push(r);
      if (collapsed.has(r.topic.id)) skipDepth = r.depth;
    }
    return out;
  }, [outline, query, hideDone, sort, collapsed, flat, d]);

  const remove = async () => {
    if (!(await confirmDialog(`Plan „${kb.name}“ mit ${outline.length} Themen löschen?`))) return;
    await mutate(() => repo.deleteKnowledgeBase(kb.id));
    navigate(`${base}/plan`);
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const apply = (places: Placement[] | null) => places && mutate(() => repo.placeTopics(places, data.topics));
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    apply(moveItem(outline, Number(e.active.id), Number(e.over.id)));
  };

  const Head = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <button
      className={clsx("flex items-center gap-1 text-left whitespace-nowrap hover:text-fg", sort.key === k && "text-fg", className)}
      onClick={() =>
        setSort((s) => (s.key !== k ? { key: k, asc: true } : s.asc ? { key: k, asc: false } : { key: "order", asc: true }))
      }
    >
      {label}
      {sort.key === k && (sort.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  return (
    <>
      <HobbyHeader trail={[{ label: "Plan", to: `${base}/plan` }, { label: kb.name }]} />
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
        <Chip active={hideDone} onClick={() => setHideDone(!hideDone)}>
          {hideDone ? <Check /> : <EyeOff />} Verstandene ausblenden
          <span className="tabular text-muted">{done}</span>
        </Chip>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={remove}>
            <Trash2 size={13} /> Plan löschen
          </Button>
        </div>
      </Toolbar>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="mb-4 flex items-center gap-2">
          <IconButton label="Zurück zu allen Plänen" onClick={() => navigate(`${base}/plan`)}>
            <ArrowLeft size={16} />
          </IconButton>
          <input
            autoFocus={isNew}
            onFocus={(e) => isNew && e.target.select()}
            className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-1 text-2xl font-semibold tracking-tight outline-none hover:bg-elev/60 focus:bg-elev/60"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() =>
              name.trim() && name !== kb.name
                ? mutate(() => repo.updateKnowledgeBase(kb.id, { name: name.trim() }))
                : setName(kb.name)
            }
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          {topics.length > 0 && (
            <span className="flex w-56 shrink-0 items-center gap-3 text-sm text-muted">
              <StageBar topics={topics} />
              <span className="tabular shrink-0">
                {done}/{topics.length}
              </span>
            </span>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-line bg-card">
          <div className={clsx(COLS, "h-9 border-b border-line bg-panel px-3 text-xs font-medium text-muted")}>
            <span />
            <Head k="title" label="Thema" />
            <Head k="stage" label="Stand" />
            <Head k="sub" label="Unterthemen" />
            <Head k="done" label="Verstanden" />
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={rows.map((r) => r.topic.id)} strategy={verticalListSortingStrategy}>
              {rows.map((r) => (
                <ItemRow
                  key={r.topic.id}
                  row={r}
                  collapsed={collapsed.has(r.topic.id)}
                  canEdit={!flat}
                  onToggle={() => toggle(r.topic.id)}
                  onIndent={() => apply(indentItem(outline, r.topic.id))}
                  onOutdent={() => apply(outdentItem(outline, r.topic.id))}
                />
              ))}
            </SortableContext>
          </DndContext>
          {flat && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">Nichts gefunden</p>}
          <QuickAdd kb={kb} />
        </div>
      </div>
    </>
  );
}

function QuickAdd({ kb }: { kb: KnowledgeBase }) {
  const [title, setTitle] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    await mutate(() => repo.createTopic({ base_id: kb.id, title: title.trim(), position: Math.floor(Date.now() / 1000) }));
    setTitle("");
  };
  return (
    <div className="flex h-10 items-center gap-2 px-3">
      <button title="Neues Thema" className="ml-[34px] text-muted hover:text-fg" onClick={() => createAndOpenTopic(kb.id)}>
        <Plus size={14} />
      </button>
      <input
        className="h-8 flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted/70"
        placeholder="Neues Thema …"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
      />
    </div>
  );
}

function ItemRow({
  row,
  collapsed,
  canEdit,
  onToggle,
  onIndent,
  onOutdent,
}: {
  row: OutlineRow;
  collapsed: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onIndent: () => void;
  onOutdent: () => void;
}) {
  const { d } = useHobby();
  const { topic: t, depth, children } = row;
  const { ref, style, handle, isDragging } = useSortableItem(t.id);
  const menu = useContextMenu();
  const sub = d.subtree(t.id).slice(1);
  const subDone = sub.filter((x) => x.done_at).length;
  const done = !!t.done_at;
  const preview = notePreview(t.content);

  return (
    <>
    <div
      onContextMenu={menu.onContextMenu}
      ref={ref}
      style={style}
      tabIndex={0}
      onClick={() => openTopic(t.id)}
      onKeyDown={(e) => {
        if (e.key === "Tab" && canEdit) {
          e.preventDefault();
          if (e.shiftKey) onOutdent();
          else onIndent();
        } else if (e.key === "Enter") openTopic(t.id);
      }}
      className={clsx(
        COLS,
        "group h-10 cursor-pointer border-b border-line bg-card px-3 text-sm outline-none hover:bg-elev/60 focus-visible:bg-elev/60",
        isDragging && "shadow-lg",
      )}
    >
      <span
        {...(canEdit ? handle : {})}
        onClick={(e) => e.stopPropagation()}
        className={clsx("text-muted opacity-0", canEdit && "cursor-grab group-hover:opacity-100")}
      >
        <GripVertical size={14} />
      </span>
      <span className="flex min-w-0 items-center gap-2.5">
        <span style={{ width: depth * 22 }} className="shrink-0" />
        <span className="flex w-3.5 shrink-0 justify-center">
          {children.length > 0 && canEdit && (
            <button
              aria-label={collapsed ? "Aufklappen" : "Zuklappen"}
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="text-muted hover:text-fg"
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
        </span>
        <StageButton topic={t} />
        <span className={clsx("max-w-[60%] shrink-0 truncate", depth === 0 && "font-medium", done && "text-muted")}>
          {t.title || "Ohne Titel"}
        </span>
        {preview && <span className="min-w-0 truncate text-xs text-muted">{preview}</span>}
        {canEdit && (
          <span className="ml-auto flex shrink-0 items-center opacity-0 group-hover:opacity-100">
            <IconButton
              label="Ausrücken (Umschalt+Tab)"
              className="size-6"
              disabled={depth === 0}
              onClick={(e) => {
                e.stopPropagation();
                onOutdent();
              }}
            >
              <IndentDecrease size={13} />
            </IconButton>
            <IconButton
              label="Einrücken (Tab)"
              className="size-6"
              onClick={(e) => {
                e.stopPropagation();
                onIndent();
              }}
            >
              <IndentIncrease size={13} />
            </IconButton>
            <IconButton
              label="Unterthema anlegen"
              className="size-6"
              onClick={(e) => {
                e.stopPropagation();
                createAndOpenTopic(t.base_id, t.id);
              }}
            >
              <Plus size={13} />
            </IconButton>
          </span>
        )}
      </span>
      <span className={clsx("text-xs", STAGE_COLOR[t.stage])}>{stageLabel(t.stage)}</span>
      <span>
        {sub.length > 0 && (
          <span className="flex items-center gap-2">
            <ProgressBar value={subDone / sub.length} color={subDone === sub.length ? "var(--ok)" : undefined} />
            <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted">
              {subDone}/{sub.length}
            </span>
          </span>
        )}
      </span>
      <span className="tabular truncate text-xs text-muted">{t.done_at ? fmtDate(t.done_at) : ""}</span>
    </div>
    {menu.at && <TopicMenu topic={t} at={menu.at} onClose={menu.close} />}
    </>
  );
}
