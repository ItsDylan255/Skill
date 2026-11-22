import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CircleCheck,
  ClockPlus,
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  Paperclip,
  Pencil,
  Play,
  Plus,
  Repeat,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CategoryPicker } from "./categories";
import { ManualRunModal } from "./ManualRunModal";
import { hasMetronome } from "./SettingsDialog";
import { SongProgress, SongStructureSection } from "./song";
import { CompleteExerciseModal, completeExercise } from "./exercise";
import { AGG_LABEL, MetricModal, RuleModal, RULE_LABEL } from "./exerciseForms";
import { useHobby } from "./HobbyContext";
import {
  Button,
  confirmDialog,
  CreateMoreToggle,
  IconButton,
  Modal,
  Muted,
  ProgressBar,
  Select,
  Switch,
  Textarea,
  toast,
  useCreateMore,
} from "./ui";
import * as repo from "../db/repo";
import type { Attachment, CompletionRule, Exercise, Hobby, HobbyData, Metric, ToolType } from "../db/types";
import {
  aggregateMetric,
  formatMetricValue,
  formatMinutes,
  metricSeries,
  practiceDays,
  totalMinutes,
} from "../domain/progress";
import { deleteAttachmentFile, openAttachment, openExternal, pickAttachments, pickFolder } from "../lib/platform";
import { mutate } from "../lib/store";
import { closeExercise, dialogGoBack, openExercise, openRoutineFromExercise, useUi } from "../lib/uiState";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });

/** Section inside the dialog: bold title, optional action on the right. */
export function Section({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-2">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </div>
      {children}
    </section>
  );
}

/**
 * Whether a copied file can be deleted from disk along with its attachment:
 * not for linked folders, and not while a copied exercise still uses the same file.
 */
function useFileUnused() {
  const { data } = useHobby();
  return (f: Attachment) => f.kind !== "folder" && !data.attachments.some((a) => a.id !== f.id && a.path === f.path);
}

/** Asks, then deletes an exercise with everything in it, including attached files nothing else uses. */
export async function deleteExercise(exercise: Exercise, data: HobbyData) {
  if (!(await confirmDialog(`„${exercise.name}" mit allen Einträgen löschen?`))) return;
  const files = data.attachments.filter((a) => a.exercise_id === exercise.id);
  const unused = (f: Attachment) => f.kind !== "folder" && !data.attachments.some((a) => a.id !== f.id && a.path === f.path);
  closeExercise();
  await mutate(() => repo.deleteExercise(exercise.id));
  for (const f of files) if (unused(f)) await deleteAttachmentFile(f.path).catch(() => {});
}

/** Arrow in a window title that returns to the window this one was opened from. */
export function DialogBackButton() {
  const { dialogBack } = useUi();
  if (!dialogBack) return null;
  return (
    <IconButton label="Zurück" className="-ml-1 size-6" onClick={dialogGoBack}>
      <ArrowLeft size={14} />
    </IconButton>
  );
}

/** Creates an exercise and opens it in the dialog right away; the metronome is on when the hobby uses it. */
export async function createAndOpenExercise(hobby: Hobby, patch: Partial<Exercise> = {}) {
  const tools: ToolType[] = hasMetronome(hobby) ? ["countdown", "metronome"] : ["countdown"];
  const id = await mutate(() => repo.createExercise(hobby.id, { name: "", status: "active", tools, ...patch }));
  openExercise(id, true);
}

/**
 * Window of an exercise, for creating and editing (same window, like Slate's task dialog).
 * Every change is saved immediately; a new exercise without a name is discarded on close.
 */
export function ExerciseDialog() {
  const { exercise: open } = useUi();
  const { d } = useHobby();
  const exercise = open ? d.exercise(open.id) : undefined;
  if (!open || !exercise) return null;
  return <ExerciseWindow key={exercise.id} exercise={exercise} isNew={open.isNew} />;
}

function ExerciseWindow({ exercise, isNew }: { exercise: Exercise; isNew: boolean }) {
  const { d, data, base } = useHobby();
  const navigate = useNavigate();
  const [name, setName] = useState(exercise.name);
  const [completing, setCompleting] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [addingTime, setAddingTime] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const archived = exercise.status === "archived";
  const isSong = exercise.kind === "song";
  const ready = !archived && !isNew && !isSong && d.completion(exercise).complete;

  useEffect(() => setName(exercise.name), [exercise.name]);

  const save = (patch: Partial<Exercise>) => mutate(() => repo.updateExercise(exercise.id, patch));
  const saveName = async () => {
    if (name.trim() && name.trim() !== exercise.name) await save({ name: name.trim() });
  };

  const discard = async () => {
    closeExercise();
    await mutate(() => repo.deleteExercise(exercise.id));
  };

  const close = async () => {
    if (isNew && !name.trim()) return discard();
    await saveName();
    closeExercise();
  };

  const [more, setMore] = useCreateMore();
  const create = async () => {
    if (!name.trim()) return titleRef.current?.focus();
    await saveName();
    closeExercise();
    if (more)
      await createAndOpenExercise(data.hobby, {
        category_ids: exercise.category_ids,
        kind: exercise.kind,
        tools: exercise.tools,
      });
  };

  const duplicate = async () => {
    await saveName();
    const id = await mutate(() => repo.duplicateExercise(exercise.id));
    openExercise(id);
  };

  const remove = () => deleteExercise(exercise, data);

  return (
    <Modal
      open
      onClose={close}
      width="max-w-5xl"
      noPadding
      title={
        <span className="flex items-center gap-1.5 font-normal text-muted">
          <DialogBackButton />
          {data.hobby.name}
          <span className="text-muted/50">/</span>
          <span className="font-medium text-fg">
            {isSong ? (isNew ? "Neuer Song" : "Song") : isNew ? "Neue Übung" : "Übung"}
          </span>
          {archived && <span className="ml-1 rounded-md border border-line px-1.5 text-xs">Archiviert</span>}
        </span>
      }
      headerRight={
        !isNew && (
          <div className="flex items-center gap-1">
            {!archived && (
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  await close();
                  navigate(`${base}/practice/exercise/${exercise.id}`);
                }}
              >
                <Play size={13} /> Üben
              </Button>
            )}
            <IconButton label="Zeit nachtragen" onClick={() => setAddingTime(true)}>
              <ClockPlus size={14} />
            </IconButton>
            <IconButton label="Fortschritt & Verlauf" onClick={() => setShowProgress(true)}>
              <TrendingUp size={14} />
            </IconButton>
            <IconButton label="Kopieren" onClick={duplicate}>
              <Copy size={14} />
            </IconButton>
            <IconButton
              label={archived ? "Wiederherstellen" : "Archivieren"}
              onClick={() =>
                save(archived ? { status: "active" } : { status: "archived", completed_at: new Date().toISOString() })
              }
            >
              {archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
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
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => !isNew && saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (isNew) create();
                else (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
          {ready && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-ok/40 bg-ok/10 px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm">
                <CircleCheck size={16} className="text-ok" />
                Abschlusskriterium erreicht
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => completeExercise(exercise)}>
                  Abschließen
                </Button>
                <Button variant="primary" size="sm" onClick={() => setCompleting(true)}>
                  Tauschen
                </Button>
              </div>
            </div>
          )}
          <DescriptionSection exercise={exercise} />
          {isSong ? (
            <SongStructureSection exercise={exercise} />
          ) : (
            <>
              <MetricsSection exercise={exercise} />
              <RulesSection exercise={exercise} />
            </>
          )}
          <LinksSection exercise={exercise} />
          <FilesSection exercise={exercise} />
          {!isNew && <NotesSection exercise={exercise} />}
        </div>
        <aside className="w-80 shrink-0 border-l border-line bg-panel/60 px-5 py-6">
          <Properties exercise={exercise} />
          {!isNew && !archived && !isSong && (
            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button onClick={() => completeExercise(exercise)}>
                <CircleCheck size={14} /> Abschließen
              </Button>
              <Button onClick={() => setCompleting(true)}>
                <Repeat size={14} /> Tauschen
              </Button>
            </div>
          )}
        </aside>
      </div>
      <CompleteExerciseModal exercise={exercise} open={completing} onClose={() => setCompleting(false)} />
      {showProgress && <ProgressWindow exercise={exercise} onClose={() => setShowProgress(false)} />}
      {addingTime && <ManualRunModal exercise={exercise} onClose={() => setAddingTime(false)} />}
    </Modal>
  );
}

function DescriptionSection({ exercise }: { exercise: Exercise }) {
  const [text, setText] = useState(exercise.description);
  useEffect(() => setText(exercise.description), [exercise.description]);
  return (
    <Section title="Beschreibung">
      <Textarea
        className="min-h-28"
        placeholder="Beschreibung…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() =>
          text !== exercise.description &&
          mutate(() => repo.updateExercise(exercise.id, { description: text }))
        }
      />
    </Section>
  );
}

function MetricsSection({ exercise }: { exercise: Exercise }) {
  const { d } = useHobby();
  const metrics = d.metricsOf(exercise.id);
  const runs = d.runsOf(exercise.id);
  const [editing, setEditing] = useState<Metric | "new" | null>(null);

  return (
    <Section
      title="Messwerte"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
          <Plus size={14} /> Messwert
        </Button>
      }
    >
      {metrics.length === 0 ? (
        <Muted>Keine Messwerte.</Muted>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {metrics.map((m) => {
            const cur = aggregateMetric(m, runs, d.byRun);
            return (
              <div key={m.id} className="group rounded-md border border-line p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs text-muted">{m.name}</div>
                    <div className="tabular mt-0.5 text-lg font-semibold">
                      {cur == null ? "–" : formatMetricValue(m, cur)}
                    </div>
                  </div>
                  <div className="flex opacity-0 transition group-hover:opacity-100">
                    <IconButton label="Bearbeiten" onClick={() => setEditing(m)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton
                      label="Löschen"
                      onClick={async () =>
                        (await confirmDialog(`Messwert „${m.name}" mit allen Einträgen löschen?`)) &&
                        mutate(() => repo.deleteMetric(m.id))
                      }
                    >
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted">
                  {m.start_value != null && <span>Start: {formatMetricValue(m, m.start_value)}</span>}
                  {m.target_value != null && <span>Ziel: {formatMetricValue(m, m.target_value)}</span>}
                  <span>{m.kind === "memo" ? "Letzter Stand" : `${m.kind === "time" ? "automatisch · " : ""}${AGG_LABEL[m.aggregation]}`}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <MetricModal
        exerciseId={exercise.id}
        metric={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onClose={() => setEditing(null)}
        position={metrics.length}
      />
    </Section>
  );
}

function RulesSection({ exercise }: { exercise: Exercise }) {
  const { d } = useHobby();
  const completion = d.completion(exercise);
  const [editing, setEditing] = useState<CompletionRule | "new" | null>(null);

  return (
    <Section
      title="Abschlusskriterien"
      actions={
        <Button size="sm" variant="ghost" onClick={() => setEditing("new")}>
          <Plus size={14} /> Kriterium
        </Button>
      }
    >
      {completion.results.length === 0 ? (
        <Muted>Keine Kriterien.</Muted>
      ) : (
        <div className="flex flex-col gap-3">
          {completion.results.map((r, i) => {
            const metric = d.data.metrics.find((m) => m.id === r.rule.metric_id);
            return (
              <div key={r.rule.id} className="group">
                {i > 0 && <div className="mb-3 text-center text-[10px] font-medium text-muted">ODER</div>}
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-1.5">
                        {r.met && <CircleCheck size={14} className="text-ok" />}
                        {RULE_LABEL[r.rule.type]}
                        {metric && <span className="text-muted">· {metric.name}</span>}
                      </span>
                      <span className="tabular text-xs text-muted">{r.label}</span>
                    </div>
                    <ProgressBar value={r.progress} className="mt-1.5" color={r.met ? "var(--ok)" : undefined} />
                  </div>
                  <div className="flex opacity-0 transition group-hover:opacity-100">
                    <IconButton label="Bearbeiten" onClick={() => setEditing(r.rule)}>
                      <Pencil size={14} />
                    </IconButton>
                    <IconButton label="Löschen" onClick={() => mutate(() => repo.deleteRule(r.rule.id))}>
                      <Trash2 size={14} />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <RuleModal
        exerciseId={exercise.id}
        metrics={d.metricsOf(exercise.id).filter((m) => m.kind !== "memo")}
        rule={editing && editing !== "new" ? editing : undefined}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </Section>
  );
}

/** Progress of one exercise: key numbers, metric chart, practice time per week and every run. */
function ProgressWindow({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const { data } = useHobby();
  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-4xl"
      title={
        <span className="flex items-center gap-1.5 font-normal text-muted">
          {data.hobby.name}
          <span className="text-muted/50">/</span>
          {exercise.name}
          <span className="text-muted/50">/</span>
          <span className="font-medium text-fg">Fortschritt</span>
        </span>
      }
    >
      <ProgressContent exercise={exercise} />
    </Modal>
  );
}

/** Minutes practised per calendar week, the last 12 weeks. */
function weeklyMinutes(runs: { started_at: string; duration_sec: number }[]) {
  const monday = (d: Date) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  };
  const start = monday(new Date());
  start.setDate(start.getDate() - 7 * 11);
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const w = new Date(start);
    w.setDate(w.getDate() + i * 7);
    return { key: w.getTime(), label: w.toLocaleDateString("de-DE", { day: "numeric", month: "numeric" }), min: 0 };
  });
  for (const r of runs) {
    const w = weeks.find((x) => x.key === monday(new Date(r.started_at)).getTime());
    if (w) w.min += r.duration_sec / 60;
  }
  return weeks.map((w) => ({ ...w, min: Math.round(w.min) }));
}

function ProgressContent({ exercise }: { exercise: Exercise }) {
  const { d } = useHobby();
  const metrics = d.metricsOf(exercise.id).filter((m) => m.aggregation !== "sum");
  const runs = d.runsOf(exercise.id);
  const [metricId, setMetricId] = useState<number | null>(metrics[0]?.id ?? null);
  const metric = metrics.find((m) => m.id === metricId) ?? metrics[0];
  const [addingTime, setAddingTime] = useState(false);

  const chartData = useMemo(
    () =>
      metric
        ? metricSeries(metric, runs, d.byRun).map((s) => ({
            date: fmtDate(s.run.started_at),
            value: s.value,
          }))
        : [],
    [metric, runs, d.byRun],
  );

  const recent = [...runs].sort((a, b) => b.started_at.localeCompare(a.started_at));
  const allMetrics = d.metricsOf(exercise.id);
  const weeks = useMemo(() => weeklyMinutes(runs), [runs]);
  const completion = d.completion(exercise);
  const tip = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12 };

  return (
    <div className="flex flex-col gap-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Gesamtzeit" value={formatMinutes(totalMinutes(runs))} />
        <Tile label="Durchgänge" value={String(runs.length)} />
        <Tile label="Übungstage" value={String(practiceDays(runs).size)} />
        <Tile
          label="Abschluss"
          value={completion.results.length ? `${Math.round(completion.progress * 100)}%` : "–"}
          bar={completion.results.length ? completion.progress : undefined}
        />
      </div>
      {runs.length > 0 && (
        <Section title="Übungszeit pro Woche">
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeks} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tip} cursor={{ fill: "var(--elev)" }} formatter={(v) => [formatMinutes(Number(v)), "Zeit"]} />
                <Bar dataKey="min" fill="var(--bar)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      )}
    <Section
      title={metric ? `Verlauf: ${metric.name}` : "Verlauf"}
      actions={
        <span className="flex items-center gap-2">
          {metrics.length > 1 && (
            <Select className="h-7 w-40 text-xs" value={metric?.id} onChange={(e) => setMetricId(Number(e.target.value))}>
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          )}
          <Button size="sm" onClick={() => setAddingTime(true)}>
            <ClockPlus size={13} /> Zeit nachtragen
          </Button>
        </span>
      }
    >
      {runs.length === 0 ? (
        <Muted>Noch nicht geübt.</Muted>
      ) : (
        <div className="flex flex-col gap-4">
          {metric && chartData.length > 1 && (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                  />
                  <Tooltip
                    contentStyle={tip}
                    formatter={(v) => [formatMetricValue(metric, Number(v)), metric.name]}
                  />
                  {metric.target_value != null && (
                    <ReferenceLine
                      y={metric.target_value}
                      stroke="var(--ok)"
                      strokeDasharray="4 4"
                      label={{ value: "Ziel", fontSize: 10, fill: "var(--ok)", position: "insideTopRight" }}
                    />
                  )}
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={{ r: 2.5, fill: "var(--accent)" }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Datum</th>
                <th className="pb-2 font-medium">Dauer</th>
                {allMetrics.map((m) => (
                  <th key={m.id} className="pb-2 font-medium">
                    {m.name}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recent.map((r) => (
                <tr key={r.id} className="group">
                  <td className="py-1.5">{fmtDate(r.started_at)}</td>
                  <td className="tabular py-1.5">{formatMinutes(r.duration_sec / 60)}</td>
                  {allMetrics.map((m) => {
                    const v = d.byRun.get(r.id)?.find((x) => x.metric_id === m.id);
                    return (
                      <td key={m.id} className="tabular py-1.5">
                        {v ? formatMetricValue(m, v.value) : "–"}
                      </td>
                    );
                  })}
                  <td className="w-8 py-1.5 text-right">
                    <IconButton
                      label="Eintrag löschen"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={async () =>
                        (await confirmDialog("Diesen Eintrag löschen?")) && mutate(() => repo.deleteRun(r.id))
                      }
                    >
                      <Trash2 size={13} />
                    </IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
    {addingTime && <ManualRunModal exercise={exercise} onClose={() => setAddingTime(false)} />}
    </div>
  );
}

function Tile({ label, value, bar }: { label: string; value: string; bar?: number }) {
  return (
    <div className="rounded-xl border border-line bg-card px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
      {bar != null && <ProgressBar value={bar} className="mt-2" />}
    </div>
  );
}

function NotesSection({ exercise }: { exercise: Exercise }) {
  const { d } = useHobby();
  const notes = d.exerciseNotes(exercise.id);
  const sessions = d.sessionNotes(exercise.id);
  const [text, setText] = useState("");
  const add = async () => {
    if (!text.trim()) return;
    await mutate(() => repo.addNote({ exercise_id: exercise.id, session_id: null, text: text.trim() }));
    setText("");
  };

  return (
    <Section title="Notizen">
      <div className="flex flex-col gap-4">
        <div>
          <div className="mb-2 text-xs font-medium text-muted">Übungsnotizen</div>
          <div className="flex flex-col gap-2">
            {notes.map((n) => (
              <NoteRow key={n.id} id={n.id} text={n.text} date={n.created_at} />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Textarea
              className="min-h-9"
              rows={1}
              placeholder="Neue Notiz…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && add()}
            />
            <Button onClick={add} disabled={!text.trim()}>
              Speichern
            </Button>
          </div>
        </div>
        {sessions.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-medium text-muted">Session-Notizen</div>
            <div className="flex flex-col gap-2">
              {sessions.map((g) => (
                <div key={g.session?.id ?? g.notes[0].id} className="rounded-md border border-line p-3">
                  <div className="mb-1 text-[11px] text-muted">
                    {g.session ? fmtDate(g.session.started_at) : ""}
                  </div>
                  {g.notes.map((n) => (
                    <p key={n.id} className="text-sm whitespace-pre-wrap">
                      {n.text}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

function NoteRow({ id, text, date }: { id: number; text: string; date: string }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  useEffect(() => setValue(text), [text]);
  if (editing)
    return (
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={async () => {
          setEditing(false);
          if (value.trim() && value !== text) await mutate(() => repo.updateNote(id, value.trim()));
        }}
      />
    );
  return (
    <div className="group flex items-start gap-2 rounded-md bg-elev/60 px-3 py-2">
      <p className="flex-1 text-sm whitespace-pre-wrap" onDoubleClick={() => setEditing(true)}>
        {text}
      </p>
      <span className="text-[11px] text-muted">{fmtDate(date)}</span>
      <div className="flex opacity-0 group-hover:opacity-100">
        <IconButton label="Bearbeiten" className="size-6" onClick={() => setEditing(true)}>
          <Pencil size={12} />
        </IconButton>
        <IconButton label="Löschen" className="size-6" onClick={() => mutate(() => repo.deleteNote(id))}>
          <Trash2 size={12} />
        </IconButton>
      </div>
    </div>
  );
}


/** A label/value row in the property column. */
export function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-8 items-start gap-3">
      <span className="w-24 shrink-0 pt-1.5 text-[13px] text-muted">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const ghostSelect =
  "h-8 w-full cursor-pointer rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none hover:bg-elev focus:border-line";

function Properties({ exercise }: { exercise: Exercise }) {
  const { d, data } = useHobby();
  const runs = d.runsOf(exercise.id);
  const routines = d.routinesContaining(exercise.id);
  const isSong = exercise.kind === "song";
  const [bpm, setBpm] = useState(exercise.default_bpm?.toString() ?? "");
  useEffect(() => setBpm(exercise.default_bpm?.toString() ?? ""), [exercise.default_bpm]);

  const save = (patch: Partial<Exercise>) => mutate(() => repo.updateExercise(exercise.id, patch));

  // countdown or stopwatch is switched while practising; only the metronome is chosen here
  const metronome = exercise.tools.includes("metronome");
  const toggleMetronome = () =>
    save({ tools: metronome ? exercise.tools.filter((x) => x !== "metronome") : [...exercise.tools, "metronome"] });

  return (
    <div className="flex flex-col gap-1.5">
      <Prop label="Kategorie">
        <CategoryPicker value={exercise.category_ids} onChange={(ids) => save({ category_ids: ids })} />
      </Prop>
      {isSong && (
        <Prop label="Fortschritt">
          <SongProgress exercise={exercise} className="pt-2" />
        </Prop>
      )}
      {!isSong && hasMetronome(data.hobby) && (
        <Prop label="Metronom">
          <button type="button" aria-label="Metronom" className="flex pt-1.5" onClick={toggleMetronome}>
            <Switch on={metronome} />
          </button>
        </Prop>
      )}
      {!isSong && exercise.tools.includes("metronome") && hasMetronome(data.hobby) && (
        <Prop label="Start-Tempo">
          <input
            className={ghostSelect}
            inputMode="numeric"
            placeholder="BPM"
            value={bpm}
            onChange={(e) => setBpm(e.target.value)}
            onBlur={() => save({ default_bpm: bpm ? Number(bpm) : null })}
          />
        </Prop>
      )}
      {!isSong && <Prop label="Nachfolger">
        <Select
          ghost
          value={exercise.successor_id ?? ""}
          onChange={(e) => save({ successor_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Keiner</option>
          {d.active
            .filter((e) => e.id !== exercise.id)
            .map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
        </Select>
      </Prop>}
      <Prop label="Routinen">
        <div className="flex flex-col gap-0.5 pt-1.5 text-[13px]">
          {routines.length === 0 && <span className="text-muted">Keine</span>}
          {routines.map((r) => (
            <button
              key={r.id}
              className="flex items-center gap-1.5 text-left hover:underline"
              onClick={() => {
                openRoutineFromExercise(r.id, exercise.id);
              }}
            >
              <Repeat size={12} className="text-muted" /> {r.name}
            </button>
          ))}
        </div>
      </Prop>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-4 text-center">
        <Stat label="Gesamt" value={formatMinutes(totalMinutes(runs))} />
        <Stat label="Durchgänge" value={String(runs.length)} />
        <Stat label="Tage" value={String(practiceDays(runs).size)} />
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Erstellt am {new Date(exercise.created_at).toLocaleDateString("de-DE", { day: "numeric", month: "short", year: "numeric" })}
      </p>
    </div>
  );
}

function LinksSection({ exercise }: { exercise: Exercise }) {
  const { data } = useHobby();
  const links = data.links.filter((l) => l.exercise_id === exercise.id);
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const add = async () => {
    const u = url.trim();
    setAdding(false);
    if (!u) return;
    await mutate(() => repo.addLink({ exercise_id: exercise.id, url: u, title: "" }));
    setUrl("");
  };

  return (
    <Section
      title="Links"
      actions={
        <IconButton label="Link hinzufügen" className="size-6" onClick={() => setAdding(true)}>
          <Plus size={14} />
        </IconButton>
      }
    >
      {links.length === 0 && !adding && <Muted>Keine Links.</Muted>}
      <div className="flex flex-col gap-0.5">
        {links.map((l) => (
          <div key={l.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-elev/60">
            <button className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline" onClick={() => openExternal(l.url)}>
              <ExternalLink size={13} className="shrink-0 text-muted" />
              <span className="truncate">{l.title || l.url.replace(/^https?:\/\//, "")}</span>
            </button>
            <IconButton
              label="Link entfernen"
              className="size-6 opacity-0 group-hover:opacity-100"
              onClick={() => mutate(() => repo.deleteLink(l.id))}
            >
              <Trash2 size={12} />
            </IconButton>
          </div>
        ))}
      </div>
      {adding && (
        <input
          autoFocus
          className="mt-1 h-8 w-full rounded-lg border border-input bg-bg dark:bg-white/[0.03] px-2.5 text-sm outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
            if (e.key === "Escape") {
              e.stopPropagation();
              setAdding(false);
            }
          }}
        />
      )}
    </Section>
  );
}

function FilesSection({ exercise }: { exercise: Exercise }) {
  const { data } = useHobby();
  const files = data.attachments.filter((a) => a.exercise_id === exercise.id);
  const fileUnused = useFileUnused();

  const addFiles = async () => {
    try {
      const picked = await pickAttachments();
      if (picked.length === 0) return;
      await mutate(async () => {
        for (const f of picked) await repo.addAttachment({ exercise_id: exercise.id, kind: "file", ...f });
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };
  const addFolder = async () => {
    try {
      const picked = await pickFolder();
      if (picked) await mutate(() => repo.addAttachment({ exercise_id: exercise.id, kind: "folder", ...picked }));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Section
      title="Anhänge"
      actions={
        <span className="flex items-center gap-0.5">
          <IconButton label="Ordner verknüpfen" className="size-6" onClick={addFolder}>
            <FolderPlus size={13} />
          </IconButton>
          <IconButton label="Datei anhängen" className="size-6" onClick={addFiles}>
            <Paperclip size={13} />
          </IconButton>
        </span>
      }
    >
      {files.length === 0 ? (
        <Muted>Keine Anhänge.</Muted>
      ) : (
        <div className="flex flex-col gap-0.5">
          {files.map((f) => (
            <div key={f.id} className="group flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-elev/60">
              <button
                className="flex min-w-0 flex-1 items-center gap-2 text-left hover:underline"
                title={f.path}
                onClick={() => openAttachment(f.path, f.kind).catch((e) => toast(String(e)))}
              >
                {f.kind === "folder" ? (
                  <Folder size={13} className="shrink-0 text-muted" />
                ) : (
                  <Paperclip size={13} className="shrink-0 text-muted" />
                )}
                <span className="truncate">{f.name}</span>
              </button>
              <IconButton
                label="Anhang entfernen"
                className="size-6 opacity-0 group-hover:opacity-100"
                onClick={async () => {
                  if (!(await confirmDialog(`„${f.name}" entfernen?`))) return;
                  const unused = fileUnused(f);
                  await mutate(() => repo.deleteAttachmentRow(f.id));
                  if (unused) await deleteAttachmentFile(f.path).catch(() => {});
                }}
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="tabular text-sm font-semibold">{value}</dd>
      <dt className="text-[10px] text-muted">{label}</dt>
    </div>
  );
}
