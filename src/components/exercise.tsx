import clsx from "clsx";
import { ArrowRight, Repeat } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { replaceExerciseInRoutines, updateExercise } from "../db/repo";
import type { Exercise } from "../db/types";
import { playSound } from "../lib/audio";
import { mutate } from "../lib/store";
import { CategoryBadges } from "./categories";
import { useHobby } from "./HobbyContext";
import { Button, Field, Input, Modal, Select, toast } from "./ui";

/** Completes an exercise: it goes to the archive, the routines keep it. */
export async function completeExercise(exercise: Exercise) {
  await mutate(() => updateExercise(exercise.id, { status: "archived", completed_at: new Date().toISOString() }));
  playSound("goal-completed");
  toast(`„${exercise.name}" abgeschlossen`);
}

/** Completes an exercise and swaps it for a follow-up in every routine that contains it. */
export function CompleteExerciseModal({
  exercise,
  open,
  onClose,
}: {
  exercise: Exercise;
  open: boolean;
  onClose: () => void;
}) {
  const { d } = useHobby();
  const candidates = d.nextCandidates(exercise);
  const others = d.active.filter((e) => e.id !== exercise.id && !candidates.includes(e));
  const routines = d.routinesContaining(exercise.id);
  const [next, setNext] = useState<string>("");

  useEffect(() => {
    if (open) setNext(candidates[0] ? String(candidates[0].id) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, exercise.id]);

  const submit = async () => {
    const nextId = next ? Number(next) : null;
    if (!nextId) return;
    await mutate(async () => {
      await updateExercise(exercise.id, { status: "archived", completed_at: new Date().toISOString() });
      await replaceExerciseInRoutines(exercise.id, nextId);
      await updateExercise(nextId, { status: "active" });
    });
    playSound("goal-completed");
    const nextEx = d.exercise(nextId);
    toast(`Weiter mit „${nextEx?.name ?? ""}"`);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`„${exercise.name}" tauschen`}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={submit} disabled={!next}>
            <Repeat size={14} /> Abschließen & tauschen
          </Button>
        </>
      }
    >
      <Field label="Nächste Übung">
        <Select value={next} onChange={(e) => setNext(e.target.value)}>
          <option value="">Wählen …</option>
          {candidates.length > 0 && (
            <optgroup label="Vorschläge">
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id === exercise.successor_id ? "★ " : ""}
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
          {others.length > 0 && (
            <optgroup label="Andere Übungen">
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>
      {next && routines.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md border border-line px-3 py-2 text-sm">
          <span className="text-muted">{routines.map((r) => r.name).join(", ")}:</span>
          {exercise.name} <ArrowRight size={12} /> {d.exercise(Number(next))?.name}
        </div>
      )}
    </Modal>
  );
}

/** Search field with a result list for picking an exercise; keyboard friendly. */
export function ExercisePicker({
  exercises,
  value,
  onChange,
  onSubmit,
  placeholder = "Übung suchen…",
}: {
  exercises: Exercise[];
  value: number | null;
  onChange: (id: number | null) => void;
  onSubmit?: () => void;
  placeholder?: string;
}) {
  const { d } = useHobby();
  const selected = d.exercise(value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  // the list is drawn above everything (portal), so a window's scroll area doesn't cut it off
  const boxRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !boxRef.current) return setPos(null);
    const r = boxRef.current.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 12;
    const above = r.top - 12;
    setPos(
      below >= 220 || below >= above
        ? { left: r.left, width: r.width, top: r.bottom + 4, maxH: Math.min(320, below) }
        : { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4, maxH: Math.min(320, above) },
    );
  }, [open, query]);

  const q = query.trim().toLowerCase();
  const results = exercises
    .filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        e.category_ids.some((c) => d.category(c)?.name.toLowerCase().includes(q)),
    )
    .slice(0, 50);

  const pick = (e: Exercise) => {
    onChange(e.id);
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <Input
        value={open ? query : (selected?.name ?? "")}
        placeholder={placeholder}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
          if (value != null) onChange(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(results.length - 1, a + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === "Enter") {
            if (open && results[active]) pick(results[active]);
            else onSubmit?.();
          } else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && pos && createPortal(
        <div
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxH }}
          className="fixed z-[70] overflow-y-auto rounded-lg border border-line bg-card p-1 shadow-lg"
        >
          {results.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">Nichts gefunden</div>
          ) : (
            results.map((e, i) => (
              <button
                key={e.id}
                type="button"
                onMouseDown={(ev) => ev.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(e)}
                className={clsx(
                  "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
                  i === active && "bg-elev",
                )}
              >
                <span className="truncate">{e.name}</span>
                <CategoryBadges ids={e.category_ids} max={2} />
              </button>
            ))
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
