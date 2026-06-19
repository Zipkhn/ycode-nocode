/**
 * Client-reactive conditional visibility (fork feature — "App State").
 *
 * Conditional-visibility rules whose source is a CLIENT-runtime value (a form
 * field, later a user-set variable) cannot be decided server-side: their value
 * only exists in the browser and changes as the visitor interacts. This module
 * is the CLIENT-SAFE half of the system — it carries NO dependency on the heavy
 * server evaluator (`lib/layer-utils`) so it can ship in the published bundle.
 *
 * Flow: `page-fetcher` keeps such layers (instead of dropping them), bakes the
 * server-knowable conditions to booleans, and serializes a {@link ClientVisibilityRule}
 * onto the element via the `data-ycode-state-rule` attribute. The
 * `RuntimeVisibility` runtime then re-evaluates each rule live against
 * `useRuntimeVarStore` and toggles `display`.
 *
 * `buildClientVisibilityRule` (the server-only builder that bakes the static
 * conditions) lives in `lib/page-fetcher.ts`, which already imports the canonical
 * `evaluateCondition`.
 */
import type { ConditionalVisibility, VisibilityCondition, VisibilityOperator, Layer } from '@/types';

/** DOM attribute carrying the serialized client rule on a deferred element. */
export const RUNTIME_STATE_ATTR = 'data-ycode-state-rule';

/** Condition sources whose value is only known in the browser at runtime. */
const CLIENT_RUNTIME_SOURCES = new Set(['runtime_var']);

/** A single condition inside a client rule: either a live runtime condition or a server-baked boolean. */
export type ClientVisibilityCondition =
  | { kind: 'runtime'; condition: VisibilityCondition }
  | { kind: 'static'; result: boolean };

export interface ClientVisibilityGroup {
  action?: 'show' | 'hide';
  conditions: ClientVisibilityCondition[];
}

/** Serializable rule mirrored from `ConditionalVisibility`, evaluated on the client. */
export interface ClientVisibilityRule {
  defaultVisibility?: 'visible' | 'hidden';
  groups: ClientVisibilityGroup[];
}

/** True if any condition uses a client-runtime source (so the layer must be deferred to the client). */
export function hasClientRuntimeSource(cv: ConditionalVisibility | undefined): boolean {
  return !!cv?.groups?.some(g => g.conditions?.some(c => CLIENT_RUNTIME_SOURCES.has(c.source)));
}

/**
 * Resolve a dot-notation path against the runtime var tree and apply the
 * condition's operator. Mirrors the `runtime_var` branch of `evaluateCondition`
 * in `lib/layer-utils.ts` — kept duplicated here so the client bundle does not
 * pull in the full server evaluator. Keep the two in sync.
 */
export function evaluateRuntimeCondition(
  condition: VisibilityCondition,
  runtimeVars: Record<string, unknown>,
): boolean {
  const path = condition.runtimeVarPath;
  if (!path) return false;

  const rawValue = path.split('.').reduce<unknown>((acc, key) => {
    if (acc !== null && acc !== undefined && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, runtimeVars);

  const isPresent = rawValue !== undefined && rawValue !== null && rawValue !== '';
  const strValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);
  const compareValue = String(condition.value ?? '');
  const op: VisibilityOperator = condition.operator;

  switch (op) {
    case 'is':
      return typeof rawValue === 'boolean'
        ? rawValue === (compareValue === 'true')
        : strValue === compareValue;
    case 'is_not': return strValue !== compareValue;
    case 'is_present': return isPresent;
    case 'is_empty': return !isPresent;
    case 'contains': return strValue.toLowerCase().includes(compareValue.toLowerCase());
    case 'does_not_contain': return !strValue.toLowerCase().includes(compareValue.toLowerCase());
    case 'lt': return parseFloat(strValue) < parseFloat(compareValue);
    case 'lte': return parseFloat(strValue) <= parseFloat(compareValue);
    case 'gt': return parseFloat(strValue) > parseFloat(compareValue);
    case 'gte': return parseFloat(strValue) >= parseFloat(compareValue);
    case 'is_before': {
      const target = compareValue === 'today' ? new Date() : new Date(compareValue);
      return new Date(strValue) < target;
    }
    case 'is_after': {
      const target = compareValue === 'today' ? new Date() : new Date(compareValue);
      return new Date(strValue) > target;
    }
    default: return false;
  }
}

/**
 * Evaluate a client rule against the current runtime vars. Reproduces the
 * precedence of `evaluateVisibility` (lib/layer-utils.ts): a matching HIDE group
 * always wins, otherwise a matching SHOW reveals, otherwise the defaultVisibility.
 * Static (server-baked) conditions read their stored boolean; runtime conditions
 * are evaluated live.
 */
export function evaluateClientRule(
  rule: ClientVisibilityRule,
  runtimeVars: Record<string, unknown>,
): boolean {
  const defaultVisible = (rule.defaultVisibility ?? 'visible') === 'visible';
  if (!rule.groups?.length) return defaultVisible;

  let showMatched = false;
  let hideMatched = false;

  for (const group of rule.groups) {
    if (!group.conditions?.length) continue;
    const groupTrue = group.conditions.some(c =>
      c.kind === 'static' ? c.result : evaluateRuntimeCondition(c.condition, runtimeVars),
    );
    if (!groupTrue) continue;
    if ((group.action ?? 'show') === 'hide') hideMatched = true;
    else showMatched = true;
  }

  if (hideMatched) return false;
  if (showMatched) return true;
  return defaultVisible;
}

/** True if any (already server-filtered) layer carries a client visibility rule — gates mounting the runtime. */
export function pageHasRuntimeState(layers: Layer[]): boolean {
  const walk = (ls: Layer[]): boolean =>
    ls.some(l => !!(l.attributes && RUNTIME_STATE_ATTR in l.attributes) || (l.children ? walk(l.children) : false));
  return walk(layers);
}
