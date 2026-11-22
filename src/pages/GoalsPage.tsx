import clsx from "clsx";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CalendarClock, Check, CircleCheck, GripVertical, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader } from "../components/Layout";
import { useSortableItem } from "../components/sortable";
import { Prop, Section } from "../components/ExerciseDialog";
import {
  Badge,
  Button,
  Chip,
  confirmDialog,
  CreateMoreToggle,
  DateInput,
  IconButton,
  Modal,
  ProgressBar,
  Select,
  Textarea,
  Toolbar,
  useCreateMore,
} from "../components/ui";
import * as repo from "../db/repo";
import type { Goal, GoalKind } from "../db/types";
import { deadlineState } from "../domain/progress";
import { playSound } from "../lib/audio";
import { mutate } from "../lib/store";

const KIND_LABEL: Record<GoalKind, string> = {
  manual: "Manuell abhaken",
  metric: "Messwert einer Übung",
  total_time: "Gesamtzeit einer Übung",
  exercise_done: "Übung abgeschlossen",
};

const COLS = "grid grid-cols-[1.5rem_1.25rem_minmax(0,1fr)_11rem_10rem_11rem_1.75rem] items-center gap-3";

/** Goals as a table like the exercise list, achieved goals in their own view. */
export function GoalsPage() {
  const { data } = useHobby();
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [doneView, setDoneView] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const q = query.trim().toLowerCase();
  const rows = data.goals.filter(
    (g) =>
      (g.status === "done") === doneView &&
      (!q || g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q)),
  );
  const doneCount = data.goals.filter((g) => g.status === "done").length;
  const canDrag = !q && !doneView;

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const active = data.goals.find((g) => g.id === e.active.id);
    const over = data.goals.find((g) => g.id === e.over!.id);
    if (!active || !over) return;
    const all = [...data.goals].sort((x, y) => x.position - y.position || x.id - y.id);
    const ids = arrayMove(
      all.map((g) => g.id),
      all.indexOf(active),
      all.indexOf(over),
    );
    await mutate(() => repo.reorder("goal", ids));
  };

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
        <Chip active={doneView} onClick={() => setDoneView(!doneView)}>
          {doneView ? <Check /> : <CircleCheck />} Erreicht
          <span className="tabular text-muted">{doneCount}</span>
        </Chip>
      </Toolbar>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className={clsx(COLS, "px-3 pb-2 text-xs font-medium text-muted")}>
          <span />
          <span />
          <span>Ziel</span>
          <span>Übung</span>
          <span>Deadline</span>
          <span>Fortschritt</span>
          <span />
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((g) => g.id)} strategy={verticalListSortingStrategy}>
            <div className="overflow-hidden rounded-xl border border-line bg-card">
              {rows.map((goal) => (
                <GoalRow key={goal.id} goal={goal} onEdit={() => setEditing(goal)} sortable={canDrag} />
              ))}
              {!doneView && (
                <button
                  onClick={() => setEditing("new")}
                  className="flex h-10 w-full items-center gap-2 px-3 text-left text-[13px] text-muted transition-colors hover:bg-elev/60 hover:text-fg"
                >
                  <Plus size={14} className="ml-0.5" /> Neues Ziel
                </button>
              )}
              {doneView && rows.length === 0 && <p className="py-10 text-center text-sm text-muted">Noch nichts erreicht</p>}
            </div>
          </SortableContext>
        </DndContext>
      </div>
      <GoalModal
        goal={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

export function DeadlineBadge({ deadline, done }: { deadline: string | null; done: boolean }) {
  const { state, daysLeft } = deadlineState(deadline, done, new Date());
  if (state === "none" || !deadline) return null;
  const date = new Date(deadline).toLocaleDateString("de-DE");
  if (state === "done") return <Badge color="#22c55e">Erreicht</Badge>;
  const color = state === "overdue" ? "#ef4444" : state === "soon" ? "#f59e0b" : undefined;
  const text =
    state === "overdue"
      ? `${-daysLeft!} T überfällig`
      : daysLeft === 0
        ? "heute"
        : `noch ${daysLeft} T`;
  return (
    <Badge color={color}>
      <CalendarClock size={11} /> {date} · {text}
    </Badge>
  );
}

export function GoalRow({
  goal,
  onEdit,
  compact,
  sortable,
}: {
  goal: Goal;
  onEdit?: () => void;
  compact?: boolean;
  sortable?: boolean;
}) {
  const { d } = useHobby();
  const r = d.goal(goal.id);
  const exercise = d.exercise(goal.exercise_id);
  const isDone = goal.status === "done";
  const drag = useSortableItem(goal.id);

  const toggle = async () => {
    await mutate(() =>
      repo.updateGoal(goal.id, {
        status: isDone ? "open" : "done",
        completed_at: isDone ? null : new Date().toISOString(),
      }),
    );
    if (!isDone) playSound("goal-completed");
  };

  if (compact)
    return (
      <div className="rounded-lg px-1 py-1.5">
        <div className="flex flex-wrap items-center gap-2">
          {isDone && <CircleCheck size={14} className="text-ok" />}
          <span className="text-sm font-medium">{goal.name}</span>
          <DeadlineBadge deadline={goal.deadline} done={isDone} />
        </div>
        {goal.kind !== "manual" && (
          <div className="mt-2 flex items-center gap-3">
            <ProgressBar value={r.progress} color={r.done ? "var(--ok)" : undefined} />
            <span className="tabular shrink-0 text-xs text-muted">{r.label}</span>
          </div>
        )}
      </div>
    );

  return (
    <div
      ref={drag.ref}
      style={drag.style}
      onClick={onEdit}
      className={clsx(COLS, "group h-11 cursor-pointer border-b border-line bg-card px-3 text-sm hover:bg-elev/60", drag.isDragging && "shadow-lg")}
    >
      <span
        {...(sortable ? drag.handle : {})}
        onClick={(e) => e.stopPropagation()}
        className={clsx("text-muted opacity-0", sortable && "cursor-grab group-hover:opacity-100")}
      >
        <GripVertical size={14} />
      </span>
      <button
        title={isDone ? "Wieder öffnen" : "Als erreicht markieren"}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
        className={clsx(
          "flex size-4 items-center justify-center rounded-full border transition-colors",
          isDone ? "border-ok bg-ok text-white" : "border-muted/60 hover:border-ok",
        )}
      >
        {isDone && <Check size={10} strokeWidth={3} />}
      </button>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className={clsx("shrink-0 truncate font-medium", isDone && "text-muted line-through")}>{goal.name}</span>
        {goal.description && <span className="truncate text-xs text-muted">{goal.description}</span>}
      </span>
      <span className="truncate text-muted">{exercise?.name ?? "–"}</span>
      <span className="min-w-0">{goal.deadline ? <DeadlineBadge deadline={goal.deadline} done={isDone} /> : <span className="text-muted">–</span>}</span>
      <span>
        {goal.kind !== "manual" ? (
          <span className="flex items-center gap-2" title={r.label}>
            <ProgressBar value={r.progress} color={r.done ? "var(--ok)" : undefined} />
            <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted">{Math.round(r.progress * 100)}%</span>
          </span>
        ) : (
          <span className="text-muted">–</span>
        )}
      </span>
      <IconButton
        label="Löschen"
        className="size-6 opacity-0 group-hover:opacity-100"
        onClick={async (e) => {
          e.stopPropagation();
          if (await confirmDialog(`Ziel „${goal.name}“ löschen?`)) await mutate(() => repo.deleteGoal(goal.id));
        }}
      >
        <Trash2 size={13} />
      </IconButton>
    </div>
  );
}

const hoursStr = (min: number | null) => (min == null ? "" : String(Math.round((min / 60) * 100) / 100));

function GoalModal({ goal, open, onClose }: { goal?: Goal; open: boolean; onClose: () => void }) {
  const { data, d } = useHobby();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [deadline, setDeadline] = useState("");
  const [kind, setKind] = useState<GoalKind>("manual");
  const [exercise, setExercise] = useState("");
  const [metric, setMetric] = useState("");
  const [target, setTarget] = useState("");
  const [more, setMore] = useCreateMore();
  const [round, setRound] = useState(0);

  const metrics = exercise ? d.metricsOf(Number(exercise)).filter((m) => m.kind !== "memo") : [];
  const selectedMetric = metrics.find((m) => String(m.id) === metric);
  const timeTarget = kind === "total_time" || (kind === "metric" && selectedMetric?.kind === "time");

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setDesc(goal?.description ?? "");
    setDeadline(goal?.deadline ?? "");
    setKind(goal?.kind ?? "manual");
    setExercise(goal?.exercise_id ? String(goal.exercise_id) : "");
    setMetric(goal?.metric_id ? String(goal.metric_id) : "");
    const m = data.metrics.find((x) => x.id === goal?.metric_id);
    const isTime = goal?.kind === "total_time" || m?.kind === "time";
    setTarget(isTime ? hoursStr(goal?.target_value ?? null) : (goal?.target_value?.toString() ?? ""));
  }, [open, goal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // pick the first metric of a newly chosen exercise and suggest its target
    if (kind !== "metric" || metrics.some((m) => String(m.id) === metric)) return;
    const m = metrics[0];
    setMetric(m ? String(m.id) : "");
    if (m?.target_value != null && !target)
      setTarget(m.kind === "time" ? hoursStr(m.target_value) : String(m.target_value));
  }, [exercise, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsExercise = kind !== "manual";
  const valid =
    name.trim() &&
    (!needsExercise || exercise) &&
    (kind !== "metric" || (metric && target)) &&
    (kind !== "total_time" || target);

  const submit = async () => {
    if (!valid) return;
    const raw = target.trim() === "" ? null : Number(target.replace(",", "."));
    const row = {
      name: name.trim(),
      description: desc,
      deadline: deadline || null,
      kind,
      exercise_id: needsExercise ? Number(exercise) : null,
      metric_id: kind === "metric" ? Number(metric) : null,
      target_value: raw == null ? null : timeTarget ? Math.round(raw * 60) : raw,
    };
    await mutate<unknown>(() =>
      goal ? repo.updateGoal(goal.id, row) : repo.createGoal({ ...row, hobby_id: data.hobby.id, phase_id: null, status: "open" }),
    );
    if (!goal && more) {
      // keep kind and exercise for the next goal
      setName("");
      setDesc("");
      setTarget("");
      setRound((r) => r + 1);
    } else onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-4xl"
      noPadding
      title={
        <span className="flex items-center gap-1.5 font-normal text-muted">
          {data.hobby.name}
          <span className="text-muted/50">/</span>
          <span className="font-medium text-fg">{goal ? "Ziel" : "Neues Ziel"}</span>
        </span>
      }
      headerRight={
        goal && (
          <IconButton
            label="Löschen"
            onClick={async () => {
              if (!(await confirmDialog(`Ziel „${goal.name}“ löschen?`))) return;
              onClose();
              await mutate(() => repo.deleteGoal(goal.id));
            }}
          >
            <Trash2 size={14} />
          </IconButton>
        )
      }
      footer={
        <>
          {!goal && <CreateMoreToggle on={more} onChange={setMore} />}
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            {goal ? "Speichern" : "Erstellen"}
          </Button>
        </>
      }
    >
      <div className="flex min-h-full items-stretch">
        <div className="min-w-0 flex-1 space-y-8 px-8 py-7">
          <textarea
            key={round}
            rows={1}
            autoFocus
            className="w-full resize-none bg-transparent text-2xl font-semibold tracking-tight outline-none [field-sizing:content] placeholder:text-muted/50"
            placeholder="Was willst du erreichen?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Section title="Beschreibung">
            <Textarea className="min-h-32" placeholder="Beschreibung…" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Section>
        </div>
        <aside className="flex w-80 shrink-0 flex-col gap-1.5 border-l border-line bg-panel/60 px-5 py-6 text-[13px]">
          <Prop label="Deadline">
            <DateInput ghost value={deadline} onChange={setDeadline} />
          </Prop>
          <Prop label="Messen über">
            <Select ghost value={kind} onChange={(e) => setKind(e.target.value as GoalKind)}>
              {(Object.keys(KIND_LABEL) as GoalKind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Prop>
          {needsExercise && (
            <Prop label="Übung">
              <Select ghost value={exercise} onChange={(e) => setExercise(e.target.value)}>
                <option value="">Wählen…</option>
                {data.exercises.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </Select>
            </Prop>
          )}
          {kind === "metric" && (
            <Prop label="Messwert">
              <Select ghost value={metric} onChange={(e) => setMetric(e.target.value)} disabled={metrics.length === 0}>
                {metrics.length === 0 && <option value="">Keine Messwerte</option>}
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Prop>
          )}
          {(kind === "metric" || kind === "total_time") && (
            <Prop label={timeTarget ? "Ziel (Std.)" : `Ziel${selectedMetric?.unit ? ` (${selectedMetric.unit})` : ""}`}>
              <input
                className="-ml-1.5 h-8 w-full rounded-lg bg-transparent px-1.5 text-[13px] outline-none hover:bg-elev focus:bg-elev"
                inputMode="decimal"
                placeholder="–"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Prop>
          )}
          {goal && goal.kind !== "manual" && (
            <div className="mt-4 border-t border-line pt-4">
              <div className="mb-2 flex justify-between text-xs text-muted">
                <span>Fortschritt</span>
                <span className="tabular">{d.goal(goal.id).label}</span>
              </div>
              <ProgressBar value={d.goal(goal.id).progress} color={d.goal(goal.id).done ? "var(--ok)" : undefined} />
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}
