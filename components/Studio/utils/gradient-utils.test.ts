import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gradientToCss, cssToGradient, DEFAULT_GRADIENT, type GradientDef,
} from '@/components/Studio/utils/gradient-utils';

// ── serialize ────────────────────────────────────────────────────────────────

test('gradientToCss: emits linear-gradient with sorted stops', () => {
  const def: GradientDef = { angle: 90, stops: [{ color: '#000000', position: 100 }, { color: '#ffffff', position: 0 }] };
  assert.equal(gradientToCss(def), 'linear-gradient(90deg, #ffffff 0%, #000000 100%)');
});

// ── round-trip ───────────────────────────────────────────────────────────────

test('cssToGradient ∘ gradientToCss is identity (stops sorted) for 2 and 3 stops', () => {
  const two: GradientDef = { angle: 135, stops: [{ color: '#3b82f6', position: 0 }, { color: '#8b5cf6', position: 100 }] };
  assert.deepEqual(cssToGradient(gradientToCss(two)), two);

  const three: GradientDef = {
    angle: 45,
    stops: [{ color: '#ff0000', position: 0 }, { color: '#00ff00', position: 50 }, { color: '#0000ff', position: 100 }],
  };
  assert.deepEqual(cssToGradient(gradientToCss(three)), three);
});

test('round-trip preserves decimal stop positions', () => {
  const def: GradientDef = { angle: 0, stops: [{ color: '#aabbcc', position: 0 }, { color: '#ddeeff', position: 33.5 }, { color: '#112233', position: 100 }] };
  assert.deepEqual(cssToGradient(gradientToCss(def)), def);
});

// ── parser robustness ────────────────────────────────────────────────────────

test('cssToGradient: non-gradient / malformed input falls back to DEFAULT', () => {
  assert.deepEqual(cssToGradient('#3b82f6'), DEFAULT_GRADIENT);
  assert.deepEqual(cssToGradient('radial-gradient(circle, #fff, #000)'), DEFAULT_GRADIENT);
  assert.deepEqual(cssToGradient(''), DEFAULT_GRADIENT);
});

test('cssToGradient: fewer than 2 valid hex stops falls back to DEFAULT stops', () => {
  const parsed = cssToGradient('linear-gradient(90deg, rgb(0,0,0) 0%, hsl(0,0%,0%) 100%)'); // no hex stops
  assert.deepEqual(parsed.stops, DEFAULT_GRADIENT.stops);
  assert.equal(parsed.angle, 90); // angle still parsed
});
