import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleRuleMatches, pageHasConditionalStyles } from './conditional-styles';
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

test('pageHasConditionalStyles: detects rules anywhere in the tree', () => {
  const withRules = [{ id: 'a', children: [{ id: 'b', variables: { conditionalStyles: [rule({})] } }] }] as unknown as Layer[];
  const without = [{ id: 'a', children: [{ id: 'b', variables: {} }] }] as unknown as Layer[];
  assert.equal(pageHasConditionalStyles(withRules), true);
  assert.equal(pageHasConditionalStyles(without), false);
});
