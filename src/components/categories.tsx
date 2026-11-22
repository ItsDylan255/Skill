import clsx from "clsx";
import { Check, ChevronDown, Pencil, Plus, Tag, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import * as repo from "../db/repo";
import type { Category } from "../db/types";
import { mutate } from "../lib/store";
import { useHobby } from "./HobbyContext";
import { COLORS } from "./icons";
import { Badge, Chip, confirmDialog, IconButton, Popover, usePopover } from "./ui";

export function CategoryBadges({ ids, max = 3 }: { ids: number[]; max?: number }) {
  const { d } = useHobby();
  const cats = ids.map((id) => d.category(id)).filter((c): c is Category => !!c);
  if (cats.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {cats.slice(0, max).map((c) => (
        <Badge key={c.id} color={c.color}>
          {c.name}
        </Badge>
      ))}
      {cats.length > max && <span className="text-[11px] text-muted">+{cats.length - max}</span>}
    </span>
  );
}

/** Field in the exercise window: shows the chosen categories, opens a menu to pick or create more. */
export function CategoryPicker({ value, onChange }: { value: number[]; onChange: (ids: number[]) => void }) {
  const pop = usePopover();
  return (
    <>
      <button
        type="button"
        onClick={pop.open}
        className={clsx(
          "-ml-1.5 flex min-h-8 w-full flex-wrap items-center gap-1 rounded-lg px-1.5 py-1 text-left text-[13px] transition-colors hover:bg-elev",
          pop.anchor && "bg-elev",
        )}
      >
        {value.length > 0 ? <CategoryBadges ids={value} max={6} /> : <span className="text-muted">Keine</span>}
      </button>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} className="w-64">
          <CategoryList
            selected={value}
            onToggle={(id) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])}
          />
        </Popover>
      )}
    </>
  );
}

/** Tool bar button on the exercise page to rename, recolour, add and delete categories. */
export function CategoryManager() {
  const { data } = useHobby();
  const pop = usePopover();
  return (
    <>
      <Chip onClick={pop.open} active={!!pop.anchor}>
        <Tag /> Kategorien <span className="tabular text-muted">{data.categories.length}</span> <ChevronDown />
      </Chip>
      {pop.anchor && (
        <Popover anchor={pop.anchor} onClose={pop.close} className="w-72">
          <CategoryList />
        </Popover>
      )}
    </>
  );
}

const nextColor = (cats: Category[]) => COLORS[cats.length % COLORS.length];

/**
 * Searchable category list. With `onToggle` it picks categories (check marks);
 * without, it only manages them. Typing a new name offers to create it.
 */
function CategoryList({ selected, onToggle }: { selected?: number[]; onToggle?: (id: number) => void }) {
  const { data } = useHobby();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const q = query.trim().toLowerCase();
  const list = data.categories.filter((c) => !q || c.name.toLowerCase().includes(q));
  const exact = data.categories.some((c) => c.name.toLowerCase() === q);

  const create = async () => {
    const name = query.trim();
    if (!name || exact) return;
    const id = await mutate(() => repo.createCategory({ hobby_id: data.hobby.id, name, color: nextColor(data.categories) }));
    setQuery("");
    onToggle?.(id);
  };

  return (
    <div className="flex flex-col">
      <input
        autoFocus
        className="mb-1 h-8 w-full border-b border-line bg-transparent px-2 text-[13px] outline-none placeholder:text-muted/70"
        placeholder={onToggle ? "Suchen oder neu anlegen …" : "Neue Kategorie …"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Enter picks the first match, or creates the category when nothing matches
          if (onToggle && list.length > 0) {
            onToggle(list[0].id);
            setQuery("");
          } else create();
        }}
      />
      {list.map((c) => (
        <div key={c.id}>
          <div className="group flex items-center rounded-md hover:bg-elev">
            <button
              type="button"
              onClick={() => (onToggle ? onToggle(c.id) : setEditing(editing === c.id ? null : c.id))}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-[13px]"
            >
              {onToggle && (
                <span
                  className={clsx(
                    "flex size-3.5 shrink-0 items-center justify-center rounded border",
                    selected?.includes(c.id) ? "border-primary bg-primary text-primary-fg" : "border-muted/50",
                  )}
                >
                  {selected?.includes(c.id) && <Check size={10} strokeWidth={3} />}
                </span>
              )}
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
              <span className="truncate">{c.name}</span>
            </button>
            <IconButton
              label="Bearbeiten"
              className={clsx("mr-0.5 size-6", editing !== c.id && "opacity-0 group-hover:opacity-100")}
              onClick={() => setEditing(editing === c.id ? null : c.id)}
            >
              <Pencil size={12} />
            </IconButton>
          </div>
          {editing === c.id && <CategoryEditor category={c} onDone={() => setEditing(null)} />}
        </div>
      ))}
      {q && !exact && (
        <button
          type="button"
          onClick={create}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-elev"
        >
          <Plus size={13} className="text-muted" /> „{query.trim()}“ anlegen
        </button>
      )}
      {!q && list.length === 0 && <p className="px-2 py-2 text-[13px] text-muted">Noch keine Kategorien</p>}
    </div>
  );
}

function CategoryEditor({ category: c, onDone }: { category: Category; onDone: () => void }) {
  const [name, setName] = useState(c.name);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setName(c.name), [c.name]);
  const saveName = () => name.trim() && name !== c.name && mutate(() => repo.updateCategory(c.id, { name: name.trim() }));

  return (
    <div className="mx-1 mb-1 flex flex-col gap-2 rounded-md border border-line bg-panel/60 p-2">
      <input
        ref={input}
        className="h-7 rounded-md border border-input bg-bg dark:bg-white/[0.03] px-2 text-[13px] outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            saveName();
            onDone();
          }
        }}
      />
      <div className="grid grid-cols-7 gap-1">
        {COLORS.map((col) => (
          <button
            key={col}
            type="button"
            aria-label={col}
            onClick={() => mutate(() => repo.updateCategory(c.id, { color: col }))}
            className="flex size-6 items-center justify-center rounded-full"
            style={{ backgroundColor: col }}
          >
            {c.color === col && <Check size={12} strokeWidth={3} className="text-white" />}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-bad hover:bg-bad/10"
        onClick={async () => {
          if (await confirmDialog(`Kategorie „${c.name}“ löschen? Die Übungen bleiben erhalten.`))
            await mutate(() => repo.deleteCategory(c.id));
        }}
      >
        <Trash2 size={12} /> Löschen
      </button>
    </div>
  );
}
