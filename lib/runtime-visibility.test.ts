import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasClientRuntimeSource,
  evaluateRuntimeCondition,
  evaluateClientRule,
  pageHasRuntimeState,
  RUNTIME_STATE_ATTR,
  type ClientVisibilityRule,
} from './runtime-visibility';
import type { ConditionalVisibility, VisibilityCondition, Layer } from '@/types';

const rv = (over: Partial<VisibilityCondition>): VisibilityCondition => ({
  id: 'c1',
  source: 'runtime_var',
  operator: 'is_present',
  ...over,
}) as VisibilityCondition;

// ── hasClientRuntimeSource ──────────────────────────────────────────────────
test('hasClientRuntimeSource: true when a runtime_var condition exists', () => {
  const cv: ConditionalVisibility = { groups: [{ id: 'g', conditions: [rv({ runtimeVarPath: 'forms.a.b' })] }] };
  assert.equal(hasClientRuntimeSource(cv), true);
});

test('hasClientRuntimeSource: false for only server-knowable sources / undefined', () => {
  const cv: ConditionalVisibility = {
    groups: [{ id: 'g', conditions: [{ id: 'c', source: 'collection_field', operator: 'is', fieldId: 'f' } as VisibilityCondition] }],
  };
  assert.equal(hasClientRuntimeSource(cv), false);
  assert.equal(hasClientRuntimeSource(undefined), false);
});

// ── evaluateRuntimeCondition (operator parity with layer-utils) ─────────────
test('evaluateRuntimeCondition: presence / emptiness', () => {
  const vars = { forms: { contact: { email: 'a@b.c' } } };
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'forms.contact.email', operator: 'is_present' }), vars), true);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'forms.contact.email', operator: 'is_empty' }), vars), false);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'forms.contact.missing', operator: 'is_present' }), vars), false);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'forms.contact.missing', operator: 'is_empty' }), vars), true);
});

test('evaluateRuntimeCondition: string + boolean equality, contains, numeric', () => {
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'plan', operator: 'is', value: 'pro' }), { plan: 'pro' }), true);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'agree', operator: 'is', value: 'true' }), { agree: true }), true);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'agree', operator: 'is', value: 'true' }), { agree: false }), false);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'msg', operator: 'contains', value: 'lo' }), { msg: 'hello' }), true);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'n', operator: 'gt', value: '3' }), { n: '5' }), true);
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: 'n', operator: 'lt', value: '3' }), { n: '5' }), false);
});

test('evaluateRuntimeCondition: missing path returns false', () => {
  assert.equal(evaluateRuntimeCondition(rv({ runtimeVarPath: '', operator: 'is_present' }), {}), false);
});

// ── evaluateClientRule (precedence) ─────────────────────────────────────────
test('evaluateClientRule: no groups -> defaultVisibility', () => {
  assert.equal(evaluateClientRule({ groups: [] }, {}), true);
  assert.equal(evaluateClientRule({ defaultVisibility: 'hidden', groups: [] }, {}), false);
});

test('evaluateClientRule: default-hidden + matching SHOW reveals', () => {
  const rule: ClientVisibilityRule = {
    defaultVisibility: 'hidden',
    groups: [{ action: 'show', conditions: [{ kind: 'runtime', condition: rv({ runtimeVarPath: 'open', operator: 'is', value: 'true' }) }] }],
  };
  assert.equal(evaluateClientRule(rule, { open: true }), true);
  assert.equal(evaluateClientRule(rule, { open: false }), false); // unmatched -> default hidden
});

test('evaluateClientRule: matching HIDE wins over matching SHOW', () => {
  const rule: ClientVisibilityRule = {
    groups: [
      { action: 'show', conditions: [{ kind: 'static', result: true }] },
      { action: 'hide', conditions: [{ kind: 'runtime', condition: rv({ runtimeVarPath: 'kill', operator: 'is', value: 'true' }) }] },
    ],
  };
  assert.equal(evaluateClientRule(rule, { kill: true }), false);
  assert.equal(evaluateClientRule(rule, { kill: false }), true);
});

test('evaluateClientRule: empty runtime vars == server best-effort (no flash)', () => {
  // default-visible, hide-when-present: with empty vars the hide group does not match -> visible (matches SSR).
  const rule: ClientVisibilityRule = {
    groups: [{ action: 'hide', conditions: [{ kind: 'runtime', condition: rv({ runtimeVarPath: 'forms.a.b', operator: 'is_present' }) }] }],
  };
  assert.equal(evaluateClientRule(rule, {}), true);
  assert.equal(evaluateClientRule(rule, { forms: { a: { b: 'x' } } }), false);
});

// ── pageHasRuntimeState ─────────────────────────────────────────────────────
test('pageHasRuntimeState: detects the marker attribute anywhere in the tree', () => {
  const withMarker = [
    { id: 'a', children: [{ id: 'b', attributes: { [RUNTIME_STATE_ATTR]: '{}' } }] },
  ] as unknown as Layer[];
  const without = [{ id: 'a', children: [{ id: 'b', attributes: { class: 'x' } }] }] as unknown as Layer[];
  assert.equal(pageHasRuntimeState(withMarker), true);
  assert.equal(pageHasRuntimeState(without), false);
});
