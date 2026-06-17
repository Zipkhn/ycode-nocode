import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseStudioVariablesFromCss,
  parseCustomVarsConfig,
  applyStudioMutations,
  renderFullStudioCss,
  renderStudioDynamicCss,
  deriveSpacingParams,
} from './studio-css';

const BASE = [
  '/* STUDIO_CORE_START */',
  ':root {',
  '/* STUDIO_THEME_START */',
  '  --theme-light--background: #ffffff;',
  '  --space-base: 16;',
  '/* STUDIO_THEME_END */',
  '}',
  '@media (max-width: 767px) { :root { --site--column-count: 8 !important; } }',
  ':root { --site--column-count: 12; }',
  '/* STUDIO_CORE_END */',
  '.u-grid { display: grid; }   /* static utility — must survive */',
  '/* STUDIO_CUSTOM_VARS_START */',
  '/* CONFIG: {"modes":[{"id":"default","name":"Default","selector":":root"}],"variables":[]} */',
  '/* STUDIO_CUSTOM_VARS_END */',
  '/* STUDIO_RUNTIME_BRIDGES_START */',
  '/* old bridges */',
  '/* STUDIO_RUNTIME_BRIDGES_END */',
].join('\n');

// ── parsing ──────────────────────────────────────────────────────────────────────

test('parseStudioVariablesFromCss: reads :root tokens, skips !important overrides', () => {
  const vars = parseStudioVariablesFromCss(BASE)!;
  assert.equal(vars['theme-light--background'], '#ffffff');
  assert.equal(vars['space-base'], '16');
  assert.equal(vars['site--column-count'], '12'); // canonical, not the @media 8 !important
});

test('parseStudioVariablesFromCss: null when markers absent', () => {
  assert.equal(parseStudioVariablesFromCss('.foo{}'), null);
});

test('parseCustomVarsConfig: reads embedded CONFIG json, falls back to default', () => {
  assert.deepEqual(parseCustomVarsConfig(BASE).modes[0].selector, ':root');
  assert.equal(parseCustomVarsConfig('no markers').variables.length, 0);
});

// ── mutation ──────────────────────────────────────────────────────────────────────

test('applyStudioMutations: updates an existing :root var', () => {
  const out = applyStudioMutations(BASE, { 'theme-light--background': '#000000' }, undefined, undefined);
  assert.match(out, /--theme-light--background: #000000;/);
});

test('applyStudioMutations: never clobbers an !important scoped override', () => {
  const out = applyStudioMutations(BASE, { 'site--column-count': '6' }, undefined, undefined);
  assert.match(out, /--site--column-count: 8 !important;/);  // @media preserved
  assert.match(out, /:root \{ --site--column-count: 6; \}/); // canonical updated
});

test('applyStudioMutations: appends an unknown var before STUDIO_THEME_END', () => {
  const out = applyStudioMutations(BASE, { 'caption-font-weight': '500' }, undefined, undefined);
  assert.match(out, /--caption-font-weight: 500;\n\/\* STUDIO_THEME_END \*\//);
});

test('applyStudioMutations: __remove__ deletes the declaration', () => {
  const out = applyStudioMutations(BASE, { 'space-base': '__remove__' }, undefined, undefined);
  assert.doesNotMatch(out, /--space-base:/);
});

test('applyStudioMutations: replaces the runtime bridges block', () => {
  const out = applyStudioMutations(BASE, undefined, '/* new bridges */', undefined);
  assert.match(out, /STUDIO_RUNTIME_BRIDGES_START \*\/\n\/\* new bridges \*\/\n\/\* STUDIO_RUNTIME_BRIDGES_END/);
  assert.doesNotMatch(out, /old bridges/);
});

// ── rendering ────────────────────────────────────────────────────────────────────

test('deriveSpacingParams: reads vars, falls back to defaults', () => {
  assert.deepEqual(deriveSpacingParams({ 'space-base': '18' }), {
    spaceBase: 18, spaceRatio: 1.25, spaceVpMin: 375, spaceVpMax: 1366,
  });
});

test('renderFullStudioCss: keeps static utilities AND injects DB vars + bridges', () => {
  const css = renderFullStudioCss(BASE, {
    variables: { 'theme-light--background': '#123456', 'space-base': '16' },
    customVarsConfig: null,
  });
  assert.match(css, /\.u-grid \{ display: grid; \}/);              // static survives
  assert.match(css, /--theme-light--background: #123456;/);         // DB var applied
  assert.match(css, /Studio Runtime Bridge/);                       // bridges regenerated
  assert.doesNotMatch(css, /old bridges/);                          // stale bridges replaced
});

test('renderStudioDynamicCss: dynamic only — :root vars + bridges, NO static skeleton', () => {
  const css = renderStudioDynamicCss({
    variables: { 'theme-light--background': '#123456', 'space-base': '16' },
    customVarsConfig: null,
  });
  assert.match(css, /:root \{[\s\S]*--theme-light--background: #123456;[\s\S]*\}/); // vars block
  assert.match(css, /Studio Runtime Bridge/);                        // bridges present
  assert.doesNotMatch(css, /\.u-grid/);                              // NO static skeleton
  assert.doesNotMatch(css, /STUDIO_CORE_START/);                     // no markers
});

test('renderStudioDynamicCss: includes custom-vars block when configured', () => {
  const css = renderStudioDynamicCss({
    variables: { 'space-base': '16' },
    customVarsConfig: {
      modes: [{ id: 'default', name: 'Default', selector: ':root' }],
      variables: [{ id: 'v1', name: 'brand', type: 'color', values: { default: '#abc' } }],
    },
  });
  assert.match(css, /--custom--brand: #abc;/);
});

test('renderStudioDynamicCss: empty theme still emits bridges, no crash', () => {
  const css = renderStudioDynamicCss({ variables: {}, customVarsConfig: null });
  assert.match(css, /Studio Runtime Bridge/);
  assert.doesNotMatch(css, /:root \{\n\}/); // no empty vars block
});
