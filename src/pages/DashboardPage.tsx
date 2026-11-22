import { CalendarDays, CircleCheck, Clock, Flame, ListChecks, Play } from "lucide-react";
import { FlowMinutes, Num } from "../components/flow";
import { useMemo, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CategoryBadges } from "../components/categories";
import { useHobby } from "../components/HobbyContext";
import { HobbyHeader, PageBody } from "../components/Layout";
import { openExercise, openRoutine } from "../lib/uiState";
import { Button, Card, EmptyState, Muted, ProgressBar, Section } from "../components/ui";
import {
  currentStreak,
  dateKey,
  formatMinutes,
  minutesSince,
  parseDateKey,
  practiceDays,
  totalMinutes,
} from "../domain/progress";
import { GoalRow } from "./GoalsPage";

export function DashboardPage() {
  const { data, d, base } = useHobby();
  const navigate = useNavigate();

  const stats = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 6);
    weekAgo.setHours(0, 0, 0, 0);
    const days = practiceDays(data.runs);
    return {
      streak: currentStreak(days, new Date()),
      week: minutesSince(data.runs, weekAgo),
      weekDays: [...days].filter((k) => parseDateKey(k) >= weekAgo).length,
      total: totalMinutes(data.runs),
    };
  }, [data.runs]);

  const active = d.planned;
  const openGoals = data.goals
    .filter((g) => g.status === "open")
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));
  const phase = d.activePhase();
  const hasData = data.exercises.length > 0;

  return (
    <>
      <HobbyHeader />
      <PageBody>
        {!hasData ? (
          <EmptyState
            icon={<ListChecks size={28} />}
            title="Los geht's"
            action={
              <div className="flex gap-2">
                <Button variant="primary" onClick={() => navigate(`${base}/exercises`)}>
                  Übungen anlegen
                </Button>
              </div>
            }
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard icon={<Flame size={16} />} label="Serie" value={<Num value={stats.streak} suffix={stats.streak === 1 ? " Tag" : " Tage"} />} />
              <StatCard
                icon={<CalendarDays size={16} />}
                label="Letzte 7 Tage"
                value={<FlowMinutes min={stats.week} />}
                hint={`an ${stats.weekDays} von 7 Tagen`}
              />
              <StatCard icon={<Clock size={16} />} label="Gesamt" value={<FlowMinutes min={stats.total} />} />
              <StatCard icon={<ListChecks size={16} />} label="Übungen in Routinen" value={<Num value={active.length} />} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_24rem]">
              <div className="flex min-w-0 flex-col gap-4">
                <Section title="Routinen">
                  {data.routines.filter((r) => !r.archived_at).length === 0 ? (
                    <Muted>Keine.</Muted>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                      {data.routines.filter((r) => !r.archived_at).map((r) => {
                        const items = d.routineItems(r.id);
                        const total = items.reduce((a, i) => a + i.duration_min, 0);
                        return (
                          <div key={r.id} className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2.5">
                            <button onClick={() => openRoutine(r.id)} className="min-w-0 text-left">
                              <div className="truncate text-sm font-medium hover:underline">{r.name}</div>
                              <div className="text-xs text-muted">
                                {formatMinutes(total)} · {items.length} Übungen
                              </div>
                            </button>
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={items.length === 0}
                              onClick={() => navigate(`${base}/practice/routine/${r.id}`)}
                            >
                              <Play size={12} /> Start
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>

                <Section title="Aktuelle Übungen">
                  {active.length === 0 ? (
                    <Muted>Keine.</Muted>
                  ) : (
                    <div className="flex flex-col divide-y divide-line">
                      {active.map((e) => {
                        const c = d.completion(e);
                        const ready = c.complete;
                        const main = c.results.reduce<(typeof c.results)[number] | null>(
                          (best, r) => (!best || r.progress > best.progress ? r : best),
                          null,
                        );
                        return (
                          <button
                            key={e.id}
                            onClick={() => openExercise(e.id)}
                            className="flex w-full items-center gap-3 py-2.5 text-left first:pt-0 last:pb-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate text-sm font-medium hover:underline">{e.name}</span>
                                <CategoryBadges ids={e.category_ids} max={2} />
                                {ready && (
                                  <span className="flex items-center gap-1 text-[11px] text-ok">
                                    <CircleCheck size={12} /> bereit zum Tauschen
                                  </span>
                                )}
                              </div>
                              {main && (
                                <div className="mt-1.5 flex items-center gap-2">
                                  <ProgressBar value={c.progress} color={ready ? "var(--ok)" : undefined} />
                                  <span className="tabular w-36 shrink-0 text-right text-[11px] text-muted">
                                    {main.label}
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </Section>

                <Section title="Übungstage">
                  <Heatmap />
                </Section>
              </div>

              <div className="flex flex-col gap-4">
                {phase && (
                  <Card className="p-4">
                    <div className="text-xs text-muted">Aktuelle Phase</div>
                    <Link to={`${base}/phases`} className="mt-0.5 block text-sm font-semibold hover:underline">
                      {phase.name}
                    </Link>
                    {phase.description && <p className="mt-1 text-xs text-muted">{phase.description}</p>}
                    {phase.end_date && (
                      <p className="mt-2 text-xs text-muted">
                        bis {parseDateKey(phase.end_date).toLocaleDateString("de-DE")}
                      </p>
                    )}
                  </Card>
                )}
                {data.knowledgeBases.length > 0 && (
                  <Section
                    title="Plan"
                    actions={
                      <Link to={`${base}/plan`} className="text-xs text-muted hover:text-fg">
                        Alle
                      </Link>
                    }
                  >
                    <div className="flex flex-col gap-3">
                      {data.knowledgeBases.map((kb) => {
                        const topics = d.topicsOf(kb.id);
                        const done = topics.filter((t) => t.done_at).length;
                        const next = d.nextTopic(kb.id);
                        return (
                          <Link key={kb.id} to={`${base}/plan/${kb.id}`} className="group block">
                            <div className="flex items-baseline justify-between text-sm">
                              <span className="font-medium group-hover:underline">{kb.name}</span>
                              <span className="tabular text-xs text-muted">
                                {done}/{topics.length}
                              </span>
                            </div>
                            <ProgressBar value={topics.length ? done / topics.length : 0} className="mt-1.5" />
                            {next && <p className="mt-1 truncate text-xs text-muted">{next.title}</p>}
                          </Link>
                        );
                      })}
                    </div>
                  </Section>
                )}
                <Section
                  title="Ziele"
                  actions={
                    <Link to={`${base}/goals`} className="text-xs text-muted hover:text-fg">
                      Alle
                    </Link>
                  }
                >
                  {openGoals.length === 0 ? (
                    <Muted>Keine.</Muted>
                  ) : (
                    <div className="-m-1 flex flex-col gap-2">
                      {openGoals.slice(0, 5).map((g) => (
                        <GoalRow key={g.id} goal={g} compact />
                      ))}
                    </div>
                  )}
                </Section>
                <Section title="Zeit nach Kategorie · 30 Tage">
                  <CategoryTime />
                </Section>
              </div>
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted">
        {icon}
        {label}
      </div>
      <div className="tabular mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </Card>
  );
}

const WEEKS = 20;

function Heatmap() {
  const { data } = useHobby();
  const { cells, max } = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const r of data.runs) {
      const k = dateKey(new Date(r.started_at));
      perDay.set(k, (perDay.get(k) ?? 0) + r.duration_sec / 60);
    }
    // start on the Monday WEEKS-1 weeks ago
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (WEEKS - 1) * 7);
    const today = dateKey(new Date());
    const cells: { key: string; min: number; future: boolean }[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = dateKey(d);
      cells.push({ key, min: perDay.get(key) ?? 0, future: key > today });
    }
    return { cells, max: Math.max(30, ...perDay.values()) };
  }, [data.runs]);

  return (
    <div className="overflow-x-auto">
      <div className="grid w-fit grid-flow-col grid-rows-7 gap-[3px]">
        {cells.map((c) => (
          <div
            key={c.key}
            title={`${parseDateKey(c.key).toLocaleDateString("de-DE")}: ${c.min ? formatMinutes(c.min) : "–"}`}
            className="size-3 rounded-[3px]"
            style={{
              backgroundColor: c.future
                ? "transparent"
                : c.min === 0
                  ? "var(--elev)"
                  : `color-mix(in srgb, var(--accent) ${Math.round(25 + (c.min / max) * 75)}%, transparent)`,
            }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between text-[10px] text-muted">
        <span>vor {WEEKS} Wochen</span>
        <span>heute</span>
      </div>
    </div>
  );
}

function CategoryTime() {
  const { data, d } = useHobby();
  const rows = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const per = new Map<number | null, number>();
    for (const r of data.runs) {
      if (new Date(r.started_at) < since) continue;
      // time of an exercise with several categories is split between them
      const cats = d.exercise(r.exercise_id)?.category_ids ?? [];
      const keys = cats.length ? cats : [null];
      for (const cat of keys) per.set(cat, (per.get(cat) ?? 0) + r.duration_sec / 60 / keys.length);
    }
    return [...per.entries()]
      .map(([id, min]) => ({ cat: d.category(id), min }))
      .sort((a, b) => b.min - a.min);
  }, [data.runs, d]);

  if (rows.length === 0) return <Muted>–</Muted>;
  const max = rows[0].min;
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.cat?.id ?? "none"}>
          <div className="mb-1 flex justify-between text-xs">
            <span>{r.cat?.name ?? "Ohne Kategorie"}</span>
            <span className="tabular text-muted">{formatMinutes(r.min)}</span>
          </div>
          <ProgressBar value={r.min / max} color={r.cat?.color ?? "var(--muted)"} />
        </div>
      ))}
    </div>
  );
}
