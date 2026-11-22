import clsx from "clsx";
import { Check, GripVertical, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import * as repo from "../db/repo";
import type { Exercise, SongSection } from "../db/types";
import { mutate } from "../lib/store";
import { Section } from "./ExerciseDialog";
import { useHobby } from "./HobbyContext";
import { SortableList, useSortableItem } from "./sortable";
import { IconButton, Muted, ProgressBar } from "./ui";

const PART_NAMES = ["Intro", "Verse", "Pre-Chorus", "Chorus", "Bridge", "Solo", "Outro"];

const num = (v: string) => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

/** Overall tempo progress of a song as bar + percent. */
export function SongProgress({ exercise, className }: { exercise: Exercise; className?: string }) {
  const { d } = useHobby();
  const p = d.songProgress(exercise.id);
  if (!p) return <span className="text-muted">–</span>;
  return (
    <span className={clsx("flex items-center gap-2", className)} title={`${p.done} von ${p.total} Teilen im Zieltempo`}>
      <ProgressBar value={p.progress} color={p.progress >= 1 ? "var(--ok)" : undefined} />
      <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted">{Math.round(p.progress * 100)}%</span>
    </span>
  );
}

/** Song window: the parts of the song with current and target tempo. */
export function SongStructureSection({ exercise }: { exercise: Exercise }) {
  const { d } = useHobby();
  const sections = d.sectionsOf(exercise.id);
  const [name, setName] = useState("");

  const add = async (n: string) => {
    if (!n.trim()) return;
    const last = sections.at(-1);
    await mutate(() =>
      repo.createSongSection({
        exercise_id: exercise.id,
        name: n.trim(),
        position: (last?.position ?? 0) + 1,
        target_bpm: last?.target_bpm ?? null,
        current_bpm: null,
      }),
    );
    setName("");
  };

  return (
    <Section title="Struktur" actions={<SongProgress exercise={exercise} className="w-48" />}>
      <div className="overflow-hidden rounded-lg border border-line bg-card">
        <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_5rem_5rem_8rem_1.75rem] items-center gap-2 border-b border-line bg-panel/70 px-2 py-1.5 text-[11px] font-medium text-muted">
          <span />
          <span>Teil</span>
          <span className="text-right">Aktuell</span>
          <span className="text-right">Ziel</span>
          <span />
          <span />
        </div>
        {sections.length === 0 && (
          <div className="px-3 py-3">
            <Muted>Noch keine Teile.</Muted>
          </div>
        )}
        <SortableList items={sections} onReorder={(ids) => mutate(() => repo.reorder("song_section", ids))}>
          {(items) => items.map((s) => <PartRow key={s.id} section={s} />)}
        </SortableList>
        <div className="flex h-9 items-center gap-2 px-2">
          <Plus size={14} className="ml-0.5 text-muted" />
          <input
            className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
            placeholder="Teil hinzufügen …"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add(name)}
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {PART_NAMES.map((n) => (
          <button
            key={n}
            onClick={() => add(n)}
            className="h-6 rounded-md border border-line px-2 text-xs text-muted transition-colors hover:bg-elev hover:text-fg"
          >
            + {n}
          </button>
        ))}
      </div>
    </Section>
  );
}

function PartRow({ section: s }: { section: SongSection }) {
  const { ref, style, handle, isDragging } = useSortableItem(s.id);
  const [name, setName] = useState(s.name);
  const [cur, setCur] = useState(s.current_bpm?.toString() ?? "");
  const [target, setTarget] = useState(s.target_bpm?.toString() ?? "");
  useEffect(() => setName(s.name), [s.name]);
  useEffect(() => setCur(s.current_bpm?.toString() ?? ""), [s.current_bpm]);
  useEffect(() => setTarget(s.target_bpm?.toString() ?? ""), [s.target_bpm]);
  const save = (p: Partial<SongSection>) => mutate(() => repo.updateSongSection(s.id, p));
  const share = s.target_bpm ? Math.min(1, (s.current_bpm ?? 0) / s.target_bpm) : null;
  const bpmInput =
    "tabular h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-right text-sm outline-none hover:bg-elev focus:border-line";

  return (
    <div
      ref={ref}
      style={style}
      className={clsx(
        "group grid grid-cols-[1.25rem_minmax(0,1fr)_5rem_5rem_8rem_1.75rem] items-center gap-2 border-b border-line bg-card px-2 py-0.5",
        isDragging && "shadow-lg",
      )}
    >
      <span {...handle} className="cursor-grab text-muted opacity-0 group-hover:opacity-100">
        <GripVertical size={14} />
      </span>
      <input
        className="h-7 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-sm font-medium outline-none hover:bg-elev focus:border-line"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => (name.trim() && name !== s.name ? save({ name: name.trim() }) : setName(s.name))}
      />
      <input
        className={bpmInput}
        inputMode="numeric"
        placeholder="–"
        value={cur}
        onChange={(e) => setCur(e.target.value)}
        onBlur={() => num(cur) !== s.current_bpm && save({ current_bpm: num(cur) })}
      />
      <input
        className={bpmInput}
        inputMode="numeric"
        placeholder="BPM"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        onBlur={() => num(target) !== s.target_bpm && save({ target_bpm: num(target) })}
      />
      <span className="flex items-center gap-2">
        {share != null && (
          <>
            <ProgressBar value={share} color={share >= 1 ? "var(--ok)" : undefined} />
            {share >= 1 && <Check size={12} className="shrink-0 text-ok" />}
          </>
        )}
      </span>
      <IconButton
        label="Teil löschen"
        className="size-6 opacity-0 group-hover:opacity-100"
        onClick={() => mutate(() => repo.deleteSongSection(s.id))}
      >
        <Trash2 size={12} />
      </IconButton>
    </div>
  );
}

/**
 * Practice view of a song: pick a part to load its tempo into the metronome,
 * and store the metronome tempo as the part's new current tempo.
 */
export function SongPractice({
  exercise,
  bpm,
  onBpmChange,
}: {
  exercise: Exercise;
  bpm: number;
  onBpmChange: (bpm: number) => void;
}) {
  const { d } = useHobby();
  const sections = d.sectionsOf(exercise.id);
  const [activeId, setActiveId] = useState<number | null>(null);
  if (sections.length === 0) return null;

  return (
    <div className="rounded-xl border border-line bg-card shadow-xs">
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <span className="text-xs font-medium text-muted">Struktur</span>
        <SongProgress exercise={exercise} className="ml-auto w-44" />
      </div>
      {sections.map((s) => {
        const active = s.id === activeId;
        const share = s.target_bpm ? Math.min(1, (s.current_bpm ?? 0) / s.target_bpm) : null;
        return (
          <div
            key={s.id}
            onClick={() => {
              setActiveId(s.id);
              if (s.current_bpm) onBpmChange(Math.round(s.current_bpm));
            }}
            className={clsx(
              "flex h-10 cursor-pointer items-center gap-2.5 border-b border-line px-4 text-sm last:border-b-0",
              active ? "bg-elev" : "hover:bg-elev/60",
            )}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
            <span className="tabular shrink-0 text-right text-xs text-muted">
              {s.current_bpm ?? "–"} / {s.target_bpm ?? "–"} BPM
            </span>
            <span className="w-14 shrink-0">{share != null && <ProgressBar value={share} color={share >= 1 ? "var(--ok)" : undefined} />}</span>
            <button
              title="Metronom-Tempo als aktuelles Tempo speichern"
              onClick={(e) => {
                e.stopPropagation();
                setActiveId(s.id);
                mutate(() => repo.updateSongSection(s.id, { current_bpm: bpm }));
              }}
              className={clsx(
                "tabular h-6 shrink-0 rounded-md border border-line px-2 text-xs transition-colors hover:bg-elev hover:text-fg",
                active ? "text-fg" : "text-muted",
              )}
            >
              {bpm} setzen
            </button>
          </div>
        );
      })}
    </div>
  );
}
