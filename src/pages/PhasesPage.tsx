import clsx from "clsx";
import { Flag, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader } from "../components/Layout";
import { SortableList, useSortableItem } from "../components/sortable";
import { Button, confirmDialog, CreateMoreToggle, DateInput, Field, Input, Modal, ProgressRing, Textarea, Toolbar, useCreateMore } from "../components/ui";
import * as repo from "../db/repo";
import type { Phase } from "../db/types";
import { dateKey, daysBetween, parseDateKey } from "../domain/progress";
import { mutate } from "../lib/store";

const ROW_H = 44;
const NAME_W = 280;
const ZOOMS = [
  { label: "Jahr", dayW: 2.5 },
  { label: "Quartal", dayW: 6 },
  { label: "Monat", dayW: 14 },
  { label: "Woche", dayW: 32 },
];
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const fmt = (key: string | null) =>
  key ? parseDateKey(key).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" }) : "offen";

type Drag = { id: number; mode: "move" | "start" | "end"; x0: number; dx: number };

export function PhasesPage() {
  const { data, d } = useHobby();
  const [editing, setEditing] = useState<Phase | "new" | null>(null);
  const [zoom, setZoom] = useState(2);
  const [viewW, setViewW] = useState(0);
  const [drag, setDrag] = useState<Drag | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayW = ZOOMS[zoom].dayW;
  const todayKey = dateKey(new Date());
  const active = d.activePhase();

  // Time range: two weeks before the earliest to six weeks after the latest date.
  const { start, days } = useMemo(() => {
    const keys = data.phases.flatMap((p) => [p.start_date, p.end_date]).filter(Boolean) as string[];
    keys.push(...data.goals.map((g) => g.deadline).filter(Boolean) as string[], todayKey);
    keys.sort();
    const s = addDays(parseDateKey(keys[0]), -14);
    const e = addDays(parseDateKey(keys[keys.length - 1]), 42);
    // always reach the right edge of the window, no empty space next to the timeline
    const fill = Math.ceil(Math.max(0, viewW - NAME_W) / dayW) + 1;
    return { start: s, days: Math.max(daysBetween(s, e) + 1, fill) };
  }, [data.phases, data.goals, todayKey, viewW, dayW]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const offset = (key: string) => daysBetween(start, parseDateKey(key));

  const scrollToToday = () => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = Math.max(0, offset(todayKey) * dayW - el.clientWidth / 3);
  };
  useEffect(scrollToToday, [dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dragging bars: move the whole phase or one of its ends.
  useEffect(() => {
    if (!drag) return;
    let g = drag;
    const onMove = (e: PointerEvent) => {
      g = { ...g, dx: e.clientX - g.x0 };
      setDrag(g);
    };
    const onUp = () => {
      setDrag(null);
      const shift = Math.round(g.dx / dayW);
      const p = data.phases.find((x) => x.id === g.id);
      if (!p || shift === 0) return;
      const s = parseDateKey(p.start_date ?? p.end_date!);
      const e = parseDateKey(p.end_date ?? p.start_date!);
      let ns = s;
      let ne = e;
      if (g.mode === "move") (ns = addDays(s, shift)), (ne = addDays(e, shift));
      else if (g.mode === "start") ns = addDays(s, Math.min(shift, daysBetween(s, e)));
      else ne = addDays(e, Math.max(shift, -daysBetween(s, e)));
      mutate(() => repo.updatePhase(p.id, { start_date: dateKey(ns), end_date: dateKey(ne) }));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag?.id, dayW]); // eslint-disable-line react-hooks/exhaustive-deps

  const width = days * dayW;
  const dayList = Array.from({ length: days }, (_, i) => addDays(start, i));

  return (
    <>
      <HobbyHeader />
      <Toolbar>
        <Button size="sm" variant="ghost" onClick={scrollToToday}>
          Heute
        </Button>
        <div className="flex h-7 items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
          {ZOOMS.map((z, i) => (
            <button
              key={z.label}
              onClick={() => setZoom(i)}
              className={clsx(
                "h-6 rounded-[7px] px-2.5 text-[13px] font-medium",
                zoom === i ? "bg-elev text-fg shadow-xs" : "text-muted hover:text-fg",
              )}
            >
              {z.label}
            </button>
          ))}
        </div>
      </Toolbar>

      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
          <div className="flex min-h-full" style={{ width: width + NAME_W }}>
            {/* names, sortable */}
            <div className="sticky left-0 z-20 shrink-0 border-r border-line bg-bg" style={{ width: NAME_W }}>
              <div className="sticky top-0 z-10 h-11 border-b border-line bg-bg" />
              <SortableList items={data.phases} onReorder={(ids) => mutate(() => repo.reorder("phase", ids))}>
                {(phases) => phases.map((p) => <NameRow key={p.id} phase={p} active={p.id === active?.id} onOpen={() => setEditing(p)} />)}
              </SortableList>
              <button
                onClick={() => setEditing("new")}
                style={{ height: ROW_H }}
                className="flex w-full items-center gap-2 px-4 text-left text-[13px] text-muted hover:bg-elev/60 hover:text-fg"
              >
                <Plus size={14} /> Neue Phase
              </button>
            </div>

            {/* timeline */}
            <div className="relative" style={{ width }}>
              <div className="sticky top-0 z-10 flex h-11 border-b border-line bg-bg">
                {dayList.map((day) => {
                  // month label on the 1st; at the very start only if there is room before the next month
                  const left = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate() - day.getDate() + 1;
                  const first = day.getDate() === 1 || (day.getTime() === start.getTime() && left * dayW > 64);
                  const label = dayW >= 28 || (dayW >= 14 && day.getDay() === 1);
                  return (
                    <div
                      key={day.getTime()}
                      style={{ width: dayW }}
                      className={clsx(
                        "relative flex shrink-0 flex-col items-center justify-end pb-1 text-[10px]",
                        dateKey(day) === todayKey ? "font-bold text-fg" : "text-muted/80",
                      )}
                    >
                      {first && (
                        <span className="absolute top-1 left-0.5 font-medium whitespace-nowrap text-fg">
                          {MONTHS[day.getMonth()]} {day.getFullYear()}
                        </span>
                      )}
                      {label && day.getDate()}
                    </div>
                  );
                })}
              </div>

              {/* background: month lines and today */}
              <div className="pointer-events-none absolute inset-x-0 top-11 bottom-0">
                {dayList.map((day, i) =>
                  day.getDate() === 1 ? (
                    <div key={i} className="absolute inset-y-0 border-l border-line" style={{ left: i * dayW }} />
                  ) : null,
                )}
                <div
                  className="absolute inset-y-0 w-px bg-bad/60"
                  style={{ left: offset(todayKey) * dayW + dayW / 2 }}
                />
              </div>

              {data.phases.map((p) => {
                const s = p.start_date ?? p.end_date;
                const e = p.end_date ?? p.start_date;
                let left = s ? offset(s) * dayW : 0;
                let w = s && e ? (offset(e) - offset(s) + 1) * dayW : 0;
                if (drag?.id === p.id) {
                  const dx = Math.round(drag.dx / dayW) * dayW;
                  if (drag.mode === "move") left += dx;
                  if (drag.mode === "start") {
                    const c = Math.min(dx, w - dayW);
                    left += c;
                    w -= c;
                  }
                  if (drag.mode === "end") w = Math.max(dayW, w + dx);
                }
                const startDrag = (mode: Drag["mode"]) => (ev: React.PointerEvent) => {
                  ev.stopPropagation();
                  ev.preventDefault();
                  setDrag({ id: p.id, mode, x0: ev.clientX, dx: 0 });
                };
                // goals belong to no phase; the ones due within its time range are shown on it
                const goals = data.goals.filter(
                  (g) => g.deadline && p.start_date && p.end_date && g.deadline >= p.start_date && g.deadline <= p.end_date,
                );
                const isActive = p.id === active?.id;
                return (
                  <div
                    key={p.id}
                    style={{ height: ROW_H }}
                    className="relative border-b border-line"
                    onClick={(ev) => {
                      if (s) return;
                      // phase without dates: a click sets a four week range from the clicked day
                      const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
                      const day = addDays(start, Math.floor((ev.clientX - rect.left) / dayW));
                      mutate(() => repo.updatePhase(p.id, { start_date: dateKey(day), end_date: dateKey(addDays(day, 27)) }));
                    }}
                  >
                    {s ? (
                      <div
                        onPointerDown={startDrag("move")}
                        onDoubleClick={() => setEditing(p)}
                        title={`${p.name}\n${fmt(p.start_date)} – ${fmt(p.end_date)}`}
                        className={clsx(
                          "group absolute top-2 flex cursor-grab items-center overflow-hidden rounded-md border text-xs font-medium select-none active:cursor-grabbing",
                          isActive ? "border-accent/50 text-fg" : "border-line bg-elev text-fg/80",
                        )}
                        style={{
                          left,
                          width: w,
                          height: ROW_H - 16,
                          backgroundColor: isActive ? "color-mix(in srgb, var(--accent) 18%, transparent)" : undefined,
                        }}
                      >
                        <span onPointerDown={startDrag("start")} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize hover:bg-fg/10" />
                        <span className="truncate px-2.5">{w > 50 ? p.name : ""}</span>
                        <span onPointerDown={startDrag("end")} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize hover:bg-fg/10" />
                      </div>
                    ) : (
                      <div className="flex h-full cursor-copy items-center hover:bg-elev/60">
                        <span className="sticky left-[292px] text-xs text-muted">Kein Zeitraum – klicken zum Setzen</span>
                      </div>
                    )}
                    {goals.map((g) => (
                      <span
                        key={g.id}
                        title={`Ziel: ${g.name} (${fmt(g.deadline)})`}
                        className={clsx(
                          "pointer-events-auto absolute top-1/2 z-10 flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card shadow-xs",
                          g.status === "done" ? "border-ok text-ok" : "border-line text-muted",
                        )}
                        style={{ left: offset(g.deadline!) * dayW + dayW / 2 }}
                      >
                        <Flag size={10} />
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
      </div>

      <PhaseModal
        phase={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

/** How far the phase is in time, 0–1 (null without a full date range). */
function timeProgress(p: Phase) {
  if (!p.start_date || !p.end_date) return null;
  const total = Math.max(1, daysBetween(parseDateKey(p.start_date), parseDateKey(p.end_date)) + 1);
  return Math.min(1, Math.max(0, (daysBetween(parseDateKey(p.start_date), new Date()) + 1) / total));
}

function NameRow({ phase: p, active, onOpen }: { phase: Phase; active: boolean; onOpen: () => void }) {
  const { ref, style, handle, isDragging } = useSortableItem(p.id);
  const progress = timeProgress(p);
  const pct = Math.round((progress ?? 0) * 100);
  return (
    <div
      ref={ref}
      style={{ ...style, height: ROW_H }}
      onClick={onOpen}
      className={clsx(
        "group flex cursor-pointer items-center gap-2 border-b border-line bg-bg px-2 text-sm hover:bg-elev/60",
        isDragging && "shadow-lg",
      )}
    >
      <span {...handle} onClick={(e) => e.stopPropagation()} className="cursor-grab text-muted opacity-0 group-hover:opacity-100">
        <GripVertical size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{p.name}</span>
        <span className="block truncate text-[11px] text-muted">
          {fmt(p.start_date)} – {fmt(p.end_date)}
        </span>
      </span>
      {progress != null && (
        <span className="group/ring flex shrink-0 items-center gap-1.5 py-2 pl-2" title={`${pct}% der Phase vorbei`}>
          <span className="tabular text-[11px] text-muted opacity-0 transition-opacity group-hover/ring:opacity-100">{pct}%</span>
          <ProgressRing value={progress} size={16} className={active ? "text-accent" : "text-muted"} />
        </span>
      )}
    </div>
  );
}

function PhaseModal({ phase, open, onClose }: { phase?: Phase; open: boolean; onClose: () => void }) {
  const { data } = useHobby();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [more, setMore] = useCreateMore();
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!open) return;
    setName(phase?.name ?? "");
    setDesc(phase?.description ?? "");
    setStart(phase?.start_date ?? dateKey(new Date()));
    setEnd(phase?.end_date ?? "");
  }, [open, phase]);

  const submit = async () => {
    if (!name.trim()) return;
    const row = { name: name.trim(), description: desc, start_date: start || null, end_date: end || null };
    await mutate<unknown>(() =>
      phase ? repo.updatePhase(phase.id, row) : repo.createPhase({ ...row, hobby_id: data.hobby.id }),
    );
    if (!phase && more) {
      // the next phase starts the day after this one
      setName("");
      setDesc("");
      if (end) setStart(dateKey(addDays(parseDateKey(end), 1)));
      setEnd("");
      setRound((r) => r + 1);
    } else onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={phase ? "Phase bearbeiten" : "Neue Phase"}
      footer={
        <>
          {phase && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!(await confirmDialog(`Phase „${phase.name}" löschen? Ziele bleiben erhalten.`))) return;
                await mutate(() => repo.deletePhase(phase.id));
                onClose();
              }}
            >
              <Trash2 size={14} /> Löschen
            </Button>
          )}
          {!phase && <CreateMoreToggle on={more} onChange={setMore} />}
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input key={round} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <DateInput value={start} onChange={setStart} />
        </Field>
        <Field label="Ende">
          <DateInput value={end} onChange={setEnd} placeholder="offen" />
        </Field>
      </div>
      <Field label="Beschreibung / Fokus">
        <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
      </Field>
    </Modal>
  );
}
