'use client';

import { useEffect, useRef } from 'react';
import { useRuntimeVarStore } from '@/stores/useRuntimeVarStore';
import { applySetVariableActions, type StateActionLayer } from '@/components/runtime/setVariableAction';
import { ITEMS_INJECTED_EVENT } from '@/components/FilterableCollection';

/**
 * Binds user-behavior triggers (click / hover / load) to their "set variable"
 * actions, mutating the runtime var store. Separate from AnimationInitializer so
 * a behavior trigger needs no animation. Binds by `data-layer-id` (mirrors the
 * animation runtime) and re-binds on ITEMS_INJECTED_EVENT for injected clones.
 */
export default function VariableTriggers({ triggers, doc = document }: { triggers: StateActionLayer[]; doc?: Document }) {
  // Elements whose `load` actions already fired — keyed by node so they fire
  // once per element, never again on rebind (ITEMS_INJECTED) or effect re-run
  // (canvas layer edits). Persists for the component's lifetime; toggling Live
  // preview off/on remounts the component, giving a fresh set.
  const loadFiredRef = useRef<WeakSet<HTMLElement>>(new WeakSet());

  useEffect(() => {
    if (!triggers.length) return;
    const win = doc.defaultView ?? window;
    const loadFired = loadFiredRef.current;
    let cleanups: Array<() => void> = [];

    const bind = () => {
      cleanups.forEach(c => c());
      cleanups = [];
      for (const { layerId, stateActions } of triggers) {
        const els = doc.querySelectorAll<HTMLElement>(`[data-layer-id="${CSS.escape(layerId)}"]`);
        els.forEach((el) => {
          for (const t of stateActions) {
            if (t.trigger === 'load') {
              if (!loadFired.has(el)) applySetVariableActions(t.actions, useRuntimeVarStore.getState());
              continue;
            }
            const evt = t.trigger === 'hover' ? 'mouseenter' : 'click';
            const handler = () => applySetVariableActions(t.actions, useRuntimeVarStore.getState());
            el.addEventListener(evt, handler);
            cleanups.push(() => el.removeEventListener(evt, handler));
          }
          loadFired.add(el);
        });
      }
    };

    bind();
    win.addEventListener(ITEMS_INJECTED_EVENT, bind);
    return () => {
      cleanups.forEach(c => c());
      win.removeEventListener(ITEMS_INJECTED_EVENT, bind);
    };
  }, [triggers, doc]);

  return null;
}
