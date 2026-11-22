import {
  Bookmark,
  Flag,
  ListChecks,
  Map as MapIcon,
  Moon,
  Music,
  PanelLeft,
  Plus,
  Repeat,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import { Command, defaultFilter } from "cmdk";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as repo from "../db/repo";
import { mutate, useHobbies } from "../lib/store";
import { setTheme } from "../lib/theme";
import { openExercise, openHobbySettings, openItem, openRoutine, openSettings, openTopic, setUi, toggleSidebar, useUi } from "../lib/uiState";
import { createAndOpenExercise } from "./ExerciseDialog";
import { useHobby } from "./HobbyContext";
import { HobbyIcon } from "./icons";
import { createAndOpenItem } from "./ItemDialog";
import { tabOrder } from "./Layout";
import { createAndOpenRoutine } from "./RoutineDialog";
import { hiddenTabs } from "./SettingsDialog";
import { createAndOpenTopic, StageButton } from "./TopicDialog";
import { Modal } from "./ui";

interface Entry {
  id: string;
  group: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  run: () => void;
}

/** Keyboard shortcuts, the same as in Slate (see DESIGN.md). */
export const SHORTCUTS: { keys: string; label: string }[] = [
  { keys: "Strg K", label: "Befehlssuche" },
  { keys: "N", label: "Neu im aktuellen Bereich" },
  { keys: "/", label: "Suchen" },
  { keys: "Strg ,", label: "Einstellungen" },
  { keys: "Strg B", label: "Seitenleiste ein/aus" },
  { keys: "Strg D", label: "Hell/Dunkel" },
  { keys: "?", label: "Tastenkürzel" },
  { keys: "Esc", label: "Schließen" },
];

/** Global shortcuts of a hobby: palette, new item, search, settings, sidebar, theme, shortcut list. */
export function CommandPaletteHost() {
  const { paletteOpen } = useUi();
  const { data, base } = useHobby();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const createHere = async () => {
      const section = pathname.slice(base.length).split("/").filter(Boolean);
      const hobby = data.hobby;
      if (section[0] === "exercises") return createAndOpenExercise(hobby);
      if (section[0] === "songs") return createAndOpenExercise(hobby, { kind: "song", tools: ["stopwatch", "metronome"] });
      if (section[0] === "routines") return createAndOpenRoutine(hobby.id);
      if (section[0] === "list") return createAndOpenItem(hobby.id);
      if (section[0] === "plan" && section[1]) return createAndOpenTopic(Number(section[1]));
      if (section[0] === "plan") {
        const id = await mutate(() => repo.createKnowledgeBase(hobby.id, "Neuer Plan", Math.floor(Date.now() / 1000)));
        navigate(`${base}/plan/${id}?new=1`);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctrl && key === "k") {
        e.preventDefault();
        setUi({ paletteOpen: !paletteOpen });
        return;
      }
      if (ctrl && e.key === ",") {
        e.preventDefault();
        openSettings();
        return;
      }
      if (ctrl && key === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }
      if (ctrl && key === "d") {
        e.preventDefault();
        setTheme(document.documentElement.classList.contains("dark") ? "light" : "dark");
        return;
      }
      // single keys only when not typing and no window is open
      const t = e.target as HTMLElement;
      const typing = t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable;
      if (ctrl || e.altKey || typing || paletteOpen || document.querySelector("[role=dialog]")) return;
      if (key === "n") {
        e.preventDefault();
        createHere();
      } else if (e.key === "/") {
        const search = document.getElementById("filter-search");
        if (search) {
          e.preventDefault();
          search.focus();
        }
      } else if (e.key === "?") setHelpOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, pathname, base, data.hobby, navigate]);

  return (
    <>
      {paletteOpen && <CommandPalette />}
      <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Tastenkürzel" width="max-w-sm">
        <div className="flex flex-col">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex h-9 items-center justify-between border-b border-line text-sm last:border-0">
              <span>{s.label}</span>
              <span className="flex gap-1">
                {s.keys.split(" ").map((k) => (
                  <kbd key={k} className="min-w-6 rounded-md border border-line bg-bg px-1.5 py-0.5 text-center font-mono text-[11px] text-muted">
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

/** Command palette like Slate's, built on cmdk: fuzzy search ("qntz" finds Quintenzirkel), arrow keys, Enter. */
function CommandPalette() {
  const { data, base } = useHobby();
  const { data: hobbies = [] } = useHobbies();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const close = () => setUi({ paletteOpen: false });
  const hobby = data.hobby;

  const groups = useMemo(() => {
    const hidden = hiddenTabs(hobby);
    const dark = document.documentElement.classList.contains("dark");

    const actions: Entry[] = [
      { id: "a-ex", group: "Aktionen", icon: <Plus size={14} />, label: "Neue Übung", run: () => createAndOpenExercise(hobby) },
      ...(!hidden.includes("songs")
        ? [{ id: "a-song", group: "Aktionen", icon: <Plus size={14} />, label: "Neuer Song", run: () => createAndOpenExercise(hobby, { kind: "song", tools: ["stopwatch", "metronome"] }) }]
        : []),
      { id: "a-rt", group: "Aktionen", icon: <Plus size={14} />, label: "Neue Routine", run: () => createAndOpenRoutine(hobby.id) },
      {
        id: "a-plan",
        group: "Aktionen",
        icon: <Plus size={14} />,
        label: "Neuer Plan",
        run: async () => {
          const id = await mutate(() => repo.createKnowledgeBase(hobby.id, "Neuer Plan", Math.floor(Date.now() / 1000)));
          navigate(`${base}/plan/${id}?new=1`);
        },
      },
      { id: "a-item", group: "Aktionen", icon: <Plus size={14} />, label: "Neuer Merklisten-Eintrag", run: () => createAndOpenItem(hobby.id) },
      { id: "a-hset", group: "Aktionen", icon: <SlidersHorizontal size={14} />, label: `Einstellungen: ${hobby.name}`, run: () => openHobbySettings(hobby.id) },
      { id: "a-set", group: "Aktionen", icon: <Settings size={14} />, label: "Einstellungen", hint: "Strg ,", run: openSettings },
      { id: "a-theme", group: "Aktionen", icon: dark ? <Sun size={14} /> : <Moon size={14} />, label: dark ? "Heller Modus" : "Dunkler Modus", hint: "Strg D", run: () => setTheme(dark ? "light" : "dark") },
      { id: "a-side", group: "Aktionen", icon: <PanelLeft size={14} />, label: "Seitenleiste ein/aus", hint: "Strg B", run: toggleSidebar },
    ];

    const sections: Entry[] = tabOrder(hobby)
      .filter((t) => !hidden.includes(t.id))
      .map((t) => ({ id: "s-" + t.id, group: hobby.name, icon: <span className="[&_svg]:size-3.5">{t.icon}</span>, label: t.label, run: () => navigate(base + t.path) }));

    const otherHobbies: Entry[] = hobbies
      .filter((h) => h.id !== hobby.id)
      .map((h) => ({ id: "h-" + h.id, group: "Hobbys", icon: <HobbyIcon name={h.icon} size={14} />, label: h.name, run: () => navigate(`/h/${h.id}`) }));

    const found: Entry[] = [
      ...data.exercises.map((e) => ({
        id: "e-" + e.id,
        group: "Gefunden",
        icon: e.kind === "song" ? <Music size={14} /> : <ListChecks size={14} />,
        label: e.name,
        hint: e.kind === "song" ? "Song" : e.status === "archived" ? "Übung · archiviert" : "Übung",
        run: () => openExercise(e.id),
      })),
      ...data.routines.map((r) => ({ id: "r-" + r.id, group: "Gefunden", icon: <Repeat size={14} />, label: r.name, hint: "Routine", run: () => openRoutine(r.id) })),
      ...data.knowledgeBases.map((k) => ({ id: "k-" + k.id, group: "Gefunden", icon: <MapIcon size={14} />, label: k.name, hint: "Plan", run: () => navigate(`${base}/plan/${k.id}`) })),
      ...data.topics.map((t) => ({
        id: "t-" + t.id,
        group: "Gefunden",
        icon: <StageButton topic={t} />,
        label: t.title || "Ohne Titel",
        hint: data.knowledgeBases.find((k) => k.id === t.base_id)?.name,
        run: () => openTopic(t.id),
      })),
      ...data.items.map((i) => ({ id: "i-" + i.id, group: "Gefunden", icon: <Bookmark size={14} />, label: i.title, hint: "Merkliste", run: () => openItem(i.id) })),
      ...data.goals.map((g) => ({ id: "g-" + g.id, group: "Gefunden", icon: <Flag size={14} />, label: g.name, hint: "Ziel", run: () => navigate(`${base}/goals`) })),
    ];
    return { actions, sections, otherHobbies, found };
  }, [data, hobbies, base]); // eslint-disable-line react-hooks/exhaustive-deps

  const runEntry = (e: Entry) => {
    close();
    e.run();
  };
  const searching = !!q.trim();

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-black/32 p-6 pt-[12vh] backdrop-blur-[1px]"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <Command
        label="Befehlssuche"
        loop
        // match the visible text (label + hint), not the internal ids
        filter={(_value, search, keywords) => defaultFilter(keywords?.join(" ") ?? "", search)}
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-card shadow-2xl/10"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={16} className="text-muted/70" />
          <Command.Input
            autoFocus
            value={q}
            onValueChange={setQ}
            placeholder="Suchen oder Befehl eingeben …"
            className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted/70"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-muted">Esc</kbd>
        </div>
        <Command.List className="max-h-[50vh] scroll-py-1 overflow-y-auto p-1">
          <Command.Empty className="p-4 text-center text-sm text-muted">Nichts gefunden</Command.Empty>
          {searching && <PaletteGroup heading="Gefunden" entries={groups.found} onRun={runEntry} />}
          <PaletteGroup heading="Aktionen" entries={groups.actions} onRun={runEntry} />
          <PaletteGroup heading={hobby.name} entries={groups.sections} onRun={runEntry} />
          <PaletteGroup heading="Hobbys" entries={groups.otherHobbies} onRun={runEntry} />
        </Command.List>
      </Command>
    </div>
  );
}

function PaletteGroup({ heading, entries, onRun }: { heading: string; entries: Entry[]; onRun: (e: Entry) => void }) {
  if (!entries.length) return null;
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted/70 [&_[cmdk-group-heading]]:uppercase"
    >
      {entries.map((e) => (
        <Command.Item
          key={e.id}
          value={e.id}
          keywords={[e.label, e.hint ?? ""]}
          onSelect={() => onRun(e)}
          className="flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left text-sm data-[selected=true]:bg-elev"
        >
          <span className="pointer-events-none flex w-4 shrink-0 justify-center text-muted">{e.icon}</span>
          <span className="flex-1 truncate">{e.label}</span>
          {e.hint && <span className="truncate text-xs text-muted/70">{e.hint}</span>}
        </Command.Item>
      ))}
    </Command.Group>
  );
}
