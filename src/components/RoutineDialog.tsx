import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { Archive, ArchiveRestore, Copy, GripVertical, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as repo from "../db/repo";
import type { Routine, RoutineItem } from "../db/types";
import { formatMinutes } from "../domain/progress";
import { mutate } from "../lib/store";
import { closeRoutine, openExerciseFromRoutine, openRoutine, useUi } from "../lib/uiState";
import { CategoryBadges } from "./categories";
import { ExercisePicker } from "./exercise";
import { DialogBackButton, Prop, Section } from "./ExerciseDialog";
import { useHobby } from "./HobbyContext";
import { Button, confirmDialog, CreateMoreToggle, IconButton, Modal, Muted, Textarea, useCreateMore } from "./ui";

/** Creates an empty routine and opens it in the window right away. */
export async function createAndOpenRoutine(hobbyId: number) {
  const id = await mutate(() => repo.createRoutine({ hobby_id: hobbyId, name: "", description: "" }));
  openRoutine(id, true);
}

export function RoutineDialog() {
  const { routine: open } = useUi();
  const { data } = useHobby();
  const routine = open ? data.routines.find((r) => r.id === open.id) : undefined;
  if (!open || !routine) return null;
  return <RoutineWindow key={routine.id} routine={routine} isNew={open.isNew} />;
}

/** Window of a routine, built like the exercise window: content left, properties right. */
function RoutineWindow({ routine, isNew }: { routine: Routine; isNew: boolean }) {
  const { d, data, base } = useHobby();
  const navigate = useNavigate();
  const [name, setName] = useState(routine.name);
  const [desc, setDesc] = useState(routine.description);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setName(routine.name), [routine.name]);

  const items = d.routineItems(routine.id);
  const total = items.reduce((a, i) => a + i.duration_min, 0);
  const sessions = data.sessions.filter((s) => s.routine_id === routine.id && s.ended_at);
  const last = sessions.at(-1);

  const save = (p: Partial<Routine>) => mutate(() => repo.updateRoutine(routine.id, p));
  const saveName = async () => {
    if (name.trim() && name.trim() !== routine.name) await save({ name: name.trim() });
  };
  const discard = async () => {
    closeRoutine();
    await mutate(() => repo.deleteRoutine(routine.id));
  };
  const close = async () => {
    if (isNew && !name.trim()) return discard();
    await saveName();
    if (desc !== routine.description) await save({ description: desc });
    closeRoutine();
  };
  const [more, setMore] = useCreateMore();
  const create = async () => {
    if (!name.trim()) return titleRef.current?.focus();
    await close();
    if (more) await createAndOpenRoutine(data.hobby.id);
  };
  const duplicate = async () => {
    await saveName();
    if (desc !== routine.description) await save({ description: desc });
    const id = await mutate(() => repo.duplicateRoutine(routine.id));
    openRoutine(id);
  };
  const remove = async () => {
    if (!(await confirmDialog(`Routine „${routine.name}“ löschen? Übungen und Verlauf bleiben erhalten.`))) return;
    closeRoutine();
    await mutate(() => repo.deleteRoutine(routine.id));
  };

  return (
    <Modal
      open
      onClose={close}
      width="max-w-4xl"
      noPadding
      title={
        <span className="flex items-center gap-1.5 font-normal text-muted">
          <DialogBackButton />
          {data.hobby.name}
          <span className="text-muted/50">/</span>
          <span className="font-medium text-fg">{isNew ? "Neue Routine" : "Routine"}</span>
          {routine.archived_at && <span className="ml-1 rounded-md border border-line px-1.5 text-xs">Archiviert</span>}
        </span>
      }
      headerRight={
        !isNew && (
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={items.length === 0}
              onClick={async () => {
                await close();
                navigate(`${base}/practice/routine/${routine.id}`);
              }}
            >
              <Play size={13} /> Starten
            </Button>
            <IconButton label="Kopieren" onClick={duplicate}>
              <Copy size={14} />
            </IconButton>
            <IconButton
              label={routine.archived_at ? "Wiederherstellen" : "Archivieren"}
              onClick={() => save({ archived_at: routine.archived_at ? null : new Date().toISOString() })}
            >
              {routine.archived_at ? <ArchiveRestore size={14} /> : <Archive size={14} />}
            </IconButton>
            <IconButton label="Löschen" onClick={remove}>
              <Trash2 size={14} />
            </IconButton>
          </div>
        )
      }
      footer={
        isNew && (
          <>
            <CreateMoreToggle on={more} onChange={setMore} />
            <Button variant="ghost" onClick={discard}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={create} disabled={!name.trim()}>
              Erstellen
            </Button>
          </>
        )
      }
    >
      <div className="flex min-h-full items-stretch">
        <div className="min-w-0 flex-1 space-y-8 px-8 py-7">
          <textarea
            ref={titleRef}
            rows={1}
            autoFocus={isNew}
            className="w-full resize-none bg-transparent text-2xl font-semibold tracking-tight outline-none [field-sizing:content] placeholder:text-muted/50"
            placeholder="Name der Routine"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !isNew && saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
          <Section title="Beschreibung">
            <Textarea
              className="min-h-20"
              placeholder="Beschreibung…"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={() => desc !== routine.description && save({ description: desc })}
            />
          </Section>
          <Section title="Ablauf">
            <ItemList routine={routine} items={items} />
          </Section>
        </div>
        <aside className="w-72 shrink-0 border-l border-line bg-panel/60 px-5 py-6">
          <div className="flex flex-col gap-1.5 text-[13px]">
            <Prop label="Dauer">
              <span className="tabular block pt-1.5">{formatMinutes(total)}</span>
            </Prop>
            <Prop label="Übungen">
              <span className="tabular block pt-1.5">{items.length}</span>
            </Prop>
            <Prop label="Gemacht">
              <span className="tabular block pt-1.5">{sessions.length}×</span>
            </Prop>
            <Prop label="Zuletzt">
              <span className="block pt-1.5">
                {last
                  ? new Date(last.started_at).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })
                  : "–"}
              </span>
            </Prop>
          </div>
          {total > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-[13px] text-muted">Zeitverteilung</div>
              <TimeBar items={items} className="h-2" />
            </div>
          )}
        </aside>
      </div>
    </Modal>
  );
}

/** One coloured segment per exercise (colour of its first category), width = planned minutes. */
export function TimeBar({ items, className }: { items: RoutineItem[]; className?: string }) {
  const { d } = useHobby();
  return (
    <div className={clsx("flex gap-0.5 overflow-hidden rounded-full", className)}>
      {items.map((i) => (
        <span
          key={i.id}
          title={`${d.exercise(i.exercise_id)?.name ?? ""} · ${formatMinutes(i.duration_min)}`}
          className="h-full min-w-1"
          style={{
            flexGrow: i.duration_min,
            backgroundColor: d.category(d.exercise(i.exercise_id)?.category_ids[0])?.color ?? "var(--bar)",
            opacity: 0.75,
          }}
        />
      ))}
    </div>
  );
}

function ItemList({ routine, items: serverItems }: { routine: Routine; items: RoutineItem[] }) {
  const { d } = useHobby();
  // Local order so drag & drop feels instant; resynced whenever the data reloads.
  const [items, setItems] = useState<RoutineItem[]>(serverItems);
  useEffect(() => setItems(serverItems), [d]); // eslint-disable-line react-hooks/exhaustive-deps
  const [addExercise, setAddExercise] = useState<number | null>(null);
  const [addMinutes, setAddMinutes] = useState("10");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const next = arrayMove(
      items,
      items.findIndex((i) => i.id === e.active.id),
      items.findIndex((i) => i.id === e.over!.id),
    );
    setItems(next);
    await mutate(() => repo.reorderRoutineItems(next.map((i) => i.id)));
  };

  const add = async () => {
    if (!addExercise) return;
    await mutate(() =>
      repo.addRoutineItem({
        routine_id: routine.id,
        exercise_id: addExercise,
        position: items.length,
        duration_min: Math.max(1, Number(addMinutes.replace(",", ".")) || 10),
      }),
    );
    setAddExercise(null);
  };

  return (
    <div className="flex flex-col gap-3">
      {items.length === 0 ? (
        <Muted>Noch keine Übungen.</Muted>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <ol className="overflow-hidden rounded-lg border border-line">
              {items.map((item, idx) => (
                <ItemRow key={item.id} item={item} index={idx} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <ExercisePicker exercises={d.active} value={addExercise} onChange={setAddExercise} onSubmit={add} />
        </div>
        <div className="flex h-8 items-center gap-1 rounded-lg border border-line bg-card px-2 shadow-xs">
          <input
            className="tabular w-8 bg-transparent text-right text-sm outline-none"
            inputMode="decimal"
            value={addMinutes}
            onChange={(e) => setAddMinutes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <span className="text-xs text-muted">min</span>
        </div>
        <Button onClick={add} disabled={!addExercise}>
          <Plus size={14} /> Hinzufügen
        </Button>
      </div>
    </div>
  );
}

function ItemRow({ item, index }: { item: RoutineItem; index: number }) {
  const { d } = useHobby();
  const ex = d.exercise(item.exercise_id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [minutes, setMinutes] = useState(String(item.duration_min));
  useEffect(() => setMinutes(String(item.duration_min)), [item.duration_min]);
  const finished = ex?.status === "archived";
  const ready = ex && !finished && d.completion(ex).complete;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={clsx(
        "group flex h-10 items-center gap-2 border-b border-line bg-card px-2 last:border-b-0",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted opacity-0 group-hover:opacity-100 active:cursor-grabbing"
        aria-label="Verschieben"
      >
        <GripVertical size={14} />
      </button>
      <span className="tabular w-4 text-center text-xs text-muted">{index + 1}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          onClick={() => openExerciseFromRoutine(item.exercise_id, item.routine_id)}
          className="truncate text-left text-sm font-medium hover:underline"
        >
          {ex?.name ?? "Gelöscht"}
        </button>
        {ex && <CategoryBadges ids={ex.category_ids} max={2} />}
        {ready && <span className="text-[11px] text-ok">Kriterium erreicht</span>}
        {finished && <span className="text-[11px] text-warn">Archiviert</span>}
      </div>
      <div className="flex items-center gap-1">
        <input
          className="tabular h-7 w-12 rounded-md border border-transparent bg-transparent px-1.5 text-right text-sm outline-none hover:border-input focus:border-ring"
          inputMode="decimal"
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          onBlur={() => {
            const v = Math.max(1, Number(minutes.replace(",", ".")) || item.duration_min);
            if (v !== item.duration_min) mutate(() => repo.updateRoutineItem(item.id, { duration_min: v }));
            else setMinutes(String(item.duration_min));
          }}
        />
        <span className="text-xs text-muted">min</span>
      </div>
      <IconButton
        label="Aus Routine entfernen"
        className="opacity-0 group-hover:opacity-100"
        onClick={() => mutate(() => repo.deleteRoutineItem(item.id))}
      >
        <Trash2 size={14} />
      </IconButton>
    </li>
  );
}
