import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePageTransition,
  generatePageTransitionCss,
  isShaderTransition,
  DEFAULT_PAGE_TRANSITION,
  type PageTransitionConfig,
} from './page-transitions';

const base = (over: Partial<PageTransitionConfig> = {}): PageTransitionConfig => ({
  ...DEFAULT_PAGE_TRANSITION,
  ...over,
});

test('normalizePageTransition: fills defaults from garbage input', () => {
  assert.deepEqual(normalizePageTransition(null), DEFAULT_PAGE_TRANSITION);
  assert.deepEqual(normalizePageTransition('nope'), DEFAULT_PAGE_TRANSITION);
  assert.deepEqual(normalizePageTransition({}), DEFAULT_PAGE_TRANSITION);
});

test('normalizePageTransition: validates type, clamps duration/intensity', () => {
  const c = normalizePageTransition({ type: 'bogus', duration: 99999, intensity: -50, enabled: false });
  assert.equal(c.type, DEFAULT_PAGE_TRANSITION.type);
  assert.equal(c.duration, 2000);
  assert.equal(c.intensity, 0);
  assert.equal(c.enabled, false);
});

test('normalizePageTransition: keeps valid values incl. shader type + colors', () => {
  const c = normalizePageTransition({
    type: 'shader_warp', duration: 700, easing: 'linear', intensity: 30, enabled: true,
    colorPrimary: '#abcdef', colorBack: '#010203',
  });
  assert.deepEqual(c, {
    type: 'shader_warp', duration: 700, easing: 'linear', intensity: 30, enabled: true,
    colorPrimary: '#abcdef', colorBack: '#010203',
  });
});

test('normalizePageTransition: rejects empty easing and bad hex colors', () => {
  const c = normalizePageTransition({ easing: '  ', colorPrimary: 'red', colorBack: '#zzz' });
  assert.equal(c.easing, DEFAULT_PAGE_TRANSITION.easing);
  assert.equal(c.colorPrimary, DEFAULT_PAGE_TRANSITION.colorPrimary);
  assert.equal(c.colorBack, DEFAULT_PAGE_TRANSITION.colorBack);
});

test('isShaderTransition: only shader_* presets', () => {
  assert.equal(isShaderTransition('shader_dither'), true);
  assert.equal(isShaderTransition('shader_smoke'), true);
  assert.equal(isShaderTransition('fade'), false);
  assert.equal(isShaderTransition('rgb_split'), false);
});

test('generatePageTransitionCss: disabled yields empty css and no filter', () => {
  const r = generatePageTransitionCss(base({ enabled: false }));
  assert.equal(r.css, '');
  assert.equal(r.rgbFilterDx, null);
});

test('generatePageTransitionCss: CSS preset animates the #yc-route wrapper, both phases', () => {
  const r = generatePageTransitionCss(base({ type: 'fade', duration: 750, easing: 'linear' }));
  assert.match(r.css, /#yc-route\[data-yc-phase=cover\]\{[^}]*750ms linear both yc-page-leave/);
  assert.match(r.css, /#yc-route\[data-yc-phase=reveal\]\{[^}]*750ms linear both yc-page-enter/);
  assert.doesNotMatch(r.css, /#ycode-curtain/); // no overlay for CSS presets
  assert.doesNotMatch(r.css, /data-yc-vt-cover/); // no cross-document hold — single document
  assert.match(r.css, /prefers-reduced-motion:reduce/);
});

test('generatePageTransitionCss: fade uses opacity keyframes, no filter', () => {
  const r = generatePageTransitionCss(base({ type: 'fade' }));
  assert.match(r.css, /@keyframes yc-page-leave\{to\{opacity:0\}\}/);
  assert.match(r.css, /@keyframes yc-page-enter\{from\{opacity:0\}\}/);
  assert.equal(r.rgbFilterDx, null);
});

test('generatePageTransitionCss: rgb_split applies chromatic filter to the page (no colour overlay)', () => {
  const low = generatePageTransitionCss(base({ type: 'rgb_split', intensity: 8 }));
  const high = generatePageTransitionCss(base({ type: 'rgb_split', intensity: 96 }));
  assert.match(low.css, /url\(#ycode-rgb-split\)/);
  assert.doesNotMatch(low.css, /repeating-linear-gradient/); // effect is on the page, not an overlay fill
  assert.doesNotMatch(low.css, /#ycode-curtain/);
  assert.ok(low.rgbFilterDx !== null && high.rgbFilterDx !== null);
  assert.ok((high.rgbFilterDx as number) > (low.rgbFilterDx as number));
  assert.ok((low.rgbFilterDx as number) >= 1);
});

test('generatePageTransitionCss: slide/zoom/reveal have no rgb filter', () => {
  for (const type of ['slide', 'zoom', 'reveal'] as const) {
    const r = generatePageTransitionCss(base({ type }));
    assert.equal(r.rgbFilterDx, null, `${type} should not need the rgb filter`);
    assert.match(r.css, /yc-page-enter/);
  }
});

test('generatePageTransitionCss: reveal uses clip-path wipe', () => {
  const r = generatePageTransitionCss(base({ type: 'reveal' }));
  assert.match(r.css, /clip-path:inset\(0 0 0 100%\)/);
});

test('generatePageTransitionCss: shader preset paints an overlay with solid colorBack fill', () => {
  const r = generatePageTransitionCss(base({ type: 'shader_smoke', colorBack: '#123456' }));
  assert.match(r.css, /#ycode-curtain\{[^}]*background:#123456/);
  assert.match(r.css, /@keyframes yc-curtain-cover\{from\{opacity:0\}to\{opacity:1\}\}/);
  assert.equal(r.rgbFilterDx, null);
});
