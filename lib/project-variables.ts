/**
 * Project-level runtime variable defaults (Conditionals — App State).
 * Pure helpers shared by the server (PageRenderer seeds the published page) and
 * tests. The variable definitions themselves are stored in the settings table
 * under `project_variables` and edited via the builder VariablesPanel (right
 * sidebar, Page context).
 */
import type { VariableDefinition } from '@/types';

/** Coerce a stored string default to the variable's declared type. */
export function coerceVariableDefault(type: VariableDefinition['type'], value?: string): unknown {
  switch (type) {
    case 'boolean':
      return value === 'true';
    case 'number': {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    default:
      return value ?? '';
  }
}

/** Build the `state` namespace seed map ({ name: coercedDefault }) from the definitions. */
export function buildStateDefaults(defs: VariableDefinition[] | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(defs)) return out;
  for (const d of defs) {
    if (!d?.name) continue;
    out[d.name] = coerceVariableDefault(d.type, d.defaultValue);
  }
  return out;
}
