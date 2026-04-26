import { create } from 'zustand';

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc !== null && acc !== undefined && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj as unknown);
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const result = { ...obj };
  let current: Record<string, unknown> = result;
  for (let i = 0; i < keys.length - 1; i++) {
    current[keys[i]] = { ...(typeof current[keys[i]] === 'object' && current[keys[i]] !== null ? current[keys[i]] as Record<string, unknown> : {}) };
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return result;
}

interface RuntimeVarStore {
  vars: Record<string, unknown>;
  setVar: (path: string, value: unknown) => void;
  setNamespace: (namespace: string, data: Record<string, unknown>) => void;
  getVar: (path: string) => unknown;
  reset: () => void;
}

export const useRuntimeVarStore = create<RuntimeVarStore>((set, get) => ({
  vars: {},
  setVar: (path, value) => set((state) => ({ vars: setByPath(state.vars, path, value) })),
  setNamespace: (namespace, data) => set((state) => ({ vars: { ...state.vars, [namespace]: data } })),
  getVar: (path) => getByPath(get().vars, path),
  reset: () => set({ vars: {} }),
}));

export { getByPath };
