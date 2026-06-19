/**
 * Pure logic for "set variable" behavior triggers (Conditionals — App State).
 * Kept dependency-free so it can be unit-tested and shipped to the client.
 */
import type { SetVariableAction, StateActionTrigger, Layer } from '@/types';

/** Minimal store surface — matches `useRuntimeVarStore.getState()`. */
export interface VarStore {
  getVar: (path: string) => unknown;
  setVar: (path: string, value: unknown) => void;
}

/** Compute the next value for a single action against the current value. */
export function computeNextValue(action: SetVariableAction, current: unknown): unknown {
  switch (action.op) {
    case 'set':
      return action.value ?? '';
    case 'toggle':
      return !current;
    case 'increment':
      return Number(current ?? 0) + Number(action.value ?? 1);
    case 'decrement':
      return Number(current ?? 0) - Number(action.value ?? 1);
    default:
      return current;
  }
}

/** Apply a list of variable mutations to the store. */
export function applySetVariableActions(actions: SetVariableAction[] | undefined, store: VarStore): void {
  if (!actions?.length) return;
  for (const action of actions) {
    if (!action.varPath) continue;
    store.setVar(action.varPath, computeNextValue(action, store.getVar(action.varPath)));
  }
}

export interface StateActionLayer {
  layerId: string;
  stateActions: StateActionTrigger[];
}

/** Collect layers carrying behavior triggers, for binding at runtime. */
export function collectStateActionLayers(layers: Layer[]): StateActionLayer[] {
  const out: StateActionLayer[] = [];
  const walk = (ls: Layer[]) => {
    for (const l of ls) {
      if (l.stateActions?.length) out.push({ layerId: l.id, stateActions: l.stateActions });
      if (l.children) walk(l.children);
    }
  };
  walk(layers);
  return out;
}
