import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ColorVariable } from '@/types';
import { useColorVariablesStore } from '@/stores/useColorVariablesStore';

const cv = (id: string, value: string): ColorVariable =>
  ({ id, name: id, value, sort_order: 0 }) as unknown as ColorVariable;

const gen = (vars: ColorVariable[], previewOverride: { id: string; value: string } | null = null) => {
  useColorVariablesStore.setState({ colorVariables: vars, previewOverride });
  return useColorVariablesStore.getState().generateCssDeclarations();
};

test('solid hex emits the value verbatim', () => {
  assert.equal(gen([cv('brand', '#3b82f6')]), ':root { --brand: #3b82f6; }');
});

test('"#rrggbb/NN" opacity shorthand expands to rgba()', () => {
  assert.equal(gen([cv('faded', '#3b82f6/50')]), ':root { --faded: rgba(59,130,246,0.5); }');
});

test('gradient value passes through untouched (incl. internal "/")', () => {
  const grad = 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)';
  assert.equal(gen([cv('g', grad)]), `:root { --g: ${grad}; }`);

  // Regression: a gradient with a modern slash-syntax stop must NOT be mangled
  // into rgba(NaN,…) by the opacity-shorthand splitter.
  const slashGrad = 'linear-gradient(90deg, rgb(0 0 0 / 50%) 0%, #ffffff 100%)';
  assert.equal(gen([cv('g2', slashGrad)]), `:root { --g2: ${slashGrad}; }`);
});

test('multiple variables are concatenated inside one :root block', () => {
  assert.equal(
    gen([cv('a', '#000000'), cv('b', '#ffffff/25')]),
    ':root { --a: #000000; --b: rgba(255,255,255,0.25); }',
  );
});

test('previewOverride replaces only the matching variable', () => {
  const out = gen([cv('a', '#000000'), cv('b', '#ffffff')], { id: 'a', value: '#ff0000/50' });
  assert.equal(out, ':root { --a: rgba(255,0,0,0.5); --b: #ffffff; }');
});

test('empty store yields empty string', () => {
  assert.equal(gen([]), '');
});
