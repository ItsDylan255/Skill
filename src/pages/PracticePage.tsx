import clsx from "clsx";
import { Check, CircleCheck, ExternalLink, Folder, Paperclip, SkipForward, Square, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { CategoryBadges } from "../components/categories";
import { CompleteExerciseModal, completeExercise } from "../components/exercise";
import { RULE_LABEL } from "../components/exerciseForms";
import { useHobby } from "../components/HobbyContext";
import { PageHeader } from "../components/Layout";
import { MetronomePanel, TimerDisplay, useTimer } from "../components/practice";
import { hasMetronome as metronomeAllowed } from "../components/SettingsDialog";
import { SongPractice } from "../components/song";
import { Button, Card, confirmDialog, Muted, ProgressBar, Textarea, toast } from "../components/ui";
import * as repo from "../db/repo";
import type { Exercise, Metric } from "../db/types";
import { aggregateMetric, formatMetricValue, formatMinutes, metricSeries } from "../domain/progress";
import { playSound } from "../lib/audio";
import { openAttachment, openExternal } from "../lib/platform";
import { mutate } from "../lib/store";

interface Step {
  exerciseId: number;
  /** null = open stopwatch */
  durationMin: number | null;
}

type StepState = "pending" | "done" | "skipped";

export function PracticePage() {
  const { kind, id } = useParams();
  const { d, data, base } = useHobby();

  // The step list is fixed when practice starts, even if the routine changes meanwhile.
  const [setup] = useState(() => {
    if (kind === "routine") {
      const routine = data.routines.find((r) => r.id === Number(id));
      if (!routine) return null;
      const steps: Step[] = d
        .routineItems(routine.id)
        .map((i) => ({ exerciseId: i.exercise_id, durationMin: i.duration_min }));
      return { title: routine.name, routineId: routine.id, steps };
    }
    const ex = d.exercise(Number(id));
    if (!ex) return null;
    return { title: ex.name, routineId: null, steps: [{ exerciseId: ex.id, durationMin: null }] };
  });

  if (!setup || setup.steps.length === 0) return <Navigate to={base} replace />;
  return <Practice title={setup.title} routineId={setup.routineId} steps={setup.steps} />;
}

function Practice({ title, routineId, steps }: { title: string; routineId: number | null; steps: Step[] }) {
  const { d, data, base } = useHobby();
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [states, setStates] = useState<StepState[]>(() => steps.map(() => "pending"));
  const [finished, setFinished] = useState(false);
  const sessionRef = useRef<Promise<number> | null>(null);
  const savedMinutes = useRef(0);

  const ensureSession = () => {
    if (!sessionRef.current) sessionRef.current = repo.startSession(data.hobby.id, routineId);
    return sessionRef.current;
  };

  // Remember what was already complete when practice started, to celebrate only new things.
  const [initial] = useState(() => ({
    exercises: new Set(data.exercises.filter((e) => d.completion(e).complete).map((e) => e.id)),
  }));
  const celebrated = useRef(new Set<number>());
  // reloads can come in before the goal update is written; don't mark or celebrate twice
  const handledGoals = useRef(new Set<number>());

  // set by the current step while it has time, values or a note that aren't saved yet
  const unsaved = useRef(false);
  const leaveStep = async () =>
    !unsaved.current ||
    (await confirmDialog("Zeit und Eingaben dieser Übung sind noch nicht gespeichert. Verwerfen?", {
      confirmLabel: "Verwerfen",
    }));

  useEffect(() => {
    // exercises that newly reached their completion criteria
    for (const s of steps) {
      const ex = d.exercise(s.exerciseId);
      if (!ex || initial.exercises.has(ex.id) || celebrated.current.has(ex.id)) continue;
      if (d.completion(ex).complete) {
        celebrated.current.add(ex.id);
        playSound("goal-completed");
        toast(`🎯 „${ex.name}": Abschlusskriterium erreicht!`);
      }
    }
    // goals that are now reached get marked as done
    const reached = data.goals.filter((g) => g.status === "open" && !handledGoals.current.has(g.id) && d.goal(g.id).done);
    if (reached.length > 0) {
      reached.forEach((g) => handledGoals.current.add(g.id));
      mutate(async () => {
        for (const g of reached)
          await repo.updateGoal(g.id, { status: "done", completed_at: new Date().toISOString() });
      });
      playSound("goal-completed");
      reached.forEach((g) => toast(`🏆 Ziel erreicht: ${g.name}`));
    }
  }, [d]); // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = (state: StepState) => {
    const nextStates = [...states];
    nextStates[index] = state;
    setStates(nextStates);
    const next = nextStates.findIndex((s, i) => i > index && s === "pending");
    const anyPending = nextStates.findIndex((s) => s === "pending");
    if (next >= 0) setIndex(next);
    else if (anyPending >= 0) setIndex(anyPending);
    else finish();
  };

  const finish = async () => {
    if (sessionRef.current) {
      const id = await sessionRef.current;
      await mutate(() => repo.endSession(id));
    }
    setFinished(true);
  };

  const quit = async () => {
    if (!(await leaveStep())) return;
    const anything = states.some((s) => s === "done");
    if (!anything) {
      // back where practice was started from; without a history (e.g. after a reload) to the overview
      if ((window.history.state?.idx ?? 0) > 0) navigate(-1);
      else navigate(base);
      return;
    }
    await finish();
  };

  if (finished) {
    return (
      <Summary
        title={title}
        steps={steps}
        states={states}
        minutes={savedMinutes.current}
        onClose={() => navigate(base)}
      />
    );
  }

  const step = steps[index];
  const exercise = d.exercise(step.exerciseId);

  return (
    <>
      <PageHeader
        title={title}
        subtitle={steps.length > 1 ? `Übung ${index + 1} von ${steps.length}` : undefined}
        actions={
          <Button size="sm" onClick={quit}>
            <Square size={11} /> Beenden
          </Button>
        }
      />
      {steps.length > 1 && (
        /* routine progress: one segment per exercise, width = planned time */
        <div className="flex shrink-0 gap-1 border-b border-line px-4 py-2.5">
          {steps.map((s, i) => {
            const ex = d.exercise(s.exerciseId);
            return (
              <button
                key={i}
                onClick={async () => i !== index && (await leaveStep()) && setIndex(i)}
                style={{ flexGrow: s.durationMin ?? 1, flexBasis: 0 }}
                className={clsx(
                  "group flex min-w-0 flex-col gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-elev/60",
                )}
              >
                <span
                  className={clsx(
                    "h-1 w-full rounded-full",
                    states[i] === "done" ? "bg-ok" : i === index ? "bg-fg" : states[i] === "skipped" ? "bg-line" : "bg-fg/15",
                  )}
                />
                <span
                  className={clsx(
                    "flex items-center gap-1 truncate text-xs",
                    i === index ? "font-medium text-fg" : "text-muted",
                  )}
                >
                  {states[i] === "done" && <Check size={11} className="shrink-0 text-ok" />}
                  <span className="truncate">{ex?.name ?? "Gelöscht"}</span>
                  {s.durationMin != null && <span className="tabular shrink-0 opacity-70">· {formatMinutes(s.durationMin)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {exercise ? (
          <StepView
            key={index}
            exercise={exercise}
            durationMin={step.durationMin}
            done={states[index] === "done"}
            ensureSession={ensureSession}
            sessionRef={sessionRef}
            unsavedRef={unsaved}
            onSaved={(min) => {
              savedMinutes.current += min;
              goNext("done");
            }}
            onSkip={async (ask) => {
              if (ask && !(await leaveStep())) return;
              goNext(states[index] === "done" ? "done" : "skipped");
            }}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Button onClick={() => goNext("skipped")}>Übung gelöscht – überspringen</Button>
          </div>
        )}
      </div>
    </>
  );
}

function StepView({
  exercise,
  durationMin,
  done,
  ensureSession,
  sessionRef,
  unsavedRef,
  onSaved,
  onSkip,
}: {
  exercise: Exercise;
  durationMin: number | null;
  done: boolean;
  ensureSession: () => Promise<number>;
  sessionRef: React.RefObject<Promise<number> | null>;
  unsavedRef: React.RefObject<boolean>;
  onSaved: (minutes: number) => void;
  /** ask = confirm first when something isn't saved */
  onSkip: (ask: boolean) => void;
}) {
  const { d, data } = useHobby();
  const timer = useTimer();
  const metrics = d.metricsOf(exercise.id);
  const runs = d.runsOf(exercise.id);
  const isSong = exercise.kind === "song";
  // In a routine the planned time always counts down. Practising alone you switch between
  // countdown and stopwatch here; the exercise remembers the choice and the duration.
  const single = durationMin == null;
  const [countdown, setCountdown] = useState(exercise.tools.includes("countdown"));
  const [countdownMin, setCountdownMin] = useState(exercise.countdown_min ?? 10);
  const ownCountdown = single && countdown;
  const targetSec = durationMin != null ? durationMin * 60 : ownCountdown ? countdownMin * 60 : null;
  const switchMode = (on: boolean) => {
    setCountdown(on);
    const tools = exercise.tools.filter((t) => t !== "countdown" && t !== "stopwatch");
    mutate(() => repo.updateExercise(exercise.id, { tools: [...tools, on ? "countdown" : "stopwatch"] }));
  };
  const adjustCountdown = (delta: number) => {
    const next = Math.max(1, countdownMin + delta);
    setCountdownMin(next);
    mutate(() => repo.updateExercise(exercise.id, { countdown_min: next }));
  };
  // songs always come with the metronome; otherwise the hobby has to allow it
  const hasMetronome = isSong || (exercise.tools.includes("metronome") && metronomeAllowed(data.hobby));

  const entered = metrics.filter((m) => m.kind !== "time");
  const bpmMetric = entered.find((m) => /bpm/i.test(`${m.unit} ${m.name}`));
  const [bpm, setBpm] = useState(() => {
    const last = bpmMetric ? metricSeries(bpmMetric, runs, d.byRun).at(-1)?.value : undefined;
    // songs start at the tempo of the first part that hasn't reached its target yet
    const part = isSong
      ? d.sectionsOf(exercise.id).find((s) => s.current_bpm && (!s.target_bpm || s.current_bpm < s.target_bpm))
      : undefined;
    return Math.round(part?.current_bpm ?? exercise.metronome_bpm ?? last ?? exercise.default_bpm ?? 100);
  });
  const [initialBpm] = useState(bpm);

  // the exercise remembers the metronome tempo it was last practised with
  const storedBpm = useRef(exercise.metronome_bpm);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const storeBpm = () => {
    const v = bpmRef.current;
    if (!hasMetronome || v === storedBpm.current || v < 20 || v > 400) return;
    storedBpm.current = v;
    mutate(() => repo.updateExercise(exercise.id, { metronome_bpm: v }));
  };
  useEffect(() => {
    const t = setTimeout(storeBpm, 800);
    return () => clearTimeout(t);
  }, [bpm]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => storeBpm, []); // eslint-disable-line react-hooks/exhaustive-deps
  const storeMeter = (measure: string, subdivision: number) =>
    mutate(() => repo.updateExercise(exercise.id, { metronome_measure: measure, metronome_subdivision: subdivision }));

  const [values, setValues] = useState<Record<number, string>>({});
  const [touched, setTouched] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  // A BPM field follows the metronome until you type into it yourself;
  // a remembered value starts where you stopped last time.
  const valueOf = (m: Metric) => {
    if (touched.has(m.id)) return values[m.id] ?? "";
    if (m.id === bpmMetric?.id && hasMetronome) return String(bpm);
    if (m.kind === "memo") return String(metricSeries(m, runs, d.byRun).at(-1)?.value ?? "");
    return "";
  };
  // a value that was only filled in for you doesn't count as practice on its own
  const onlyPrefilled = (m: Metric) =>
    !touched.has(m.id) && (m.id === bpmMetric?.id && hasMetronome ? bpm === initialBpm : m.kind === "memo");

  useEffect(() => {
    unsavedRef.current = timer.elapsedMs >= 1000 || note.trim() !== "" || touched.size > 0;
    return () => {
      unsavedRef.current = false;
    };
  });

  // play the timer sound once when the countdown reaches zero (again after a reset or more time)
  const firedRef = useRef(false);
  useEffect(() => {
    if (targetSec == null) return;
    if (timer.elapsedMs < targetSec * 1000) firedRef.current = false;
    else if (!firedRef.current) {
      firedRef.current = true;
      playSound("timer-complete");
    }
  });

  // Space toggles the timer (unless typing). Also on a focused button, which
  // would otherwise be "clicked" by Space as well and toggle twice.
  useEffect(() => {
    const typing = (t: EventTarget | null) => /INPUT|TEXTAREA|SELECT/.test((t as HTMLElement)?.tagName ?? "");
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || typing(e.target)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (timer.running) timer.pause();
      else timer.start();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space" && !typing(e.target)) e.preventDefault();
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [timer]);

  const save = async () => {
    setSaving(true);
    try {
      timer.pause();
      const sec = timer.elapsedMs / 1000;
      const byId = (id: number) => metrics.find((m) => m.id === id)!;
      const entries = metrics
        .map((m) => {
          if (m.kind === "time") return { metric_id: m.id, value: Math.round((sec / 60) * 10) / 10 };
          const raw = valueOf(m).trim().replace(",", ".");
          return raw === "" || Number.isNaN(Number(raw)) ? null : { metric_id: m.id, value: Number(raw) };
        })
        .filter((x): x is { metric_id: number; value: number } => x !== null)
        .filter((x) => sec >= 1 || byId(x.metric_id).kind !== "time");

      if (sec < 1 && !note.trim() && entries.every((x) => onlyPrefilled(byId(x.metric_id)))) {
        onSkip(false);
        return;
      }
      const sessionId = await ensureSession();
      await mutate(async () => {
        if (sec >= 1 || entries.length > 0)
          await repo.saveRun(sessionId, exercise.id, timer.firstStart ?? new Date().toISOString(), sec, entries);
        if (note.trim()) await repo.addNote({ exercise_id: exercise.id, session_id: sessionId, text: note.trim() });
      });
      onSaved(sec / 60);
    } finally {
      setSaving(false);
    }
  };

  const completion = d.completion(exercise);
  const notes = d.exerciseNotes(exercise.id);
  const [currentSession, setCurrentSession] = useState<number | undefined>();
  useEffect(() => {
    sessionRef.current?.then(setCurrentSession);
  }, [sessionRef]);
  const pastSessions = d.sessionNotes(exercise.id, currentSession).slice(0, 3);
  const links = data.links.filter((l) => l.exercise_id === exercise.id);
  const files = data.attachments.filter((a) => a.exercise_id === exercise.id);

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-8 py-7">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <CategoryBadges ids={exercise.category_ids} />
                {done && <span className="text-xs text-ok">bereits gespeichert</span>}
              </div>
              <h2 className="text-2xl font-semibold tracking-tight">{exercise.name}</h2>
            </div>

            {/* the stage: timer, and the metronome next to it */}
            <div
              className={clsx(
                "grid items-center rounded-2xl border border-line bg-card shadow-xs",
                hasMetronome ? "md:grid-cols-2 md:divide-x divide-line" : "",
              )}
            >
              <div className="flex flex-col items-center gap-4 p-6">
                {single && (
                  <div className="flex h-7 items-center gap-0.5 rounded-lg border border-line bg-card p-0.5">
                    {[
                      { on: true, label: "Countdown" },
                      { on: false, label: "Stoppuhr" },
                    ].map((m) => (
                      <button
                        key={m.label}
                        onClick={() => m.on !== countdown && switchMode(m.on)}
                        className={clsx(
                          "h-6 rounded-[7px] px-2.5 text-xs font-medium transition-colors",
                          m.on === countdown ? "bg-elev text-fg shadow-xs" : "text-muted hover:text-fg",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
                <TimerDisplay timer={timer} targetSec={targetSec} onAdjust={ownCountdown ? adjustCountdown : undefined} />
              </div>
              {hasMetronome && (
                <div className="p-6">
                  <MetronomePanel
                    bpm={bpm}
                    onBpmChange={setBpm}
                    bare
                    initial={{ measure: exercise.metronome_measure, subdivision: exercise.metronome_subdivision }}
                    onMeterChange={storeMeter}
                  />
                </div>
              )}
            </div>

            {isSong && <SongPractice exercise={exercise} bpm={bpm} onBpmChange={setBpm} />}

            {entered.length > 0 && (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {entered.map((m) => {
                    const last = metricSeries(m, runs, d.byRun).at(-1)?.value;
                    const best = aggregateMetric(m, runs, d.byRun);
                    return (
                      <label key={m.id} className="flex flex-col gap-1.5 rounded-xl border border-line bg-card p-3 shadow-xs">
                        <span className="text-xs font-medium text-muted">
                          {m.name}
                          {m.unit && ` (${m.unit})`}
                        </span>
                        <input
                          className="tabular w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-muted/40"
                          inputMode="decimal"
                          placeholder={last != null ? String(last) : "–"}
                          value={valueOf(m)}
                          onChange={(e) => {
                            setTouched((t) => new Set(t).add(m.id));
                            setValues((v) => ({ ...v, [m.id]: e.target.value }));
                          }}
                        />
                        <span className="text-[11px] text-muted">
                          {last != null && `zuletzt ${formatMetricValue(m, last)}`}
                          {best != null && m.target_value != null && ` · Ziel ${formatMetricValue(m, m.target_value)}`}
                        </span>
                      </label>
                    );
                  })}
              </div>
            )}

            <div>
              <div className="mb-1.5 text-xs font-medium text-muted">Notiz zu dieser Session</div>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-8 py-3">
          <Button variant="ghost" onClick={() => onSkip(true)}>
            <SkipForward size={14} /> Überspringen
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            <Check size={14} /> Speichern & weiter
          </Button>
        </div>
      </div>

      <aside className="flex w-80 shrink-0 flex-col gap-6 overflow-y-auto border-l border-line bg-panel/60 px-5 py-6">
        {completion.results.length > 0 && (
          <div>
            <h4 className="mb-2 text-[13px] font-semibold">Fortschritt</h4>
            <div className="flex flex-col gap-2">
              {completion.results.map((r) => (
                <div key={r.rule.id}>
                  <div className="flex justify-between text-xs">
                    <span>
                      {r.met && <CircleCheck size={12} className="mr-1 inline text-ok" />}
                      {RULE_LABEL[r.rule.type]}
                    </span>
                    <span className="tabular text-muted">{r.label}</span>
                  </div>
                  <ProgressBar value={r.progress} className="mt-1" color={r.met ? "var(--ok)" : undefined} />
                </div>
              ))}
            </div>
          </div>
        )}

        {exercise.description && (
          <div>
            <h4 className="mb-2 text-[13px] font-semibold">Beschreibung</h4>
            <p className="text-sm whitespace-pre-wrap text-muted">{exercise.description}</p>
          </div>
        )}

        <div>
          <h4 className="mb-2 text-[13px] font-semibold">Übungsnotizen</h4>
          {notes.length === 0 ? (
            <Muted>Keine.</Muted>
          ) : (
            <div className="flex flex-col gap-1.5">
              {notes.map((n) => (
                <p key={n.id} className="rounded-lg border border-line bg-card px-3 py-2 text-sm whitespace-pre-wrap">
                  {n.text}
                </p>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-[13px] font-semibold">Letzte Session-Notizen</h4>
          {pastSessions.length === 0 ? (
            <Muted>Noch keine.</Muted>
          ) : (
            <div className="flex flex-col gap-2">
              {pastSessions.map((g) => (
                <div key={g.session?.id ?? g.notes[0].id} className="rounded-lg border border-line bg-card px-3 py-2">
                  <div className="text-[11px] text-muted">
                    {g.session && new Date(g.session.started_at).toLocaleDateString("de-DE")}
                  </div>
                  {g.notes.map((n) => (
                    <p key={n.id} className="text-sm whitespace-pre-wrap">
                      {n.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {(links.length > 0 || files.length > 0) && (
          <div>
            <h4 className="mb-2 text-[13px] font-semibold">Material</h4>
            <div className="flex flex-col gap-1">
              {links.map((l) => (
                <button
                  key={l.id}
                  className="flex items-center gap-1.5 text-left text-sm hover:underline"
                  onClick={() => openExternal(l.url)}
                >
                  <ExternalLink size={13} className="shrink-0" />
                  <span className="truncate">{l.title || l.url.replace(/^https?:\/\//, "")}</span>
                </button>
              ))}
              {files.map((f) => (
                <button
                  key={f.id}
                  className="flex items-center gap-1.5 text-left text-sm hover:underline"
                  onClick={() => openAttachment(f.path, f.kind).catch((e) => toast(String(e)))}
                >
                  {f.kind === "folder" ? (
                    <Folder size={13} className="shrink-0 text-muted" />
                  ) : (
                    <Paperclip size={13} className="shrink-0 text-muted" />
                  )}
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function Summary({
  title,
  steps,
  states,
  minutes,
  onClose,
}: {
  title: string;
  steps: Step[];
  states: StepState[];
  minutes: number;
  onClose: () => void;
}) {
  const { d } = useHobby();
  const [completing, setCompleting] = useState<Exercise | null>(null);
  const done = steps.filter((_, i) => states[i] === "done");
  const ready = useMemo(() => {
    const ids = [...new Set(done.map((s) => s.exerciseId))];
    return ids
      .map((id) => d.exercise(id))
      .filter((e): e is Exercise => !!e && e.status === "active" && d.completion(e).complete);
  }, [d, done]);

  return (
    <>
      <PageHeader title={title} subtitle="Session beendet" />
      <div className="flex flex-1 items-start justify-center overflow-y-auto p-6">
        <Card className="flex w-full max-w-lg flex-col gap-5 p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-full bg-ok/15 text-ok">
              <Trophy size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold">Gut gemacht!</h2>
              <p className="text-sm text-muted">
                {formatMinutes(minutes)} geübt · {done.length} von {steps.length} Übungen
              </p>
            </div>
          </div>

          {ready.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted">Abschlusskriterium erreicht</h3>
              {ready.map((e) => (
                <div key={e.id} className="flex items-center justify-between gap-2 rounded-md border border-ok/40 bg-ok/10 px-3 py-2">
                  <span className="flex items-center gap-2 text-sm">
                    <CircleCheck size={14} className="text-ok" /> {e.name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Button size="sm" onClick={() => completeExercise(e)}>
                      Abschließen
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => setCompleting(e)}>
                      Tauschen
                    </Button>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={async () => {
                if (ready.length > 0 && !(await confirmDialog("Übungen mit erreichtem Kriterium noch nicht abgeschlossen. Trotzdem schließen?", {
                    confirmLabel: "Schließen",
                    danger: false,
                  })))
                  return;
                onClose();
              }}
            >
              Zur Übersicht
            </Button>
          </div>
        </Card>
      </div>
      {completing && (
        <CompleteExerciseModal exercise={completing} open onClose={() => setCompleting(null)} />
      )}
    </>
  );
}
