import { useState } from "react";
import * as repo from "../db/repo";
import type { Exercise } from "../db/types";
import { dateKey, parseDateKey } from "../domain/progress";
import { mutate } from "../lib/store";
import { useHobby } from "./HobbyContext";
import { Button, DateInput, Field, Input, Modal, toast } from "./ui";

const num = (v: string) => {
  const n = Number(v.trim().replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

/** Adds practice that happened outside the app, e.g. an hour of Spanish on the go. */
export function ManualRunModal({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const { d, data } = useHobby();
  const metrics = d.metricsOf(exercise.id);
  const entered = metrics.filter((m) => m.kind !== "time");
  const [date, setDate] = useState(dateKey(new Date()));
  const [minutes, setMinutes] = useState("");
  const [values, setValues] = useState<Record<number, string>>({});
  const min = num(minutes);
  const valid = min != null && min > 0;

  const save = async () => {
    if (!valid) return;
    // midday of the chosen day, so the entry lands on that day in every time zone view
    const day = parseDateKey(date);
    day.setHours(12);
    const entries = [
      ...metrics.filter((m) => m.kind === "time").map((m) => ({ metric_id: m.id, value: Math.round(min * 10) / 10 })),
      ...entered
        .map((m) => ({ metric_id: m.id, value: num(values[m.id] ?? "") }))
        .filter((x): x is { metric_id: number; value: number } => x.value != null),
    ];
    await mutate(() => repo.addManualRun(data.hobby.id, exercise.id, day.toISOString(), min * 60, entries));
    toast(`${Math.round(min)} min bei „${exercise.name}" nachgetragen`);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Zeit nachtragen"
      width="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button variant="primary" onClick={save} disabled={!valid}>
            Hinzufügen
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Datum">
          <DateInput value={date} onChange={setDate} />
        </Field>
        <Field label="Dauer (min)">
          <Input
            autoFocus
            inputMode="decimal"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </Field>
        {entered.map((m) => (
          <Field key={m.id} label={m.unit ? `${m.name} (${m.unit})` : m.name}>
            <Input
              inputMode="decimal"
              value={values[m.id] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [m.id]: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </Field>
        ))}
      </div>
    </Modal>
  );
}
