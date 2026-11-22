import clsx from "clsx";
import { deleteWithUndo } from "../lib/undo";
import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as repo from "../db/repo";
import type { Topic, TopicStage } from "../db/types";
import { mutate } from "../lib/store";
import { closeTopic, openTopic, useUi } from "../lib/uiState";
import { Prop, Section } from "./ExerciseDialog";
import { useHobby } from "./HobbyContext";
import { Button, CreateMoreToggle, IconButton, Modal, ProgressRing, Select, useCreateMore } from "./ui";

/** Creates an empty plan item (optionally below another one) and opens it in the window. */
export async function createAndOpenTopic(baseId: number, parentId: number | null = null) {
  const id = await mutate(() =>
    repo.createTopic({ base_id: baseId, parent_id: parentId, title: "", position: Math.floor(Date.now() / 1000) }),
  );
  openTopic(id, true);
}

export function TopicDialog() {
  const { topic: open } = useUi();
  const { data } = useHobby();
  const topic = open ? data.topics.find((t) => t.id === open.id) : undefined;
  if (!open || !topic) return null;
  return <TopicWindow key={topic.id} topic={topic} isNew={open.isNew} />;
}

export const STAGES: { value: TopicStage; label: string }[] = [
  { value: "new", label: "Neu" },
  { value: "learning", label: "Am Lernen" },
  { value: "understood", label: "Verstanden" },
];
export const stageLabel = (s: TopicStage) => STAGES.find((x) => x.value === s)!.label;

/** Changes the stage; "understood" also keeps the date it was reached. */
export const setStage = (topic: Topic, stage: TopicStage) =>
  mutate(() =>
    repo.updateTopic(topic.id, {
      stage,
      done_at: stage === "understood" ? (topic.done_at ?? new Date().toISOString()) : null,
    }),
  );

const NEXT_STAGE: Record<TopicStage, TopicStage> = { new: "learning", learning: "understood", understood: "new" };

/** Ring that shows the stage: empty = new, half = learning, filled = understood. Click for the next stage. */
export function StageButton({ topic, size = "sm" }: { topic: Topic; size?: "sm" | "lg" }) {
  const next = NEXT_STAGE[topic.stage];
  return (
    <button
      type="button"
      aria-label={`${stageLabel(topic.stage)} – weiter zu „${stageLabel(next)}“`}
      title={stageLabel(topic.stage)}
      onClick={(e) => {
        e.stopPropagation();
        setStage(topic, next);
      }}
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border transition-colors",
        size === "lg" ? "size-6" : "size-4",
        topic.stage === "understood" && "border-ok bg-ok text-white",
        topic.stage === "learning" && "border-accent",
        topic.stage === "new" && "border-muted/60 hover:border-accent",
      )}
    >
      {topic.stage === "learning" && <span className="absolute inset-y-0 left-0 w-1/2 bg-accent" />}
      {topic.stage === "understood" && <Check size={size === "lg" ? 14 : 10} strokeWidth={3} />}
    </button>
  );
}

/** Window of a plan item, built like the exercise window. */
function TopicWindow({ topic, isNew }: { topic: Topic; isNew: boolean }) {
  const { d, data } = useHobby();
  const kb = data.knowledgeBases.find((k) => k.id === topic.base_id);
  const [title, setTitle] = useState(topic.title);
  const [content, setContent] = useState(topic.content);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setTitle(topic.title), [topic.title]);

  const outline = d.planOutline(topic.base_id);
  const below = new Set(d.subtree(topic.id).map((t) => t.id));
  const children = outline.find((r) => r.topic.id === topic.id)?.children ?? [];
  const parent = data.topics.find((t) => t.id === topic.parent_id);

  const save = (p: Partial<Topic>) => mutate(() => repo.updateTopic(topic.id, p));
  const saveText = async () => {
    const patch: Partial<Topic> = {};
    if (title.trim() && title.trim() !== topic.title) patch.title = title.trim();
    if (content !== topic.content) patch.content = content;
    if (Object.keys(patch).length) await save(patch);
  };
  const discard = async () => {
    closeTopic();
    await mutate(() => repo.deleteTopic(topic.id));
  };
  const close = async () => {
    if (isNew && !title.trim()) return discard();
    await saveText();
    closeTopic();
  };
  const [more, setMore] = useCreateMore();
  const create = async () => {
    if (!title.trim()) return titleRef.current?.focus();
    await close();
    if (more) await createAndOpenTopic(topic.base_id, topic.parent_id);
  };
  const remove = () => {
    closeTopic();
    deleteWithUndo("topic", topic.id, topic.title, () => repo.deleteTopic(topic.id));
  };
  const moveToPlan = async (baseId: number) => {
    await mutate(async () => {
      for (const id of below) await repo.updateTopic(id, { base_id: baseId });
      await repo.updateTopic(topic.id, { parent_id: null, position: Math.floor(Date.now() / 1000) });
    });
  };

  return (
    <Modal
      open
      onClose={close}
      width="max-w-4xl"
      noPadding
      title={
        <span className="flex items-center gap-1.5 font-normal text-muted">
          {data.hobby.name}
          <span className="text-muted/50">/</span>
          {kb?.name}
          {parent && (
            <>
              <span className="text-muted/50">/</span>
              <button className="truncate hover:text-fg" onClick={() => close().then(() => openTopic(parent.id))}>
                {parent.title}
              </button>
            </>
          )}
          <span className="text-muted/50">/</span>
          <span className="font-medium text-fg">{isNew ? "Neues Thema" : "Thema"}</span>
        </span>
      }
      headerRight={
        !isNew && (
          <IconButton label="Löschen" onClick={remove}>
            <Trash2 size={14} />
          </IconButton>
        )
      }
      footer={
        isNew && (
          <>
            <CreateMoreToggle on={more} onChange={setMore} />
            <Button variant="ghost" onClick={discard}>
              Abbrechen
            </Button>
            <Button variant="primary" onClick={create} disabled={!title.trim()}>
              Erstellen
            </Button>
          </>
        )
      }
    >
      <div className="flex min-h-full items-stretch">
        <div className="min-w-0 flex-1 space-y-8 px-8 py-7">
          <div className="flex items-start gap-3">
            {!isNew && (
              <span className="pt-1.5">
                <StageButton topic={topic} size="lg" />
              </span>
            )}
            <textarea
              ref={titleRef}
              rows={1}
              autoFocus={isNew}
              className={clsx(
                "w-full resize-none bg-transparent text-2xl font-semibold tracking-tight outline-none [field-sizing:content] placeholder:text-muted/50",
              )}
              placeholder="Titel"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => !isNew && saveText()}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (isNew) create();
                  else (e.target as HTMLTextAreaElement).blur();
                }
              }}
            />
          </div>
          <Section title="Notizen">
            <textarea
              className="min-h-32 w-full resize-none rounded-lg border border-input bg-bg dark:bg-white/[0.03] px-3 py-2 text-sm leading-relaxed shadow-xs outline-none [field-sizing:content] placeholder:text-muted/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20"
              placeholder="Notizen, Links, Gelerntes …"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onBlur={() => !isNew && saveText()}
            />
          </Section>
          {!isNew && (
            <Section
              title="Unterthemen"
              actions={
                children.length > 0 && (
                  <span className="tabular text-xs text-muted">
                    {children.filter((c) => c.done_at).length}/{children.length}
                  </span>
                )
              }
            >
              <SubItems topic={topic} items={children} onOpen={(id) => close().then(() => openTopic(id))} />
            </Section>
          )}
        </div>
        <aside className="w-72 shrink-0 border-l border-line bg-panel/60 px-5 py-6">
          <div className="flex flex-col gap-1.5 text-[13px]">
            <Prop label="Stand">
              <Select ghost value={topic.stage} onChange={(e) => setStage(topic, e.target.value as TopicStage)}>
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Prop>
            <Prop label="Plan">
              <Select ghost value={topic.base_id} onChange={(e) => moveToPlan(Number(e.target.value))}>
                {data.knowledgeBases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Prop>
            <Prop label="Gehört zu">
              <Select
                ghost
                value={topic.parent_id ?? ""}
                onChange={(e) =>
                  save({ parent_id: e.target.value ? Number(e.target.value) : null, position: Math.floor(Date.now() / 1000) })
                }
              >
                <option value="">– oberste Ebene –</option>
                {outline
                  .filter((r) => !below.has(r.topic.id))
                  .map((r) => (
                    <option key={r.topic.id} value={r.topic.id}>
                      {" ".repeat(r.depth)}
                      {r.topic.title || "Ohne Titel"}
                    </option>
                  ))}
              </Select>
            </Prop>
            {children.length > 0 && (
              <Prop label="Fortschritt">
                <span className="flex items-center gap-2 pt-1.5">
                  <ProgressRing value={children.filter((c) => c.done_at).length / children.length} className="text-muted" />
                  <span className="tabular">
                    {children.filter((c) => c.done_at).length} von {children.length}
                  </span>
                </span>
              </Prop>
            )}
          </div>
          <div className="mt-5 flex flex-col gap-1 border-t border-line pt-4 text-[11px] text-muted">
            <span>Erstellt am {new Date(topic.created_at).toLocaleDateString("de-DE")}</span>
            {topic.done_at && <span>Verstanden am {new Date(topic.done_at).toLocaleDateString("de-DE")}</span>}
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function SubItems({ topic, items, onOpen }: { topic: Topic; items: Topic[]; onOpen: (id: number) => void }) {
  const { d } = useHobby();
  const [title, setTitle] = useState("");
  const add = async () => {
    if (!title.trim()) return;
    await mutate(() =>
      repo.createTopic({
        base_id: topic.base_id,
        parent_id: topic.id,
        title: title.trim(),
        position: Math.floor(Date.now() / 1000),
      }),
    );
    setTitle("");
  };
  return (
    <div className="flex flex-col">
      {items.map((c) => {
        const sub = d.subtree(c.id).length - 1;
        return (
          <div key={c.id} className="group flex h-9 items-center gap-2.5 rounded-md px-2 hover:bg-elev/60">
            <StageButton topic={c} />
            <button
              onClick={() => onOpen(c.id)}
              className={clsx("min-w-0 flex-1 truncate text-left text-sm", c.done_at && "text-muted")}
            >
              {c.title}
            </button>
            {sub > 0 && <span className="tabular text-[11px] text-muted">{sub} Unterthemen</span>}
          </div>
        );
      })}
      <div className="mt-1 flex h-9 items-center gap-2.5 px-2">
        <Plus size={14} className="text-muted" />
        <input
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
          placeholder="Unterthema hinzufügen …"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
      </div>
    </div>
  );
}
