import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeNextValue,
  applySetVariableActions,
  collectStateActionLayers,
  type VarStore,
} from './setVariableAction';
import type { Layer } from '@/types';

const makeStore = (init: Record<string, unknown> = {}): VarStore & { vars: Record<string, unknown> } => {
  const vars: Record<string, unknown> = { ...init };
  return { vars, getVar: (p) => vars[p], setVar: (p, v) => { vars[p] = v; } };
};

test('computeNextValue: set returns the literal value (default empty string)', () => {
  assert.equal(computeNextValue({ varPath: 'x', op: 'set', value: 'pro' }, 'free'), 'pro');
  assert.equal(computeNextValue({ varPath: 'x', op: 'set' }, 'free'), '');
});

test('computeNextValue: toggle flips truthiness to a boolean', () => {
  assert.equal(computeNextValue({ varPath: 'x', op: 'toggle' }, false), true);
  assert.equal(computeNextValue({ varPath: 'x', op: 'toggle' }, true), false);
  assert.equal(computeNextValue({ varPath: 'x', op: 'toggle' }, undefined), true);
});

test('computeNextValue: increment/decrement default step 1, custom step', () => {
  assert.equal(computeNextValue({ varPath: 'n', op: 'increment' }, 2), 3);
  assert.equal(computeNextValue({ varPath: 'n', op: 'increment', value: '5' }, 0), 5);
  assert.equal(computeNextValue({ varPath: 'n', op: 'decrement' }, 2), 1);
  assert.equal(computeNextValue({ varPath: 'n', op: 'increment' }, undefined), 1);
});

test('applySetVariableActions: applies each action in order, skips empty paths', () => {
  const store = makeStore({ 'state.count': 0 });
  applySetVariableActions(
    [
      { varPath: 'state.count', op: 'increment' },
      { varPath: '', op: 'toggle' },
      { varPath: 'state.open', op: 'set', value: 'true' },
    ],
    store,
  );
  assert.equal(store.vars['state.count'], 1);
  assert.equal(store.vars['state.open'], 'true');
});

test('applySetVariableActions: no-op for empty/undefined list', () => {
  const store = makeStore({ a: 1 });
  applySetVariableActions(undefined, store);
  applySetVariableActions([], store);
  assert.deepEqual(store.vars, { a: 1 });
});

test('collectStateActionLayers: walks the tree, keeps only layers with triggers', () => {
  const layers = [
    { id: 'a', stateActions: [{ id: 't', trigger: 'click', actions: [] }], children: [
      { id: 'b' },
      { id: 'c', stateActions: [{ id: 't2', trigger: 'hover', actions: [] }] },
    ] },
  ] as unknown as Layer[];
  const collected = collectStateActionLayers(layers);
  assert.deepEqual(collected.map(c => c.layerId), ['a', 'c']);
});
