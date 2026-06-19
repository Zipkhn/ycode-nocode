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
    // Cache the tagged nodes + parsed rules so a store change only re-evaluates
    // (no DOM query / JSON.parse per keystroke). Refresh on mount + injection.
    let entries: { el: HTMLElement; rule: ClientVisibilityRule }[] = [];
    const refresh = () => {
      entries = [];
      document.querySelectorAll<HTMLElement>(`[${RUNTIME_STATE_ATTR}]`).forEach((el) => {
        const raw = el.getAttribute(RUNTIME_STATE_ATTR);
        if (!raw) return;
        try { entries.push({ el, rule: JSON.parse(raw) as ClientVisibilityRule }); } catch { /* malformed */ }
      });
    };
    const apply = () => {
      const vars = useRuntimeVarStore.getState().vars;
      for (const { el, rule } of entries) {
        if (evaluateClientRule(rule, vars)) el.style.removeProperty('display');
        else el.style.display = 'none';
      }
    };
    const refreshAndApply = () => { refresh(); apply(); };

    refreshAndApply(); // initial pass after hydration
    const unsubscribe = useRuntimeVarStore.subscribe(apply);
    window.addEventListener(ITEMS_INJECTED_EVENT, refreshAndApply);
    return () => {
      unsubscribe();
      window.removeEventListener(ITEMS_INJECTED_EVENT, refreshAndApply);
    };
  }, []);

  return null;
}
