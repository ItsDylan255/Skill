import { useEffect, useState } from "react";
import { createMetric, createRule, updateMetric, updateRule } from "../db/repo";
import type { Aggregation, CompletionRule, Metric, MetricKind, RuleType } from "../db/types";
import { mutate } from "../lib/store";
import { Button, DateInput, Field, Input, Modal, Select } from "./ui";

export const AGG_LABEL: Record<Aggregation, string> = {
  latest: "Letzter Wert",
  max: "Bester Wert (höchster)",
  min: "Bester Wert (niedrigster)",
  sum: "Summe aller Einträge",
};

export const RULE_LABEL: Record<RuleType, string> = {
  metric: "Messwert erreicht",
  total_time: "Gesamte Übungszeit",
  days: "Anzahl Übungstage",
  sessions: "Anzahl Durchgänge",
  date: "Bis Datum",
  checklist: "Checkliste vollständig",
};

const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const str = (n: number | null | undefined) => (n == null ? "" : String(n));
/** Time values are stored in minutes but entered in hours. */
const hoursStr = (min: number | null | undefined) =>
  min == null ? "" : String(Math.round((min / 60) * 100) / 100);
const fromHours = (s: string) => {
  const h = num(s);
  return h == null ? null : Math.round(h * 60);
};

export function MetricModal({
  exerciseId,
  metric,
  open,
  onClose,
  position,
}: {
  exerciseId: number;
  metric?: Metric;
  open: boolean;
  onClose: () => void;
  position: number;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<MetricKind>("number");
  const [unit, setUnit] = useState("");
  const [agg, setAgg] = useState<Aggregation>("max");
  const [start, setStart] = useState("");
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (!open) return;
    const isTime = metric?.kind === "time";
    setName(metric?.name ?? "");
    setKind(metric?.kind ?? "number");
    setUnit(metric?.unit ?? "");
    setAgg(metric?.aggregation ?? "max");
    setStart(isTime ? hoursStr(metric?.start_value) : str(metric?.start_value));
    setTarget(isTime ? hoursStr(metric?.target_value) : str(metric?.target_value));
  }, [open, metric]);

  const isTime = kind === "time";
  const isMemo = kind === "memo";
  const submit = async () => {
    if (!name.trim()) return;
    const row = {
      name: name.trim(),
      kind,
      unit: isTime ? "" : unit.trim(),
      aggregation: isMemo ? ("latest" as const) : agg,
      start_value: isMemo ? null : isTime ? fromHours(start) : num(start),
      target_value: isMemo ? null : isTime ? fromHours(target) : num(target),
    };
    await mutate<unknown>(() =>
      metric
        ? updateMetric(metric.id, row)
        : createMetric({ ...row, exercise_id: exerciseId, position }),
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={metric ? "Messwert bearbeiten" : "Neuer Messwert"}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            Speichern
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Art">
          <Select
            value={kind}
            onChange={(e) => {
              const k = e.target.value as MetricKind;
              setKind(k);
              if (k === "time") setAgg("sum");
            }}
          >
            <option value="number">Zahl (selbst eintragen)</option>
            <option value="memo">Wert merken (letzter Stand)</option>
            <option value="time">Zeit (automatisch aus Übungsdauer)</option>
          </Select>
        </Field>
        {!isTime && (
          <Field label="Einheit">
            <Input value={unit} placeholder="BPM, Wdh., Karten…" onChange={(e) => setUnit(e.target.value)} />
          </Field>
        )}
        {!isMemo && (
          <>
            <Field label="Wertung">
              <Select value={agg} onChange={(e) => setAgg(e.target.value as Aggregation)}>
                {(Object.keys(AGG_LABEL) as Aggregation[]).map((a) => (
                  <option key={a} value={a}>
                    {AGG_LABEL[a]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={isTime ? "Startwert (Stunden)" : "Startwert"}>
              <Input inputMode="decimal" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label={isTime ? "Zielwert (Stunden)" : "Zielwert"}>
              <Input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}

export function RuleModal({
  exerciseId,
  metrics,
  rule,
  open,
  onClose,
}: {
  exerciseId: number;
  metrics: Metric[];
  rule?: CompletionRule;
  open: boolean;
  onClose: () => void;
}) {
  const [type, setType] = useState<RuleType>("metric");
  const [metricId, setMetricId] = useState("");
  const [threshold, setThreshold] = useState("");
  const [count, setCount] = useState("1");
  const [date, setDate] = useState("");

  const metric = metrics.find((m) => String(m.id) === metricId);
  const timeInput = type === "total_time" || metric?.kind === "time";

  useEffect(() => {
    if (!open) return;
    const t = rule?.type ?? (metrics.length > 0 ? "metric" : "total_time");
    const m = metrics.find((x) => x.id === rule?.metric_id) ?? metrics[0];
    setType(t);
    setMetricId(m ? String(m.id) : "");
    const isTime = t === "total_time" || (t === "metric" && m?.kind === "time");
    const defaultThreshold = rule?.threshold ?? (t === "metric" ? m?.target_value : null);
    setThreshold(isTime ? hoursStr(defaultThreshold) : str(defaultThreshold));
    setCount(String(rule?.required_count ?? 1));
    setDate(rule?.date ?? "");
  }, [open, rule, metrics]);

  const submit = async () => {
    const row = {
      type,
      metric_id: type === "metric" ? Number(metricId) || null : null,
      threshold: timeInput ? fromHours(threshold) : num(threshold),
      required_count: Math.max(1, Number(count) || 1),
      date: type === "date" ? date || null : null,
    };
    await mutate<unknown>(() =>
      rule ? updateRule(rule.id, row) : createRule({ ...row, exercise_id: exerciseId }),
    );
    onClose();
  };

  const valid =
    (type === "metric" && metricId && threshold) ||
    ((type === "total_time" || type === "days" || type === "sessions") && threshold) ||
    (type === "date" && date) ||
    type === "checklist";

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? "Kriterium bearbeiten" : "Neues Abschlusskriterium"}
      footer={
        <>
          <Button onClick={onClose}>Abbrechen</Button>
          <Button variant="primary" onClick={submit} disabled={!valid}>
            Speichern
          </Button>
        </>
      }
    >
      <Field label="Art">
        <Select value={type} onChange={(e) => setType(e.target.value as RuleType)}>
          {(Object.keys(RULE_LABEL) as RuleType[]).filter((t) => t !== "checklist" || rule?.type === "checklist").map((t) => (
            <option key={t} value={t} disabled={t === "metric" && metrics.length === 0}>
              {RULE_LABEL[t]}
              {t === "metric" && metrics.length === 0 ? " (erst Messwert anlegen)" : ""}
            </option>
          ))}
        </Select>
      </Field>

      {type === "metric" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Messwert">
            <Select value={metricId} onChange={(e) => setMetricId(e.target.value)}>
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={metric?.kind === "time" ? "Schwelle (Stunden)" : `Schwelle${metric?.unit ? ` (${metric.unit})` : ""}`}>
            <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </Field>
          {metric && metric.aggregation !== "sum" && (
            <Field label="Wie oft erreicht?">
              <Input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
          )}
        </div>
      )}
      {type === "total_time" && (
        <Field label="Gesamtzeit (Stunden)">
          <Input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
      )}
      {(type === "days" || type === "sessions") && (
        <Field label={type === "days" ? "Anzahl Tage" : "Anzahl Durchgänge"}>
          <Input inputMode="numeric" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
        </Field>
      )}
      {type === "date" && (
        <Field label="Datum">
          <DateInput value={date} onChange={setDate} />
        </Field>
      )}
    </Modal>
  );
}
