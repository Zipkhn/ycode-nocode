import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleRuleMatches, collectStyleClassNames, pageHasConditionalStyles } from './conditional-styles';
import type { ConditionalStyleRule, Layer } from '@/types';

const rule = (over: Partial<ConditionalStyleRule>): ConditionalStyleRule => ({
  id: 'r1', className: 'is-active', varPath: 'state.active', operator: 'is', value: 'true', ...over,
});

test('styleRuleMatches: evaluates the runtime condition', () => {
  assert.equal(styleRuleMatches(rule({}), { state: { active: true } }), true);
  assert.equal(styleRuleMatches(rule({}), { state: { active: false } }), false);
  assert.equal(styleRuleMatches(rule({ operator: 'is_present', value: undefined }), { state: { active: 'x' } }), true);
  assert.equal(styleRuleMatches(rule({ varPath: '' }), { state: {} }), false);
});

test('collectStyleClassNames: gathers + splits all rule class names from the tree', () => {
  const layers = [
    { id: 'a', variables: { conditionalStyles: [rule({ className: 'bg-blue-500 scale-105' })] }, children: [
      { id: 'b', variables: { conditionalStyles: [rule({ id: 'r2', className: 'text-white' })] } },
    ] },
  ] as unknown as Layer[];
  assert.deepEqual(collectStyleClassNames(layers).sort(), ['bg-blue-500', 'scale-105', 'text-white']);
});

test('pageHasConditionalStyles: detects rules anywhere in the tree', () => {
  const withRules = [{ id: 'a', children: [{ id: 'b', variables: { conditionalStyles: [rule({})] } }] }] as unknown as Layer[];
  const without = [{ id: 'a', children: [{ id: 'b', variables: {} }] }] as unknown as Layer[];
  assert.equal(pageHasConditionalStyles(withRules), true);
  assert.equal(pageHasConditionalStyles(without), false);
});
