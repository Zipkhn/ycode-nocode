'use client';

import { useEffect } from 'react';
import { useRuntimeVarStore } from '@/stores/useRuntimeVarStore';

/**
 * Seeds the runtime var store with the project's variable defaults under the
 * `state` namespace, so conditions/triggers referencing `state.<name>` start
 * from their defined default. Already-set values win (defaults never clobber a
 * value set earlier in the session). Defaults come from the settings table,
 * fetched server-side by PageRenderer.
 *
 * Note: seeding runs in an effect (after first paint). The server renders each
 * element at its empty-runtime best-effort visibility, so default-false/empty
 * variables show no flash; a rule that matches a non-empty default may briefly
 * settle on mount (SSR-with-defaults is a later refinement).
 */
export default function RuntimeStateProvider({ defaults }: { defaults: Record<string, unknown> }) {
  useEffect(() => {
    const store = useRuntimeVarStore.getState();
    const current = (store.vars.state as Record<string, unknown> | undefined) || {};
    store.setNamespace('state', { ...defaults, ...current });
  }, [defaults]);

  return null;
}
