import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hexToHsl, hslToHex, resolveVarToHex, generateColorScale,
} from '@/components/Studio/utils/color-utils';

const channels = (hex: string) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
const closeHex = (a: string, b: string, tol = 1) =>
  channels(a).every((v, i) => Math.abs(v - channels(b)[i]) <= tol);

// ── hex ↔ hsl round-trip ─────────────────────────────────────────────────────

test('hexToHsl→hslToHex round-trips within 1/255', () => {
  for (const hex of ['#3b82f6', '#ff0000', '#808080', '#123456', '#ffffff', '#000000']) {
    const hsl = hexToHsl(hex);
    assert.ok(hsl, `hexToHsl(${hex}) returned null`);
    assert.ok(closeHex(hslToHex(...hsl!), hex), `round-trip drifted for ${hex}`);
  }
});

test('hexToHsl rejects malformed input', () => {
  for (const bad of ['', '#fff', 'red', '#gggggg', '3b82f6']) {
    assert.equal(hexToHsl(bad), null);
  }
});

// ── oklch → hex ──────────────────────────────────────────────────────────────

test('resolveVarToHex converts oklch extremes and parses % lightness', () => {
  assert.equal(resolveVarToHex('oklch(1 0 0)', {}), '#ffffff');
  assert.equal(resolveVarToHex('oklch(0 0 0)', {}), '#000000');
  assert.equal(resolveVarToHex('oklch(100% 0 0)', {}), '#ffffff'); // % form == unit form
});

test('resolveVarToHex passes through hex and resolves var() chains', () => {
  assert.equal(resolveVarToHex('#abcdef', {}), '#abcdef');
  assert.equal(resolveVarToHex('var(--brand)', { brand: '#112233' }), '#112233');
  assert.equal(resolveVarToHex('var(--a)', { a: 'var(--b)', b: '#445566' }), '#445566');
});

test('resolveVarToHex is safe on bad input and cyclic vars', () => {
  assert.equal(resolveVarToHex('', {}), '');
  assert.equal(resolveVarToHex('not-a-color', {}), '');
  assert.equal(resolveVarToHex('var(--missing)', {}), '');
  assert.equal(resolveVarToHex('var(--a)', { a: 'var(--b)', b: 'var(--a)' }), ''); // cycle → depth guard, no throw
});

// ── color scale ──────────────────────────────────────────────────────────────

test('generateColorScale: 500 is the base, every step is a valid distinct color', () => {
  const scale = generateColorScale('#3b82f6', 'blue');
  assert.equal(scale['color--blue-500'], '#3b82f6');
  const hexes = Object.values(scale);
  assert.equal(hexes.length, 10);
  for (const h of hexes) assert.match(h, /^#[0-9a-f]{6}$/i);
  // Regression guard: the scale must NOT collapse to all-white (the 0..1 vs 0..100 bug).
  assert.ok(new Set(hexes).size >= 8, 'scale collapsed — steps are not distinct');
});

test('generateColorScale: lightness is monotonic from 50 (lightest) to 900 (darkest)', () => {
  const scale = generateColorScale('#3b82f6', 'blue');
  const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const lightness = steps.map(s => hexToHsl(scale[`color--blue-${s}`])![2]);
  for (let i = 1; i < lightness.length; i++) {
    assert.ok(lightness[i] <= lightness[i - 1] + 1e-9, `step ${steps[i]} not darker than ${steps[i - 1]}`);
  }
  assert.ok(lightness[0] > lightness[9], '50 must be lighter than 900');
});

test('generateColorScale returns {} for invalid base hex', () => {
  assert.deepEqual(generateColorScale('nope', 'x'), {});
});
