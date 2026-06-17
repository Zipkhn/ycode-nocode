import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConditionalVisibility, VisibilityCondition } from '@/types';
import { evaluateCondition, evaluateVisibility, type VisibilityContext } from '@/lib/layer-utils';

const TAG_A = 'tag-aaaa';
const TAG_B = 'tag-bbbb';

// Deterministic primitives via the current_page reference path:
// the context's current item (TAG_A) is referenced by 'field-true' but not 'field-false'.
const ref = (fieldId: string): VisibilityCondition => ({
  id: fieldId, source: 'collection_field', fieldId, fieldType: 'multi_reference',
  referenceCollectionId: 'tags', operator: 'is_one_of', value: '[]', valueMode: 'current_page',
});
const TRUE_COND = ref('field-true');
const FALSE_COND = ref('field-false');
const context: VisibilityContext = {
  collectionLayerData: { 'field-true': JSON.stringify([TAG_A]), 'field-false': JSON.stringify([TAG_B]) },
  pageCollectionData: null,
  pageCollectionItemId: TAG_A,
};

const cv = (defaultVisibility: 'visible' | 'hidden', groups: ConditionalVisibility['groups']): ConditionalVisibility =>
  ({ defaultVisibility, groups });
const group = (action: 'show' | 'hide', conditions: VisibilityCondition[]) => ({ id: action, action, conditions });

const vis = (c: ConditionalVisibility | undefined) => evaluateVisibility(c, context);

// Guard: the primitives must actually be true / false under this context.
test('primitives evaluate deterministically', () => {
  assert.equal(evaluateCondition(TRUE_COND, context), true);
  assert.equal(evaluateCondition(FALSE_COND, context), false);
});

// ── Defaults / empty ─────────────────────────────────────────────────────────

test('no config or no groups → defaultVisibility (visible when omitted)', () => {
  assert.equal(vis(undefined), true);
  assert.equal(vis(cv('visible', [])), true);
  assert.equal(vis(cv('hidden', [])), false);
  assert.equal(evaluateVisibility({ groups: [group('show', [TRUE_COND])] } as ConditionalVisibility, context), true); // default omitted → visible
});

test('a group with no conditions is skipped → falls back to default', () => {
  assert.equal(vis(cv('hidden', [group('show', [])])), false);
});

// ── Show / hide against default ──────────────────────────────────────────────

test('default visible: matching show stays visible, matching hide hides', () => {
  assert.equal(vis(cv('visible', [group('show', [TRUE_COND])])), true);
  assert.equal(vis(cv('visible', [group('hide', [TRUE_COND])])), false);
  assert.equal(vis(cv('visible', [group('show', [FALSE_COND])])), true); // no match → Else: visible
  assert.equal(vis(cv('visible', [group('hide', [FALSE_COND])])), true); // no match → Else: visible
});

// REGRESSION: default-hidden + matching show must REVEAL (was returning false).
test('default hidden: matching show reveals (reveal pattern)', () => {
  assert.equal(vis(cv('hidden', [group('show', [TRUE_COND])])), true);
  assert.equal(vis(cv('hidden', [group('show', [FALSE_COND])])), false); // no match → Else: hidden
});

// ── Precedence: HIDE always wins ─────────────────────────────────────────────

test('hide overrides show regardless of group order', () => {
  assert.equal(vis(cv('visible', [group('show', [TRUE_COND]), group('hide', [TRUE_COND])])), false);
  assert.equal(vis(cv('visible', [group('hide', [TRUE_COND]), group('show', [TRUE_COND])])), false);
  assert.equal(vis(cv('hidden', [group('show', [TRUE_COND]), group('hide', [TRUE_COND])])), false);
});

// ── OR semantics within a group ──────────────────────────────────────────────

test('within a group, ANY true condition matches (OR)', () => {
  assert.equal(vis(cv('visible', [group('hide', [FALSE_COND, TRUE_COND])])), false);
  assert.equal(vis(cv('visible', [group('hide', [FALSE_COND, FALSE_COND])])), true); // none match → Else
});
