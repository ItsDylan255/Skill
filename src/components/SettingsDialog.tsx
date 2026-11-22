import clsx from "clsx";
import { LayoutGrid, Monitor, Moon, Palette, Sun, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { deleteHobby, updateHobby } from "../db/repo";
import type { Hobby } from "../db/types";
import { mutate, useHobbies } from "../lib/store";
import { getTheme, setTheme, type Theme } from "../lib/theme";
import { setUi, useUi } from "../lib/uiState";
import { ColorPicker, HobbyIcon, IconPicker } from "./icons";
import { Button, confirmDialog, Input, Modal, Switch } from "./ui";

/** Sections of a hobby that can be switched off (the overview always stays). */
export const OPTIONAL_TABS = [
  { id: "exercises", label: "Übungen" },
  { id: "songs", label: "Songs" },
  { id: "routines", label: "Routinen" },
  { id: "plan", label: "Plan" },
  { id: "list", label: "Merkliste" },
  { id: "goals", label: "Ziele" },
  { id: "phases", label: "Phasen" },
] as const;

export function hiddenTabs(hobby: Hobby | undefined): string[] {
  try {
    return JSON.parse(hobby?.hidden_tabs || "[]");
  } catch {
    return [];
  }
}

/** Tools that can be switched off per hobby; stored in the same list as the sections. */
export const OPTIONAL_TOOLS = [{ id: "metronome", label: "Metronom" }] as const;

export const hasMetronome = (hobby: Hobby | undefined) => !hiddenTabs(hobby).includes("metronome");

/** App-wide settings (bottom left in the sidebar). */
export function SettingsDialog() {
  const { settingsOpen } = useUi();
  const [theme, set] = useState<Theme>(getTheme());
  return (
    <Modal open={settingsOpen} onClose={() => setUi({ settingsOpen: false })} title="Einstellungen" width="max-w-lg">
      <Label>Design</Label>
      <Choice
        value={theme}
        onChange={(t) => {
          setTheme(t);
          set(t);
        }}
        options={[
          { value: "light", label: "Hell", icon: <Sun size={15} /> },
          { value: "dark", label: "Dunkel", icon: <Moon size={15} /> },
          { value: "system", label: "System", icon: <Monitor size={15} /> },
        ]}
      />
    </Modal>
  );
}

type Tab = "general" | "sections";

/** Settings of one hobby, opened from the "…" next to it in the sidebar. */
export function HobbySettingsDialog() {
  const { hobbySettings } = useUi();
  const { data: hobbies = [] } = useHobbies();
  const hobby = hobbies.find((h) => h.id === hobbySettings);
  const [tab, setTab] = useState<Tab>("general");
  const close = () => setUi({ hobbySettings: null });
  useEffect(() => setTab("general"), [hobbySettings]);
  if (!hobby) return null;

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "general", label: "Allgemein", icon: <Palette size={15} /> },
    { id: "sections", label: "Bereiche", icon: <LayoutGrid size={15} /> },
  ];

  return (
    <Modal
      open
      onClose={close}
      width="max-w-3xl"
      noPadding
      title={
        <span className="flex items-center gap-2">
          <span style={{ color: hobby.color }}>
            <HobbyIcon name={hobby.icon} size={15} />
          </span>
          {hobby.name}
        </span>
      }
    >
      <div className="flex min-h-[26rem]">
        <nav className="flex w-48 shrink-0 flex-col gap-0.5 border-r border-line p-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={clsx(
                "flex h-8 items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors",
                tab === t.id ? "bg-elev font-medium text-fg" : "text-muted hover:bg-elev hover:text-fg",
              )}
            >
              {t.icon}
              <span className="truncate">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="min-w-0 flex-1 p-6">
          {tab === "general" && <HobbyTab hobby={hobby} onDeleted={close} />}
          {tab === "sections" && <Sections hobby={hobby} />}
        </div>
      </div>
    </Modal>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-medium text-muted">{children}</div>;
}

/** Big two/three-way choice buttons like Slate's "Hell / Dunkel". */
function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon: ReactNode }[];
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            "flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-medium transition-colors",
            value === o.value ? "border-fg/25 bg-elev" : "border-line hover:bg-elev",
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function HobbyTab({ hobby, onDeleted }: { hobby: Hobby; onDeleted: () => void }) {
  const navigate = useNavigate();
  const [name, setName] = useState(hobby.name);
  useEffect(() => setName(hobby.name), [hobby.name]);

  const remove = async () => {
    if (!(await confirmDialog(`„${hobby.name}“ mit allen Übungen, Routinen, Zielen und dem gesamten Verlauf löschen?`)))
      return;
    onDeleted();
    await mutate(() => deleteHobby(hobby.id));
    navigate("/");
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label>Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== hobby.name && mutate(() => updateHobby(hobby.id, { name: name.trim() }))}
        />
      </div>
      <div>
        <Label>Farbe</Label>
        <ColorPicker value={hobby.color} onChange={(color) => mutate(() => updateHobby(hobby.id, { color }))} />
      </div>
      <div>
        <Label>Symbol</Label>
        <IconPicker value={hobby.icon} onChange={(icon) => mutate(() => updateHobby(hobby.id, { icon }))} />
      </div>
      <div className="border-t border-line pt-5">
        <Button variant="danger" onClick={remove}>
          <Trash2 size={14} /> Hobby löschen
        </Button>
      </div>
    </div>
  );
}

/** Switch sections of the hobby on and off, like Slate's project features. */
function Sections({ hobby }: { hobby: Hobby }) {
  const hidden = hiddenTabs(hobby);
  const toggle = (id: string) => {
    const next = hidden.includes(id) ? hidden.filter((x) => x !== id) : [...hidden, id];
    mutate(() => updateHobby(hobby.id, { hidden_tabs: JSON.stringify(next) }));
  };
  const list = (items: readonly { id: string; label: string }[]) => (
    <div className="overflow-hidden rounded-xl border border-line">
      {items.map((t) => {
        const on = !hidden.includes(t.id);
        return (
          <button
            key={t.id}
            onClick={() => toggle(t.id)}
            className="flex h-11 w-full items-center justify-between border-b border-line px-4 text-left text-sm last:border-b-0 hover:bg-elev/60"
          >
            {t.label}
            <Switch on={on} />
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label>Bereiche</Label>
        {list(OPTIONAL_TABS)}
      </div>
      <div>
        <Label>Werkzeuge</Label>
        {list(OPTIONAL_TOOLS)}
      </div>
    </div>
  );
}
