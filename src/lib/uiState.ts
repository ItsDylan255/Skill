import { useSyncExternalStore } from "react";

/** App-wide UI state that is not data: sidebar, settings dialog, open exercise/routine/plan item windows. */
interface UiState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  /** command palette (Ctrl+K) */
  paletteOpen: boolean;
  /** hobby whose settings dialog is open */
  hobbySettings: number | null;
  /** exercise shown in the dialog; `isNew` = just created, discarded when closed without a name */
  exercise: { id: number; isNew: boolean } | null;
  routine: { id: number; isNew: boolean } | null;
  topic: { id: number; isNew: boolean } | null;
  item: { id: number; isNew: boolean } | null;
  /** window to return to when one window was opened from another (exercise <-> routine) */
  dialogBack: { kind: "exercise" | "routine"; id: number } | null;
}

const SIDEBAR_KEY = "hobby-manager-sidebar-open";

function initialSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "0";
  } catch {
    return true;
  }
}

let state: UiState = { sidebarOpen: initialSidebar(), settingsOpen: false, paletteOpen: false, hobbySettings: null, exercise: null, routine: null, topic: null, item: null, dialogBack: null };
const listeners = new Set<() => void>();

export function setUi(patch: Partial<UiState>) {
  state = { ...state, ...patch };
  if (patch.sidebarOpen !== undefined) {
    try {
      localStorage.setItem(SIDEBAR_KEY, patch.sidebarOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }
  listeners.forEach((l) => l());
}

export function useUi(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const toggleSidebar = () => setUi({ sidebarOpen: !state.sidebarOpen });
export const openExercise = (id: number, isNew = false) => setUi({ exercise: { id, isNew }, dialogBack: null });
export const closeExercise = () => setUi({ exercise: null, dialogBack: null });
export const openSettings = () => setUi({ settingsOpen: true });
export const openHobbySettings = (id: number) => setUi({ hobbySettings: id });
export const openRoutine = (id: number, isNew = false) => setUi({ routine: { id, isNew }, dialogBack: null });
export const closeRoutine = () => setUi({ routine: null, dialogBack: null });
/** switches from an exercise window to a routine window (or back), remembering where it came from */
export const openRoutineFromExercise = (routineId: number, exerciseId: number) =>
  setUi({ exercise: null, routine: { id: routineId, isNew: false }, dialogBack: { kind: "exercise", id: exerciseId } });
export const openExerciseFromRoutine = (exerciseId: number, routineId: number) =>
  setUi({ routine: null, exercise: { id: exerciseId, isNew: false }, dialogBack: { kind: "routine", id: routineId } });
export function dialogGoBack() {
  const back = state.dialogBack;
  if (!back) return;
  if (back.kind === "exercise") setUi({ routine: null, exercise: { id: back.id, isNew: false }, dialogBack: null });
  else setUi({ exercise: null, routine: { id: back.id, isNew: false }, dialogBack: null });
}
export const openTopic = (id: number, isNew = false) => setUi({ topic: { id, isNew } });
export const closeTopic = () => setUi({ topic: null });
export const openItem = (id: number, isNew = false) => setUi({ item: { id, isNew } });
export const closeItem = () => setUi({ item: null });
/** closes every window that belongs to a hobby (when switching hobbies) */
export const closeHobbyDialogs = () => setUi({ exercise: null, routine: null, topic: null, item: null, dialogBack: null });
