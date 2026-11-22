import { useEffect, useState, useSyncExternalStore } from "react";
import { listHobbies, loadHobbyData } from "../db/repo";
import type { Hobby, HobbyData } from "../db/types";
import { hidePending } from "./undo";

// A global version number: every mutation bumps it and all queries reload.
let version = 0;
const listeners = new Set<() => void>();

export function invalidate() {
  version++;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const useVersion = () => useSyncExternalStore(subscribe, () => version);

/** Runs a mutation, then reloads all data. */
export async function mutate<T>(fn: () => Promise<T>): Promise<T> {
  const res = await fn();
  invalidate();
  return res;
}

function useQuery<T>(fn: () => Promise<T>, key: unknown) {
  const v = useVersion();
  const [state, setState] = useState<{ data: T | undefined; key: unknown; error?: string }>({
    data: undefined,
    key,
  });
  useEffect(() => {
    let alive = true;
    fn()
      .then((data) => alive && setState({ data, key }))
      .catch((e) => alive && setState({ data: undefined, key, error: String(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, key]);
  // Keep showing old data while a reload for the same key is running.
  const data = state.key === key ? state.data : undefined;
  return { data, error: state.error, loading: data === undefined && !state.error };
}

export const useHobbies = () => useQuery<Hobby[]>(listHobbies, "hobbies");

export const useHobbyData = (hobbyId: number) =>
  useQuery<HobbyData | null>(() => loadHobbyData(hobbyId).then((d) => d && hidePending(d)), hobbyId);
