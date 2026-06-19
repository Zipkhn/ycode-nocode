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
    const apply = () => {
      const vars = useRuntimeVarStore.getState().vars;
      document.querySelectorAll<HTMLElement>(`[${STYLE_RULE_ATTR}]`).forEach((el) => {
        const raw = el.getAttribute(STYLE_RULE_ATTR);
        if (!raw) return;
        let rules: ConditionalStyleRule[];
        try { rules = JSON.parse(raw); } catch { return; }
        for (const rule of rules) {
          const on = styleRuleMatches(rule, vars);
          rule.className.split(/\s+/).filter(Boolean).forEach(c => el.classList.toggle(c, on));
        }
      });
    };

    apply();
    const unsubscribe = useRuntimeVarStore.subscribe(apply);
    window.addEventListener(ITEMS_INJECTED_EVENT, apply);
    return () => {
      unsubscribe();
      window.removeEventListener(ITEMS_INJECTED_EVENT, apply);
    };
  }, []);

  return null;
}
