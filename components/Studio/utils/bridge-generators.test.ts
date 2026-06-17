import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugifyLevel,
  parseCustomLevels,
  RESERVED_LEVEL_KEYS,
  generateTypographyBridgeCSS,
  parseCustomThemeColors,
  RESERVED_THEME_KEYS,
  generateCustomThemeColorsBridgeCSS,
} from './bridge-generators';

// ── slugifyLevel ────────────────────────────────────────────────────────────────

test('slugifyLevel: lowercases, spaces→dash, strips junk, collapses/trims dashes', () => {
  assert.equal(slugifyLevel('Caption'), 'caption');
  assert.equal(slugifyLevel('Hero Title'), 'hero-title');
  assert.equal(slugifyLevel('  Lead!! Text  '), 'lead-text');
  assert.equal(slugifyLevel('Über@@Style'), 'berstyle'); // non a-z0-9 dropped
  assert.equal(slugifyLevel('-- weird -- '), 'weird');
  assert.equal(slugifyLevel('   '), '');
});

// ── parseCustomLevels ───────────────────────────────────────────────────────────

test('parseCustomLevels: derives levels from *-max keys, excludes built-ins', () => {
  const vars: Record<string, string> = {
    '_typography---font-size--caption-max': '1.5',
    '_typography---font-size--caption-min': '1.25',
    '_typography---font-size--h1-max': '5.7',           // built-in → excluded
    '_typography---font-size--text-main-max': '1.125',  // built-in → excluded
    'caption-font-weight': '500',
  };
  assert.deepEqual(parseCustomLevels(vars), [{ key: 'caption', label: 'Caption' }]);
});

test('parseCustomLevels: title-cases multi-word slugs, dedupes, ignores invalid keys', () => {
  const vars: Record<string, string> = {
    '_typography---font-size--hero-title-max': '3',
    '_typography---font-size--hero-title-min': '2', // same level, not a second -max
    '_typography---font-size--Bad_Key-max': '1',    // invalid chars → ignored
  };
  assert.deepEqual(parseCustomLevels(vars), [{ key: 'hero-title', label: 'Hero Title' }]);
});

test('parseCustomLevels: every reserved key is rejected as a custom level', () => {
  for (const k of RESERVED_LEVEL_KEYS) {
    const vars = { [`_typography---font-size--${k}-max`]: '1' };
    assert.deepEqual(parseCustomLevels(vars), [], `${k} should not be custom`);
  }
});

test('parseCustomLevels: empty / no-match maps yield []', () => {
  assert.deepEqual(parseCustomLevels({}), []);
  assert.deepEqual(parseCustomLevels({ 'space-base': '16', 'h1-font-weight': '700' }), []);
});

// ── generateTypographyBridgeCSS (custom emission) ────────────────────────────────

test('typography bridge: emits a .u-text-{slug} rule with fluid clamp for custom levels', () => {
  const css = generateTypographyBridgeCSS({
    '_typography---font-size--caption-max': '1.5',
    '_typography---font-size--caption-min': '1.25',
    'caption-font-weight': '500',
    'caption-line-height': '1.6',
  });
  assert.match(css, /\.u-text-caption\{/);
  assert.match(css, /font-size:clamp\(/);
  assert.match(css, /var\(--_typography---font-size--caption-min, 1\)/);
  assert.match(css, /var\(--_typography---font-size--caption-max, 1\.25\)/);
  assert.match(css, /font-weight:500!important/);
  assert.match(css, /line-height:1\.6!important/);
});

test('typography bridge: custom level falls back to defaults when props are unset', () => {
  const css = generateTypographyBridgeCSS({ '_typography---font-size--caption-max': '1.5' });
  // unset weight/lh/ls/mb → built-in fallbacks; no optional text-wrap / font-family
  assert.match(css, /\.u-text-caption\{font-size:clamp\([^}]*font-weight:400!important;line-height:1\.5!important;letter-spacing:0em!important;margin-bottom:0rem!important\}/);
});

test('typography bridge: text-wrap and font-family are emitted only when set', () => {
  const withExtras = generateTypographyBridgeCSS({
    '_typography---font-size--caption-max': '1.5',
    'caption-text-wrap': 'balance',
    'caption-font-family': '"Inter", sans-serif',
  });
  assert.match(withExtras, /text-wrap:balance!important/);
  assert.match(withExtras, /font-family:"Inter", sans-serif!important/);

  const without = generateTypographyBridgeCSS({ '_typography---font-size--caption-max': '1.5' });
  assert.doesNotMatch(without, /text-wrap:/);
  assert.doesNotMatch(without, /\.u-text-caption[^}]*font-family:/);
});

test('typography bridge: no custom levels → only built-in .u-text-* rules', () => {
  const css = generateTypographyBridgeCSS({});
  // Built-ins (display/large/small) still emit; nothing else.
  assert.doesNotMatch(css, /\.u-text-caption/);
  const customClasses = [...css.matchAll(/\.u-text-([a-z0-9-]+)/g)].map(m => m[1]).sort();
  assert.deepEqual(customClasses, ['display', 'large', 'small']);
});

// ── parseCustomThemeColors ───────────────────────────────────────────────────────

test('parseCustomThemeColors: derives tokens from theme-light--*, excludes built-ins & gradients', () => {
  const vars: Record<string, string> = {
    'theme-light--brand': '#111111',
    'theme-dark--brand': '#eeeeee',
    'theme-light--background': '#fff',          // built-in → excluded
    'theme-light--gradient-primary': 'var(...)', // gradient → excluded
    'theme-light--Bad_Key': '#000',              // invalid chars → excluded
  };
  assert.deepEqual(parseCustomThemeColors(vars), [{ key: 'brand', label: 'Brand' }]);
});

test('parseCustomThemeColors: every reserved key is rejected', () => {
  for (const k of RESERVED_THEME_KEYS) {
    assert.deepEqual(parseCustomThemeColors({ [`theme-light--${k}`]: '#000' }), [], `${k} reserved`);
  }
});

// ── generateCustomThemeColorsBridgeCSS ───────────────────────────────────────────

test('theme colors bridge: emits light var, dark override, and utility classes', () => {
  const css = generateCustomThemeColorsBridgeCSS({
    'theme-light--brand': '#112233',
    'theme-dark--brand': '#ffeedd',
  });
  assert.match(css, /:where\(body\)\{\s*--theme--brand: #112233;/);
  assert.match(css, /\.u-theme-dark,\.dark\{\s*--theme--brand: #ffeedd;/);
  assert.match(css, /\.u-bg-brand\{background-color:var\(--theme--brand\)!important\}/);
  assert.match(css, /\.u-text-color-brand\{color:var\(--theme--brand\)!important\}/);
  assert.match(css, /\.u-border-color-brand\{border-color:var\(--theme--brand\)!important\}/);
});

test('theme colors bridge: resolves a var() reference to hex for the declaration', () => {
  const css = generateCustomThemeColorsBridgeCSS({
    'theme-light--brand': 'var(--color--primary-500)',
    'theme-dark--brand': '#000000',
    'color--primary-500': '#abcdef',
  });
  assert.match(css, /--theme--brand: #abcdef;/);
});

test('theme colors bridge: no custom tokens → empty string', () => {
  assert.equal(generateCustomThemeColorsBridgeCSS({ 'theme-light--background': '#fff' }), '');
  assert.equal(generateCustomThemeColorsBridgeCSS({}), '');
});
