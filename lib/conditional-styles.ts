/**
 * Conditional styles (Conditionals — "states"): add Tailwind
 * classes to an element while a runtime condition holds. Client-safe (reuses
 * the runtime_var operator logic, no server evaluator).
 *
 * The class only takes effect on the published site if it is in the compiled
 * CSS, so `collectStyleClassNames` feeds these classes into the page CSS
 * compiler (lib/server/cssGenerator) alongside static layer classes. The
 * RuntimeStyles runtime then toggles the class live.
 */
import { evaluateRuntimeCondition } from './runtime-visibility';
import type { ConditionalStyleRule, VisibilityCondition, Layer } from '@/types';

/** DOM attribute carrying the serialized style rules on an element. */
export const STYLE_RULE_ATTR = 'data-ycode-style-rule';

/** True when the rule's runtime condition is currently satisfied. */
export function styleRuleMatches(rule: ConditionalStyleRule, runtimeVars: Record<string, unknown>): boolean {
  if (!rule.varPath) return false;
  const condition = {
    id: rule.id,
    source: 'runtime_var',
    runtimeVarPath: rule.varPath,
    operator: rule.operator,
    value: rule.value,
  } as VisibilityCondition;
  return evaluateRuntimeCondition(condition, runtimeVars);
}

/**
 * All class names referenced by conditional style rules across the tree, so the
 * CSS compiler includes them (otherwise Tailwind purges classes absent from the
 * static layer classes and the runtime toggle would have no effect).
 */
export function collectStyleClassNames(layers: Layer[]): string[] {
  const out: string[] = [];
  const walk = (ls: Layer[]) => {
    for (const l of ls) {
      const rules = l.variables?.conditionalStyles;
      if (rules) {
        for (const r of rules) {
          if (r.className) out.push(...r.className.split(/\s+/).filter(Boolean));
        }
      }
      if (l.children) walk(l.children);
    }
  };
  walk(layers);
  return out;
}

/** True if any layer carries conditional style rules — gates mounting the runtime. */
export function pageHasConditionalStyles(layers: Layer[]): boolean {
  const walk = (ls: Layer[]): boolean =>
    ls.some(l => !!l.variables?.conditionalStyles?.length || (l.children ? walk(l.children) : false));
  return walk(layers);
}
