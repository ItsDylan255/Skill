import {
  Archive,
  ArchiveRestore,
  CircleCheck,
  Circle,
  Copy,
  ExternalLink,
  Link2,
  PanelTop,
  Play,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import * as repo from "../db/repo";
import type { Exercise, Hobby, Item, KnowledgeBase, Routine, Topic } from "../db/types";
import { openExternal } from "../lib/platform";
import { mutate } from "../lib/store";
import { openExercise, openHobbySettings, openItem, openRoutine, openTopic } from "../lib/uiState";
import { deleteExercise } from "./ExerciseDialog";
import { useHobby } from "./HobbyContext";
import { createAndOpenTopic, setStage, STAGES } from "./TopicDialog";
import { confirmDialog, MenuItem, MenuLabel, MenuSeparator, Popover, type Point } from "./ui";

/*
 * Right-click menus, like Slate's task menu: the same actions as in the item's
 * window, without opening it first.
 */

type MenuProps = { at: Point; onClose: () => void };

/** wraps an action so the menu closes first */
const runner = (onClose: () => void) => (fn: () => unknown) => () => {
  onClose();
  fn();
};

export function ExerciseMenu({ exercise, at, onClose }: MenuProps & { exercise: Exercise }) {
  const { data, base } = useHobby();
  const navigate = useNavigate();
  const run = runner(onClose);
  const archived = exercise.status === "archived";
  return (
    <Popover anchor={at} onClose={onClose} className="w-56">
      <MenuItem icon={<PanelTop size={14} />} onClick={run(() => openExercise(exercise.id))}>
        Öffnen
      </MenuItem>
      {!archived && (
        <MenuItem icon={<Play size={14} />} onClick={run(() => navigate(`${base}/practice/exercise/${exercise.id}`))}>
          Üben
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem
        icon={<Copy size={14} />}
        onClick={run(async () => openExercise(await mutate(() => repo.duplicateExercise(exercise.id))))}
      >
        Kopieren
      </MenuItem>
      <MenuItem
        icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        onClick={run(() =>
          mutate(() =>
            repo.updateExercise(
              exercise.id,
              archived ? { status: "active" } : { status: "archived", completed_at: new Date().toISOString() },
            ),
          ),
        )}
      >
        {archived ? "Wiederherstellen" : "Archivieren"}
      </MenuItem>
      <MenuItem danger icon={<Trash2 size={14} />} onClick={run(() => deleteExercise(exercise, data))}>
        Löschen
      </MenuItem>
    </Popover>
  );
}

export function RoutineMenu({ routine, at, onClose }: MenuProps & { routine: Routine }) {
  const { base } = useHobby();
  const navigate = useNavigate();
  const run = runner(onClose);
  const archived = !!routine.archived_at;
  return (
    <Popover anchor={at} onClose={onClose} className="w-56">
      <MenuItem icon={<PanelTop size={14} />} onClick={run(() => openRoutine(routine.id))}>
        Öffnen
      </MenuItem>
      {!archived && (
        <MenuItem icon={<Play size={14} />} onClick={run(() => navigate(`${base}/practice/routine/${routine.id}`))}>
          Starten
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem
        icon={<Copy size={14} />}
        onClick={run(async () => openRoutine(await mutate(() => repo.duplicateRoutine(routine.id))))}
      >
        Kopieren
      </MenuItem>
      <MenuItem
        icon={archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        onClick={run(() =>
          mutate(() => repo.updateRoutine(routine.id, { archived_at: archived ? null : new Date().toISOString() })),
        )}
      >
        {archived ? "Wiederherstellen" : "Archivieren"}
      </MenuItem>
      <MenuItem
        danger
        icon={<Trash2 size={14} />}
        onClick={run(async () => {
          if (!(await confirmDialog(`Routine „${routine.name}“ löschen? Übungen und Verlauf bleiben erhalten.`))) return;
          await mutate(() => repo.deleteRoutine(routine.id));
        })}
      >
        Löschen
      </MenuItem>
    </Popover>
  );
}

export function TopicMenu({ topic, at, onClose }: MenuProps & { topic: Topic }) {
  const { d } = useHobby();
  const run = runner(onClose);
  const below = d.subtree(topic.id).length - 1;
  return (
    <Popover anchor={at} onClose={onClose} className="w-56">
      <MenuItem icon={<PanelTop size={14} />} onClick={run(() => openTopic(topic.id))}>
        Öffnen
      </MenuItem>
      <MenuItem icon={<Plus size={14} />} onClick={run(() => createAndOpenTopic(topic.base_id, topic.id))}>
        Unterthema anlegen
      </MenuItem>
      <MenuSeparator />
      <MenuLabel>Stand</MenuLabel>
      {STAGES.map((s) => (
        <MenuItem key={s.value} active={topic.stage === s.value} onClick={run(() => setStage(topic, s.value))}>
          {s.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 size={14} />}
        onClick={run(async () => {
          if (!(await confirmDialog(`„${topic.title}“${below ? ` mit ${below} Unterthemen` : ""} löschen?`))) return;
          await mutate(() => repo.deleteTopic(topic.id));
        })}
      >
        Löschen
      </MenuItem>
    </Popover>
  );
}

export function PlanMenu({ kb, at, onClose }: MenuProps & { kb: KnowledgeBase }) {
  const { d, base } = useHobby();
  const navigate = useNavigate();
  const run = runner(onClose);
  const count = d.planOutline(kb.id).length;
  return (
    <Popover anchor={at} onClose={onClose} className="w-56">
      <MenuItem icon={<PanelTop size={14} />} onClick={run(() => navigate(`${base}/plan/${kb.id}`))}>
        Öffnen
      </MenuItem>
      <MenuItem icon={<Plus size={14} />} onClick={run(() => createAndOpenTopic(kb.id))}>
        Thema anlegen
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        danger
        icon={<Trash2 size={14} />}
        onClick={run(async () => {
          if (!(await confirmDialog(`Plan „${kb.name}“ mit ${count} Themen löschen?`))) return;
          await mutate(() => repo.deleteKnowledgeBase(kb.id));
        })}
      >
        Löschen
      </MenuItem>
    </Popover>
  );
}

export function ItemMenu({ item, at, onClose }: MenuProps & { item: Item }) {
  const run = runner(onClose);
  const done = !!item.done_at;
  return (
    <Popover anchor={at} onClose={onClose} className="w-56">
      <MenuItem icon={<PanelTop size={14} />} onClick={run(() => openItem(item.id))}>
        Öffnen
      </MenuItem>
      {item.url && (
        <MenuItem icon={<ExternalLink size={14} />} onClick={run(() => openExternal(item.url))}>
          Link öffnen
        </MenuItem>
      )}
      {item.url && (
        <MenuItem icon={<Link2 size={14} />} onClick={run(() => navigator.clipboard?.writeText(item.url))}>
          Link kopieren
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem
        icon={done ? <Circle size={14} /> : <CircleCheck size={14} />}
        onClick={run(() => mutate(() => repo.updateItem(item.id, { done_at: done ? null : new Date().toISOString() })))}
      >
        {done ? "Als offen markieren" : "Abhaken"}
      </MenuItem>
      <MenuItem
        danger
        icon={<Trash2 size={14} />}
        onClick={run(async () => {
          if (!(await confirmDialog(`„${item.title}“ löschen?`))) return;
          await mutate(() => repo.deleteItem(item.id));
        })}
      >
        Löschen
      </MenuItem>
    </Popover>
  );
}

export function HobbyMenu({ hobby, at, onClose }: MenuProps & { hobby: Hobby }) {
  const navigate = useNavigate();
  const run = runner(onClose);
  return (
    <Popover anchor={at} onClose={onClose} className="w-56">
      <MenuItem icon={<PanelTop size={14} />} onClick={run(() => navigate(`/h/${hobby.id}`))}>
        Öffnen
      </MenuItem>
      <MenuItem icon={<Settings size={14} />} onClick={run(() => openHobbySettings(hobby.id))}>
        Einstellungen
      </MenuItem>
    </Popover>
  );
}
