import clsx from "clsx";
import { Minus, Pause, Play, Plus, RotateCcw, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Metronome } from "../lib/audio";
import { formatClock } from "../domain/progress";
import { Button, IconButton, Select } from "./ui";

/** Timestamp-based timer: stays correct when the window is hidden or the PC sleeps. */
export function useTimer() {
  // Kept in a ref and changed outside of state updaters, so React re-running an
  // updater (StrictMode, concurrent rendering) can never count paused time twice.
  const state = useRef({ startAt: null as number | null, acc: 0, firstStart: null as string | null });
  const [, rerender] = useState(0);
  const refresh = useCallback(() => rerender((x) => x + 1), []);
  const { startAt, acc, firstStart } = state.current;

  useEffect(() => {
    if (startAt == null) return;
    const t = setInterval(refresh, 200);
    return () => clearInterval(t);
  }, [startAt, refresh]);

  const elapsedMs = acc + (startAt != null ? Date.now() - startAt : 0);

  const start = useCallback(() => {
    const s = state.current;
    if (s.startAt != null) return;
    s.startAt = Date.now();
    s.firstStart ??= new Date().toISOString();
    refresh();
  }, [refresh]);
  const pause = useCallback(() => {
    const s = state.current;
    if (s.startAt == null) return;
    s.acc += Date.now() - s.startAt;
    s.startAt = null;
    refresh();
  }, [refresh]);
  const reset = useCallback(() => {
    state.current = { startAt: null, acc: 0, firstStart: null };
    refresh();
  }, [refresh]);

  return { elapsedMs, running: startAt != null, start, pause, reset, firstStart };
}

export type Timer = ReturnType<typeof useTimer>;

export function TimerDisplay({
  timer,
  targetSec,
  onAdjust,
}: {
  timer: Timer;
  /** null = stopwatch */
  targetSec: number | null;
  /** shows -/+ to change the countdown by whole minutes */
  onAdjust?: (deltaMin: number) => void;
}) {
  const elapsed = timer.elapsedMs / 1000;
  const remaining = targetSec != null ? targetSec - elapsed : null;
  const overtime = remaining != null && remaining < 0;
  const progress = targetSec ? Math.min(1, elapsed / targetSec) : 0;
  const R = 88;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative size-52">
        <svg viewBox="0 0 200 200" className="size-full -rotate-90">
          <circle cx="100" cy="100" r={R} fill="none" stroke="var(--elev)" strokeWidth="8" />
          {targetSec != null && (
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={overtime ? "var(--ok)" : "var(--accent)"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              style={{ transition: "stroke-dashoffset 0.25s linear" }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={clsx("tabular text-4xl font-semibold", overtime && "text-ok")}>
            {remaining != null
              ? `${overtime ? "+" : ""}${formatClock(Math.abs(remaining))}`
              : formatClock(elapsed)}
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs text-muted">
            {onAdjust && targetSec != null && (
              <IconButton label="1 Minute weniger" className="size-5" onClick={() => onAdjust(-1)} disabled={targetSec <= 60}>
                <Minus size={11} />
              </IconButton>
            )}
            {targetSec == null ? "Stoppuhr" : overtime ? "Zeit erreicht" : `von ${formatClock(targetSec)}`}
            {onAdjust && targetSec != null && (
              <IconButton label="1 Minute mehr" className="size-5" onClick={() => onAdjust(1)}>
                <Plus size={11} />
              </IconButton>
            )}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <IconButton label="Zurücksetzen" onClick={timer.reset} disabled={timer.elapsedMs === 0}>
          <RotateCcw size={16} />
        </IconButton>
        <Button
          variant="primary"
          className="h-10 w-32 text-sm"
          onClick={timer.running ? timer.pause : timer.start}
        >
          {timer.running ? (
            <>
              <Pause size={16} /> Pause
            </>
          ) : (
            <>
              <Play size={16} /> {timer.elapsedMs > 0 ? "Weiter" : "Start"}
            </>
          )}
        </Button>
        <span className="w-7" />
      </div>
    </div>
  );
}

const METRO_KEY = "hobby-manager-metronome";

/** Measures like TempoPerfect: beats per bar, odd meters with their grouping. */
const MEASURES: { value: string; label: string; beats: number; groups: number[] }[] = [
  { value: "0", label: "Keine", beats: 0, groups: [] },
  ...[2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n), beats: n, groups: [] })),
  { value: "5:3+2", label: "5(3+2)", beats: 5, groups: [3] },
  { value: "5:2+3", label: "5(2+3)", beats: 5, groups: [2] },
  { value: "6", label: "6", beats: 6, groups: [] },
  { value: "7", label: "7", beats: 7, groups: [] },
  { value: "7:4+3", label: "7(4+3)", beats: 7, groups: [4] },
  { value: "7:3+4", label: "7(3+4)", beats: 7, groups: [3] },
  ...[8, 9, 10, 11, 12].map((n) => ({ value: String(n), label: String(n), beats: n, groups: [] })),
];

const SUBDIVISIONS = [1, 2, 3, 4, 5, 6, 7, 8];

type MetroSettings = { measure: string; subdivision: number; volume: number };

function loadMetroSettings(): MetroSettings {
  try {
    const v = JSON.parse(localStorage.getItem(METRO_KEY) ?? "");
    const sub = typeof v?.subdivision === "number" ? v.subdivision : 1;
    const volume = typeof v?.volume === "number" ? v.volume : 1;
    if (typeof v?.measure === "string" && MEASURES.some((m) => m.value === v.measure))
      return { measure: v.measure, subdivision: sub, volume };
    // older settings stored the beats as a number
    if (typeof v?.bar === "number" && MEASURES.some((m) => m.value === String(v.bar)))
      return { measure: String(v.bar), subdivision: sub, volume };
  } catch {
    // ignore
  }
  return { measure: "4", subdivision: 1, volume: 1 };
}

export function MetronomePanel({
  bpm,
  onBpmChange,
  bare,
  initial,
  onMeterChange,
}: {
  bpm: number;
  onBpmChange: (bpm: number) => void;
  /** without its own frame, e.g. inside another card */
  bare?: boolean;
  /** measure and subdivision to start with instead of the last used ones */
  initial?: { measure: string | null; subdivision: number | null };
  onMeterChange?: (measure: string, subdivision: number) => void;
}) {
  const metro = useRef<Metronome | null>(null);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [settings, setSettingsState] = useState(() => {
    const s = loadMetroSettings();
    const measure = initial?.measure && MEASURES.some((m) => m.value === initial.measure) ? initial.measure : s.measure;
    return { ...s, measure, subdivision: initial?.subdivision ?? s.subdivision };
  });
  const setSettings = (next: MetroSettings) => {
    setSettingsState(next);
    if (next.measure !== settings.measure || next.subdivision !== settings.subdivision)
      onMeterChange?.(next.measure, next.subdivision);
  };
  const { subdivision } = settings;
  const measure = MEASURES.find((m) => m.value === settings.measure) ?? MEASURES[3];
  const bar = measure.beats;

  if (!metro.current) metro.current = new Metronome();

  useEffect(() => {
    const m = metro.current!;
    m.onBeat = setBeat;
    return () => m.dispose();
  }, []);

  useEffect(() => {
    metro.current!.bpm = bpm;
  }, [bpm]);

  useEffect(() => {
    metro.current!.beatsPerBar = bar;
    metro.current!.groupStarts = measure.groups;
    metro.current!.subdivision = subdivision;
    metro.current!.volume = settings.volume;
    try {
      localStorage.setItem(METRO_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }, [settings, bar, measure, subdivision]);

  const toggle = async () => {
    const m = metro.current!;
    if (running) {
      m.stop();
      setBeat(-1);
    } else await m.start();
    setRunning(!running);
  };

  const set = (v: number) => onBpmChange(Math.max(20, Math.min(400, Math.round(v))));

  return (
    <div className={clsx("flex flex-col gap-3", !bare && "rounded-xl border border-line bg-card p-4")}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted">Metronom</span>
        <div className="flex gap-1">
          {Array.from({ length: Math.max(1, bar) }, (_, i) => (
            <span
              key={i}
              className={clsx(
                "size-2.5 rounded-full transition-colors duration-75",
                running && beat === i ? (i === 0 && bar > 1 ? "bg-accent" : "bg-fg") : "bg-fg/10",
                measure.groups.includes(i) && "ml-1.5",
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center gap-1">
        <IconButton label="−5" onClick={() => set(bpm - 5)}>
          <span className="text-xs">−5</span>
        </IconButton>
        <IconButton label="−1" onClick={() => set(bpm - 1)}>
          <Minus size={14} />
        </IconButton>
        <div className="flex flex-col items-center">
          <input
            className="tabular w-20 bg-transparent text-center text-3xl font-semibold outline-none"
            inputMode="numeric"
            value={bpm}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v)) onBpmChange(v);
            }}
            onBlur={() => set(bpm)}
          />
          <span className="text-[10px] text-muted">BPM</span>
        </div>
        <IconButton label="+1" onClick={() => set(bpm + 1)}>
          <Plus size={14} />
        </IconButton>
        <IconButton label="+5" onClick={() => set(bpm + 5)}>
          <span className="text-xs">+5</span>
        </IconButton>
      </div>
      <input
        type="range"
        min={30}
        max={300}
        value={bpm}
        onChange={(e) => onBpmChange(Number(e.target.value))}
        className="accent-[var(--primary)]"
      />

      <div className="grid grid-cols-[3fr_2fr] gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Takt</span>
          <Select
            className="h-7 text-xs"
            value={measure.value}
            onChange={(e) => setSettings({ ...settings, measure: e.target.value })}
          >
            {MEASURES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-muted">Unterteilung</span>
          <Select
            className="h-7 text-xs"
            value={subdivision}
            onChange={(e) => setSettings({ ...settings, subdivision: Number(e.target.value) })}
          >
            {SUBDIVISIONS.map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Keine" : n}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <label className="flex items-center gap-2">
        <Volume2 size={14} className="shrink-0 text-muted" />
        <input
          type="range"
          min={0}
          max={3}
          step={0.05}
          value={settings.volume}
          onChange={(e) => setSettings({ ...settings, volume: Number(e.target.value) })}
          className="min-w-0 flex-1 accent-[var(--primary)]"
          aria-label="Lautstärke"
        />
        <span className="tabular w-9 shrink-0 text-right text-[11px] text-muted">{Math.round(settings.volume * 100)}%</span>
      </label>
      <Button variant={running ? "primary" : "secondary"} onClick={toggle}>
        {running ? <Pause size={14} /> : <Play size={14} />}
        {running ? "Stop" : "Start"}
      </Button>
    </div>
  );
}
