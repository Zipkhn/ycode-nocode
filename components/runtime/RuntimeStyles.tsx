'use client';

import { useEffect } from 'react';
import { useRuntimeVarStore } from '@/stores/useRuntimeVarStore';
import { styleRuleMatches, STYLE_RULE_ATTR } from '@/lib/conditional-styles';
import { ITEMS_INJECTED_EVENT } from '@/components/FilterableCollection';
import type { ConditionalStyleRule } from '@/types';

/**
 * Toggles conditional style classes (App State) live: for each element carrying
 * serialized rules, add/remove its classes whenever the runtime var store
 * changes. The classes are compiled into the page CSS by cssGenerator, so the
 * toggle takes effect. One page-level subscription; re-applies on
 * ITEMS_INJECTED_EVENT for collection/load-more clones.
 */
export default function RuntimeStyles() {
  useEffect(() => {
    // Cache nodes + parsed rules (+ pre-split class lists) so a store change only
    // re-evaluates. Refresh on mount + injection.
    let entries: { el: HTMLElement; rules: { rule: ConditionalStyleRule; classes: string[] }[] }[] = [];
    const refresh = () => {
      entries = [];
      document.querySelectorAll<HTMLElement>(`[${STYLE_RULE_ATTR}]`).forEach((el) => {
        const raw = el.getAttribute(STYLE_RULE_ATTR);
        if (!raw) return;
        try {
          const rules = (JSON.parse(raw) as ConditionalStyleRule[]).map(rule => ({
            rule,
            classes: rule.className.split(/\s+/).filter(Boolean),
          }));
          entries.push({ el, rules });
        } catch { /* malformed */ }
      });
    };
    const apply = () => {
      const vars = useRuntimeVarStore.getState().vars;
      for (const { el, rules } of entries) {
        for (const { rule, classes } of rules) {
          const on = styleRuleMatches(rule, vars);
          for (const c of classes) el.classList.toggle(c, on);
        }
      }
    };
    const refreshAndApply = () => { refresh(); apply(); };

    refreshAndApply();
    const unsubscribe = useRuntimeVarStore.subscribe(apply);
    window.addEventListener(ITEMS_INJECTED_EVENT, refreshAndApply);
    return () => {
      unsubscribe();
      window.removeEventListener(ITEMS_INJECTED_EVENT, refreshAndApply);
    };
  }, []);

  return null;
}
