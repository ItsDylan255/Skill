import { createContext, useContext } from "react";
import type { HobbyData } from "../db/types";
import type { Derived } from "../domain/derived";

export interface HobbyCtx {
  data: HobbyData;
  d: Derived;
  base: string;
}

export const HobbyContext = createContext<HobbyCtx | null>(null);

export function useHobby(): HobbyCtx {
  const ctx = useContext(HobbyContext);
  if (!ctx) throw new Error("useHobby outside of HobbyContext");
  return ctx;
}

export const useOptionalHobby = () => useContext(HobbyContext);
