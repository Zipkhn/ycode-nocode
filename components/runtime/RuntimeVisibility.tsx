'use client';

import { useEffect } from 'react';
import { useRuntimeVarStore } from '@/stores/useRuntimeVarStore';
import { evaluateClientRule, RUNTIME_STATE_ATTR, type ClientVisibilityRule } from '@/lib/runtime-visibility';
import { ITEMS_INJECTED_EVENT } from '@/components/FilterableCollection';

/**
 * Live re-evaluation of conditional-visibility rules that depend on client
 * runtime state. page-fetcher kept these layers and serialized their rule onto
 * `data-ycode-state-rule`; here we re-run each rule whenever the runtime var
 * store changes and toggle `display`. Mirrors the static-export runtime in
 * lib/apps/static-export/document.ts but store-subscribed instead of run-once.
 *
 * One page-level subscription iterating the tagged elements (no per-layer
 * subscriptions). Re-applies on ITEMS_INJECTED_EVENT so collection/load-more
 * clones are handled.
 */
export default function RuntimeVisibility() {
  useEffect(() => {
    const apply = () => {
      const vars = useRuntimeVarStore.getState().vars;
      document.querySelectorAll<HTMLElement>(`[${RUNTIME_STATE_ATTR}]`).forEach((el) => {
        const raw = el.getAttribute(RUNTIME_STATE_ATTR);
        if (!raw) return;
        let rule: ClientVisibilityRule;
        try { rule = JSON.parse(raw); } catch { return; }
        if (evaluateClientRule(rule, vars)) el.style.removeProperty('display');
        else el.style.display = 'none';
      });
    };

    apply(); // initial pass after hydration
    const unsubscribe = useRuntimeVarStore.subscribe(apply);
    window.addEventListener(ITEMS_INJECTED_EVENT, apply);
    return () => {
      unsubscribe();
      window.removeEventListener(ITEMS_INJECTED_EVENT, apply);
    };
  }, []);

  return null;
}
