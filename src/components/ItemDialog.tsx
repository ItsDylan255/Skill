import clsx from "clsx";
import { Check, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as repo from "../db/repo";
import type { Item } from "../db/types";
import { openExternal } from "../lib/platform";
import { mutate } from "../lib/store";
import { closeItem, openItem, useUi } from "../lib/uiState";
import { CategoryPicker } from "./categories";
import { Prop, Section } from "./ExerciseDialog";
import { useHobby } from "./HobbyContext";
import { Button, confirmDialog, CreateMoreToggle, IconButton, Modal, Select, useCreateMore } from "./ui";

/** Creates an empty list entry and opens it in the window. */
export async function createAndOpenItem(hobbyId: number, categoryIds: number[] = []) {
  const id = await mutate(() => repo.createItem(hobbyId, { title: "", category_ids: categoryIds }));
  openItem(id, true);
}

export function ItemDialog() {
  const { item: open } = useUi();
  const { data } = useHobby();
  const item = open ? data.items.find((i) => i.id === open.id) : undefined;
  if (!open || !item) return null;
  return <ItemWindow key={item.id} item={item} isNew={open.isNew} />;
}

export function ItemCheck({ item, size = "sm" }: { item: Item; size?: "sm" | "lg" }) {
  const done = !!item.done_at;
  return (
    <button
      type="button"
      aria-label={done ? "Als offen markieren" : "Abhaken"}
      onClick={(e) => {
        e.stopPropagation();
        mutate(() => repo.updateItem(item.id, { done_at: done ? null : new Date().toISOString() }));
      }}
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-full border transition-colors",
        size === "lg" ? "size-6" : "size-4",
        done ? "border-ok bg-ok text-white" : "border-muted/60 hover:border-ok",
      )}
    >
      {done && <Check size={size === "lg" ? 14 : 10} strokeWidth={3} />}
    </button>
  );
}

/** Window of a list entry, built like the exercise window. */
function ItemWindow({ item, isNew }: { item: Item; isNew: boolean }) {
  const { data } = useHobby();
  const [title, setTitle] = useState(item.title);
  const [notes, setNotes] = useState(item.notes);
  const [url, setUrl] = useState(item.url);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setTitle(item.title), [item.title]);

  const save = (p: Partial<Item>) => mutate(() => repo.updateItem(item.id, p));
  const saveText = async () => {
    const patch: Partial<Item> = {};
    if (title.trim() && title.trim() !== item.title) patch.title = title.trim();
    if (notes !== item.notes) patch.notes = notes;
    if (url.trim() !== item.url) patch.url = url.trim();
    if (Object.keys(patch).length) await save(patch);
  };
  const discard = async () => {
    closeItem();
    await mutate(() => repo.deleteItem(item.id));
  };
  const close = async () => {
    if (isNew && !title.trim()) return discard();
    await saveText();
    closeItem();
  };
  const [more, setMore] = useCreateMore();
  const create = async () => {
    if (!title.trim()) return titleRef.current?.focus();
    await close();
    if (more) await createAndOpenItem(data.hobby.id, item.category_ids);
  };
  const remove = async () => {
    if (!(await confirmDialog(`„${item.title}“ löschen?`))) return;
    closeItem();
    await mutate(() => repo.deleteItem(item.id));
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
          Merkliste
          <span className="text-muted/50">/</span>
          <span className="font-medium text-fg">{isNew ? "Neuer Eintrag" : "Eintrag"}</span>
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
                <ItemCheck item={item} size="lg" />
              </span>
            )}
            <textarea
              ref={titleRef}
              rows={1}
              autoFocus={isNew}
              className={clsx(
                "w-full resize-none bg-transparent text-2xl font-semibold tracking-tight outline-none [field-sizing:content] placeholder:text-muted/50",
                item.done_at && "text-muted line-through",
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
          <Section title="Link">
            <div className="flex items-center gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-bg dark:bg-white/[0.03] px-3 text-sm shadow-xs outline-none placeholder:text-muted/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onBlur={() => !isNew && saveText()}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              />
              <Button disabled={!url.trim()} onClick={() => openExternal(url.trim())}>
                <ExternalLink size={13} /> Öffnen
              </Button>
            </div>
          </Section>
          <Section title="Beschreibung">
            <textarea
              className="min-h-32 w-full resize-none rounded-lg border border-input bg-bg dark:bg-white/[0.03] px-3 py-2 text-sm leading-relaxed shadow-xs outline-none [field-sizing:content] placeholder:text-muted/70 focus:border-ring focus:ring-[3px] focus:ring-ring/20"
              placeholder="Notizen …"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => !isNew && saveText()}
            />
          </Section>
        </div>
        <aside className="w-72 shrink-0 border-l border-line bg-panel/60 px-5 py-6">
          <div className="flex flex-col gap-1.5 text-[13px]">
            <Prop label="Status">
              <Select
                ghost
                value={item.done_at ? "done" : "open"}
                onChange={(e) => save({ done_at: e.target.value === "done" ? new Date().toISOString() : null })}
              >
                <option value="open">Offen</option>
                <option value="done">Erledigt</option>
              </Select>
            </Prop>
            <Prop label="Kategorie">
              <CategoryPicker value={item.category_ids} onChange={(ids) => save({ category_ids: ids })} />
            </Prop>
          </div>
          <div className="mt-5 flex flex-col gap-1 border-t border-line pt-4 text-[11px] text-muted">
            <span>Erstellt am {new Date(item.created_at).toLocaleDateString("de-DE")}</span>
            {item.done_at && <span>Erledigt am {new Date(item.done_at).toLocaleDateString("de-DE")}</span>}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
