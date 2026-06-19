import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coerceVariableDefault, buildStateDefaults } from './project-variables';
import type { VariableDefinition } from '@/types';

test('coerceVariableDefault: boolean', () => {
  assert.equal(coerceVariableDefault('boolean', 'true'), true);
  assert.equal(coerceVariableDefault('boolean', 'false'), false);
  assert.equal(coerceVariableDefault('boolean', undefined), false);
});

test('coerceVariableDefault: number (NaN -> 0)', () => {
  assert.equal(coerceVariableDefault('number', '5'), 5);
  assert.equal(coerceVariableDefault('number', 'x'), 0);
  assert.equal(coerceVariableDefault('number', undefined), 0);
});

test('coerceVariableDefault: string passthrough', () => {
  assert.equal(coerceVariableDefault('string', 'pro'), 'pro');
  assert.equal(coerceVariableDefault('string', undefined), '');
});

test('buildStateDefaults: maps names to coerced defaults, skips nameless', () => {
  const defs = [
    { id: '1', name: 'menuOpen', type: 'boolean', defaultValue: 'false' },
    { id: '2', name: 'plan', type: 'string', defaultValue: 'free' },
    { id: '3', name: 'count', type: 'number', defaultValue: '2' },
    { id: '4', name: '', type: 'string', defaultValue: 'x' },
  ] as VariableDefinition[];
  assert.deepEqual(buildStateDefaults(defs), { menuOpen: false, plan: 'free', count: 2 });
  assert.deepEqual(buildStateDefaults(null), {});
  assert.deepEqual(buildStateDefaults(undefined), {});
});
