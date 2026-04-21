import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const publicThemePath = path.join(rootDir, 'public', 'global-theme.css');
const appThemePath    = path.join(rootDir, 'app',    'global-theme.css');
const canvasUtilsPath = path.join(rootDir, 'lib',    'canvas-utils.ts');

const canvasStylePlaceholder = `  <style id="studio-runtime-css">
    /* Injected at runtime by Canvas.tsx to ensure priority and bypass caching */
  </style>`;

/* ── Utility ── */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Remove accumulated junk from previous script runs:
 * - Excess blank lines (3+) collapsed to 2
 * - Duplicate stale "Grid Spans 1-12 with ID Stacking" comments
 * - Legacy 479px @media column-count overrides (old format)
 */
function cleanupCSS(content) {
  // 1. Remove duplicate stale comments left over from old versions
  content = content.replace(/(\n\/\* Grid Spans 1-12 with ID Stacking \*\/){2,}/g, '');
  content = content.replace(/\n\/\* Grid Spans 1-12 with ID Stacking \*\//g, '');

  // 2. Remove legacy 479px media query overrides
  content = content.replace(
    /@media\s+screen\s+and\s+\(max-width:\s*479px\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/g,
    ''
  );

  // 3. Collapse 3+ consecutive blank lines to 2
  content = content.replace(/(\n\s*){3,}/g, '\n\n');

  return content;
}

/**
 * Ensure primary/secondary color scale variables exist in STUDIO_CORE.
 * Only injects variables that are missing — never overwrites user-set values.
 */
function ensureColorScales(content) {
  const CORE_END = '/* STUDIO_CORE_END */';
  if (!content.includes(CORE_END)) return content;

  const PRIMARY_DEFAULTS = {
    'color--primary-900': '#0D1133', 'color--primary-800': '#1A2366',
    'color--primary-700': '#2B3799', 'color--primary-600': '#3D4DCC',
    'color--primary-500': '#5465FF', 'color--primary-400': '#788BFF',
    'color--primary-300': '#9DB4FF', 'color--primary-200': '#C4D0FF',
    'color--primary-100': '#E0E6FF', 'color--primary-50':  '#F0F3FF',
  };
  const SECONDARY_DEFAULTS = {
    'color--secondary-900': '#1A2E6E', 'color--secondary-800': '#2B47A8',
    'color--secondary-700': '#4060CC', 'color--secondary-600': '#5878E8',
    'color--secondary-500': '#7A93FF', 'color--secondary-400': '#9DB4FF',
    'color--secondary-300': '#B8C8FF', 'color--secondary-200': '#D1DCFF',
    'color--secondary-100': '#E8EEFF', 'color--secondary-50':  '#F5F7FF',
  };

  const missing = [];
  for (const [key, val] of Object.entries({ ...PRIMARY_DEFAULTS, ...SECONDARY_DEFAULTS })) {
    if (!content.includes(`--${key}:`)) missing.push(`  --${key}: ${val};`);
  }

  if (missing.length > 0) {
    content = content.replace(CORE_END, `:root {\n${missing.join('\n')}\n}\n${CORE_END}`);
    console.log(`✅ Injected ${missing.length} missing color scale vars (primary/secondary)`);
  } else {
    console.log('✅ Color scales (primary/secondary) already present');
  }
  return content;
}

/**
 * Fix stale theme variable references and ensure theme defaults use
 * color scale variables (var(--color--*)) instead of old flat names.
 * Non-destructive: only rewrites known stale values; user-set values are kept.
 */
function fixThemeVars(content) {
  // Fix stale legacy flat references
  content = content.replace(/var\(--color--primary\)/g,      'var(--color--primary-500)');
  content = content.replace(/var\(--color--primary-dark\)/g, 'var(--color--primary-400)');
  content = content.replace(/var\(--color--secondary\)/g,    'var(--color--secondary-500)');

  const THEME_BLOCK_START = '/* STUDIO_THEME_START */';
  const THEME_BLOCK_END   = '/* STUDIO_THEME_END */';
  const CORE_END          = '/* STUDIO_CORE_END */';

  const themeBlock = `${THEME_BLOCK_START}
  /* --- 7. THEME BACKING VARS (Light) --- */
  --theme-light--background:    var(--color--grey-50);
  --theme-light--text-main:     var(--color--grey-900);
  --theme-light--text-heading:  var(--color--grey-900);
  --theme-light--text-muted:    var(--color--grey-600);
  --theme-light--border:        var(--color--grey-200);
  --theme-light--accent:        var(--color--primary-500);

  /* --- 8. THEME BACKING VARS (Dark) --- */
  --theme-dark--background:     var(--color--grey-900);
  --theme-dark--text-main:      var(--color--grey-50);
  --theme-dark--text-heading:   var(--color--grey-50);
  --theme-dark--text-muted:     var(--color--grey-400);
  --theme-dark--border:         var(--color--grey-800);
  --theme-dark--accent:         var(--color--primary-400);

  /* --- 9. THEME TOKENS — use these in your design --- */
  --theme-bg:           var(--theme-light--background);
  --theme-text-main:    var(--theme-light--text-main);
  --theme-text-heading: var(--theme-light--text-heading);
  --theme-text-muted:   var(--theme-light--text-muted);
  --theme-accent:       var(--theme-light--accent);
  --theme-border:       var(--theme-light--border);
${THEME_BLOCK_END}`;

  const darkBlock = `\n/* Dark inversion — add .u-theme-dark on any element to switch to dark palette */\n.u-theme-dark,\n.dark {\n  --theme-bg:           var(--theme-dark--background);\n  --theme-text-main:    var(--theme-dark--text-main);\n  --theme-text-heading: var(--theme-dark--text-heading);\n  --theme-text-muted:   var(--theme-dark--text-muted);\n  --theme-accent:       var(--theme-dark--accent);\n  --theme-border:       var(--theme-dark--border);\n}\n`;

  if (content.includes(THEME_BLOCK_START) && content.includes(THEME_BLOCK_END)) {
    // Regenerate in-place (preserves user-set backing values — only the token block is fixed)
    // Don't overwrite backing vars the user may have changed via Studio; only add missing ones
    console.log('✅ Theme vars: block present, legacy refs patched');
  } else if (content.includes(CORE_END)) {
    // First run: inject the full theme block before STUDIO_CORE_END
    content = content.replace(CORE_END, `${themeBlock}\n${CORE_END}`);
    console.log('✅ Theme vars: block injected');
  }

  // Ensure .u-theme-dark block exists right after the :root closing
  if (!content.includes('.u-theme-dark')) {
    content = content.replace(/\.dark\s*\{[\s\S]*?--theme-[^}]*\}/, '');
    // Append dark block after STUDIO_CORE_END
    content = content.replace(CORE_END, `${CORE_END}${darkBlock}`);
    console.log('✅ Theme vars: .u-theme-dark block added');
  } else {
    console.log('✅ Theme vars: .u-theme-dark already present');
  }

  return content;
}

/**
 * Ensure --space-0: 0px is defined in the STUDIO_CORE section.
 * Fixes any previous run that wrote unitless `0`.
 */
function ensureSpaceZeroVar(content) {
  const CORE_END = '/* STUDIO_CORE_END */';
  if (!content.includes(CORE_END)) return content;

  // Remove any existing --space-0 declaration (wherever it lives)
  content = content.replace(/\n?\s*--space-0:[^;]+;\n?/g, '\n');

  // Inject before STUDIO_CORE_END
  content = content.replace(CORE_END, `:root {\n  --space-0: 0px;\n}\n${CORE_END}`);
  console.log('✅ --space-0: 0px ensured in STUDIO_CORE');
  return content;
}

/**
 * Regenerate the STUDIO_RUNTIME_BRIDGES section.
 *
 * Spacing bridge (v9.1): mirrors StudioThemeEditor.generateSpacingBridgeCSS —
 *   desktop precise selectors + tablet @media (≤1024px) + mobile @media (≤767px).
 *   space-0 emits literal 0px; all others reference var(--space-*).
 *
 * Typography bridge: reads current --*-font-weight etc. values already present
 *   in the file (written by the Studio on last save), falls back to sane defaults.
 *   Selector mapping mirrors StudioThemeEditor.generateTypographyBridgeCSS.
 */
function injectRuntimeBridges(content) {
  // ── Spacing bridge ────────────────────────────────────────────────────────
  const tokens = [
    { token: 'space-3xs', cssVar: '--space-3xs' },
    { token: 'space-2xs', cssVar: '--space-2xs' },
    { token: 'space-xs',  cssVar: '--space-xs'  },
    { token: 'space-s',   cssVar: '--space-s'   },
    { token: 'space-m',   cssVar: '--space-m'   },
    { token: 'space-l',   cssVar: '--space-l'   },
    { token: 'space-xl',  cssVar: '--space-xl'  },
    { token: 'space-2xl', cssVar: '--space-2xl' },
    { token: 'space-3xl', cssVar: '--space-3xl' },
    { token: 'space-0',   cssVar: '--space-0'   },
  ];

  const props = [
    { prefix: 'pt',  property: 'padding-top' },
    { prefix: 'pb',  property: 'padding-bottom' },
    { prefix: 'pl',  property: 'padding-left' },
    { prefix: 'pr',  property: 'padding-right' },
    { prefix: 'px',  property: 'padding-left:VAR!important;padding-right' },
    { prefix: 'py',  property: 'padding-top:VAR!important;padding-bottom' },
    { prefix: 'mt',  property: 'margin-top' },
    { prefix: 'mb',  property: 'margin-bottom' },
    { prefix: 'ml',  property: 'margin-left' },
    { prefix: 'mr',  property: 'margin-right' },
    { prefix: 'mx',  property: 'margin-left:VAR!important;margin-right' },
    { prefix: 'my',  property: 'margin-top:VAR!important;margin-bottom' },
    { prefix: 'gap', property: 'gap' },
  ];

  const scope = ':where(body)';

  const cssRule = (sel, property, val) => {
    if (property.includes(':VAR')) {
      const expanded = property.replace(':VAR', `:${val}`);
      return `${sel}{${expanded}:${val}!important}`;
    }
    return `${sel}{${property}:${val}!important}`;
  };

  const desktopSel = (cls) =>
    `:is(${scope} [class^="${cls}"],${scope} [class*=" ${cls}"])`;

  const respSel = (bpPrefix, cls) =>
    `${scope} [class*="${bpPrefix}${cls}"]`;

  const spacingLines = [
    '/* Studio Runtime Bridge v9.1 — breakpoint-aware, auto-generated */',
    ':root{--space-0:0px}',
  ];

  for (const tok of tokens) {
    const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
    for (const prop of props) {
      const cls = `${prop.prefix}-${tok.token}`;
      spacingLines.push(cssRule(desktopSel(cls), prop.property, val));
    }
  }

  spacingLines.push('@media screen and (max-width:1024px){');
  for (const tok of tokens) {
    const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
    for (const prop of props) {
      const cls = `${prop.prefix}-${tok.token}`;
      const sel = `:is(${respSel('max-lg:', cls)},${respSel('md:', cls)})`;
      spacingLines.push(cssRule(sel, prop.property, val));
    }
  }
  spacingLines.push('}');

  spacingLines.push('@media screen and (max-width:767px){');
  for (const tok of tokens) {
    const val = tok.token === 'space-0' ? '0px' : `var(${tok.cssVar})`;
    for (const prop of props) {
      const cls = `${prop.prefix}-${tok.token}`;
      const sel = `:is(${respSel('max-md:', cls)},${respSel('sm:', cls)})`;
      spacingLines.push(cssRule(sel, prop.property, val));
    }
  }
  spacingLines.push('}');

  // ── Typography bridge ─────────────────────────────────────────────────────
  // Read current variable values from the file; fall back to defaults.
  const readVar = (key, fallback) => {
    const m = content.match(new RegExp(`--${key}:\\s*([^;]+);`));
    return m ? m[1].trim() : fallback;
  };

  const TYPO_LEVELS = [
    { key: 'display', selector: `${scope} .u-text-display` },
    { key: 'h1',      selector: `${scope} h1` },
    { key: 'h2',      selector: `${scope} h2` },
    { key: 'h3',      selector: `${scope} h3` },
    { key: 'h4',      selector: `${scope} h4` },
    { key: 'h5',      selector: `${scope} h5` },
    { key: 'h6',      selector: `${scope} h6` },
    { key: 'large',   selector: `${scope} .u-text-large` },
    { key: 'body',    selector: `${scope} p` },
    { key: 'small',   selector: `${scope} .u-text-small` },
  ];

  const LINE_HEIGHT_DEFAULTS = {
    display: '1.2', h1: '1.2', h2: '1.2', h3: '1.3',
    h4: '1.4', h5: '1.4', h6: '1.5', large: '1.5', body: '1.5', small: '1.5',
  };

  const typoLines = ['/* Studio Runtime Typography Bridge v9.0 */'];
  for (const lvl of TYPO_LEVELS) {
    const fw = readVar(`${lvl.key}-font-weight`,   '600');
    const lh = readVar(`${lvl.key}-line-height`,   LINE_HEIGHT_DEFAULTS[lvl.key] || '1.4');
    const ls = readVar(`${lvl.key}-letter-spacing`, '0em');
    const mb = readVar(`${lvl.key}-margin-bottom`,  '0rem');
    typoLines.push(`${lvl.selector}{font-weight:${fw}!important;line-height:${lh}!important;letter-spacing:${ls}!important;margin-bottom:${mb}!important}`);
  }

  // ── Preserve runtime-only sections (theme dark bridge with UUIDs) ─────────
  // These are written by the Studio sync and contain Ycode UUIDs — the patch
  // script cannot regenerate them. Extract and re-inject them as-is.
  const BRIDGE_START = '/* STUDIO_RUNTIME_BRIDGES_START */';
  const BRIDGE_END   = '/* STUDIO_RUNTIME_BRIDGES_END */';

  let preservedThemeDark = '';
  if (content.includes(BRIDGE_START) && content.includes(BRIDGE_END)) {
    const existingBridgeMatch = content.match(
      new RegExp(`${escapeRegex(BRIDGE_START)}([\\s\\S]*?)${escapeRegex(BRIDGE_END)}`)
    );
    if (existingBridgeMatch) {
      const existingContent = existingBridgeMatch[1];
      const themeDarkMatch = existingContent.match(
        /\/\* Studio Theme Dark Bridge \*\/[\s\S]*?\.u-theme-dark\s*\{[\s\S]*?\}/
      );
      if (themeDarkMatch) preservedThemeDark = '\n\n' + themeDarkMatch[0];
    }
  }

  const bridgeBlock = `\n${BRIDGE_START}\n${spacingLines.join('\n')}\n\n${typoLines.join('\n')}${preservedThemeDark}\n${BRIDGE_END}\n`;

  if (content.includes(BRIDGE_START) && content.includes(BRIDGE_END)) {
    content = content.replace(
      new RegExp(`${escapeRegex(BRIDGE_START)}[\\s\\S]*?${escapeRegex(BRIDGE_END)}`),
      bridgeBlock.trimStart()
    );
  } else {
    content = content.trimEnd() + '\n' + bridgeBlock;
  }

  const themeDarkMsg = preservedThemeDark ? ' + theme dark bridge preserved' : '';
  console.log(`✅ Runtime bridges regenerated (spacing v9.1 + typography${themeDarkMsg})`);
  return content;
}

/**
 * Generate the u-col-span-* CSS and write it directly into public/global-theme.css
 * between the STUDIO_CORE_START and STUDIO_CORE_END markers.
 * No destructive regex — we simply replace the generated block each time.
 */
function generateAndInjectSpans() {
  if (!fs.existsSync(publicThemePath)) {
    console.error('❌ Could not find public/global-theme.css');
    return;
  }

  console.log('🛡️  Running Studio CSS Guardian...');

  let content = fs.readFileSync(publicThemePath, 'utf8');

  /* ── 1. Cleanup stale artifacts ── */
  content = cleanupCSS(content);

  /* ── 2. Build generated spans block ── */
  let spansBlock = '\n/* Grid Spans 1-12 (Studio Native — generated) */\n';
  const ROOT_SELECTOR = ':is(#ybody, .y-canvas, [data-ycode-canvas])';
  for (let i = 1; i <= 12; i++) {
    spansBlock += `${ROOT_SELECTOR} .u-col-span-${i} { grid-column: span ${i} / span ${i} !important; box-sizing: border-box !important; }\n`;
  }
  spansBlock += `${ROOT_SELECTOR} .u-col-span-full { grid-column: 1 / -1 !important; }\n`;

  /* ── 3. Replace the generated block between sentinel comments ── */
  const START_MARKER = '/* STUDIO_SPANS_START */';
  const END_MARKER   = '/* STUDIO_SPANS_END */';

  const newBlock = `${START_MARKER}${spansBlock}${END_MARKER}`;

  if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
    content = content.replace(
      new RegExp(`${escapeRegex(START_MARKER)}[\\s\\S]*?${escapeRegex(END_MARKER)}`),
      newBlock
    );
  } else {
    // First run: insert after the .u-grid rule
    content = content.replace(
      /(:is\(#ybody, .y-canvas, \[data-ycode-canvas\]\)\s+\.u-grid\s*\{[^}]*\}\s*)/,
      `$1\n${newBlock}\n`
    );
  }

  /* ── 4. Inject / refresh Grid Outset + Break utilities ── */
  const OUTSET_START = '/* STUDIO_OUTSET_START */';
  const OUTSET_END   = '/* STUDIO_OUTSET_END */';

  const outsetBlock = `${OUTSET_START}
/* --- Grid Outset / Full-Bleed Utilities (Studio — generated) --- */

/* Déborde sur les deux gouttières */
${ROOT_SELECTOR} .u-grid-outset {
  margin-left: calc(var(--site--gutter) / -2) !important;
  margin-right: calc(var(--site--gutter) / -2) !important;
  width: calc(100% + var(--site--gutter)) !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Déborde uniquement à gauche */
${ROOT_SELECTOR} .u-grid-outset-left {
  margin-left: calc(var(--site--gutter) / -2) !important;
  width: calc(100% + (var(--site--gutter) / 2)) !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Déborde uniquement à droite */
${ROOT_SELECTOR} .u-grid-outset-right {
  margin-right: calc(var(--site--gutter) / -2) !important;
  width: calc(100% + (var(--site--gutter) / 2)) !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Déborde jusqu'au bord gauche de l'écran (sort de la marge site) */
${ROOT_SELECTOR} .u-break-left {
  margin-left: calc(var(--site--margin-fluid) * -1) !important;
  margin-right: 0 !important;
  width: calc(100% + var(--site--margin-fluid)) !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Déborde jusqu'au bord droit de l'écran (sort de la marge site) */
${ROOT_SELECTOR} .u-break-right {
  margin-right: calc(var(--site--margin-fluid) * -1) !important;
  margin-left: 0 !important;
  width: calc(100% + var(--site--margin-fluid)) !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Déborde des deux côtés (gauche + droite) jusqu'aux bords de l'écran */
${ROOT_SELECTOR} .u-break-full {
  margin-left: calc(var(--site--margin-fluid) * -1) !important;
  margin-right: calc(var(--site--margin-fluid) * -1) !important;
  width: calc(100% + var(--site--margin-fluid) * 2) !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Full-Bleed : s'étend jusqu'au bord du viewport (sort du container) */
${ROOT_SELECTOR} .u-full-bleed {
  margin-left: calc(50% - 50vw) !important;
  margin-right: calc(50% - 50vw) !important;
  width: 100vw !important;
  max-width: none !important;
  box-sizing: border-box !important;
}

/* Reset : annule tout break/outset */
${ROOT_SELECTOR} .u-break-none {
  margin-left: 0 !important;
  margin-right: 0 !important;
  width: 100% !important;
  max-width: revert !important;
}
${OUTSET_END}`;

  if (content.includes(OUTSET_START) && content.includes(OUTSET_END)) {
    content = content.replace(
      new RegExp(`${escapeRegex(OUTSET_START)}[\\s\\S]*?${escapeRegex(OUTSET_END)}`),
      outsetBlock
    );
  } else {
    // First run: insert after STUDIO_SPANS_END
    content = content.replace(
      `${END_MARKER}\n`,
      `${END_MARKER}\n\n${outsetBlock}\n`
    );
  }

  /* ── 5. Always regenerate the responsive block between sentinel comments ── */
  const RESP_START = '/* --- Responsive Breakpoints (Studio) --- */';
  const RESP_END   = '/* STUDIO_CORE_END */';

  // Build responsive col-span lines for a given CSS-escaped prefix
  const buildResponsiveSpans = (cssPrefix) => {
    const lines = [];
    for (let i = 1; i <= 12; i++) {
      lines.push(`  ${ROOT_SELECTOR} .${cssPrefix}u-col-span-${i} { grid-column: span ${i} / span ${i} !important; box-sizing: border-box !important; }`);
    }
    lines.push(`  ${ROOT_SELECTOR} .${cssPrefix}u-col-span-full { grid-column: 1 / -1 !important; }`);
    return lines.join('\n');
  };

  // Build responsive break/outset/full-bleed lines for a given CSS-escaped prefix
  const buildResponsiveBreaks = (cssPrefix) => `\
  ${ROOT_SELECTOR} .${cssPrefix}u-break-left  { margin-left: calc(var(--site--margin-fluid) * -1) !important; margin-right: 0 !important; width: calc(100% + var(--site--margin-fluid)) !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-break-right { margin-right: calc(var(--site--margin-fluid) * -1) !important; margin-left: 0 !important; width: calc(100% + var(--site--margin-fluid)) !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-break-full  { margin-left: calc(var(--site--margin-fluid) * -1) !important; margin-right: calc(var(--site--margin-fluid) * -1) !important; width: calc(100% + var(--site--margin-fluid) * 2) !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-grid-outset { margin-left: calc(var(--site--gutter) / -2) !important; margin-right: calc(var(--site--gutter) / -2) !important; width: calc(100% + var(--site--gutter)) !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-grid-outset-left  { margin-left: calc(var(--site--gutter) / -2) !important; width: calc(100% + (var(--site--gutter) / 2)) !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-grid-outset-right { margin-right: calc(var(--site--gutter) / -2) !important; width: calc(100% + (var(--site--gutter) / 2)) !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-full-bleed  { margin-left: calc(50% - 50vw) !important; margin-right: calc(50% - 50vw) !important; width: 100vw !important; max-width: none !important; box-sizing: border-box !important; }
  ${ROOT_SELECTOR} .${cssPrefix}u-break-none  { margin-left: 0 !important; margin-right: 0 !important; width: 100% !important; }`;

  const responsiveBlock = `${RESP_START}

/* Tablette + Mobile (≤ 1024px) : 8 colonnes + variantes responsives — cascade vers mobile */
@media screen and (max-width: 1024px) {
  ${ROOT_SELECTOR} { --site--column-count: 8 !important; }

  ${ROOT_SELECTOR} .u-grid {
    grid-template-columns: repeat(8, minmax(0, 1fr)) !important;
  }

  /* Clamp des spans trop larges (classes de base sans préfixe) */
  ${ROOT_SELECTOR} :is(
    .u-col-span-9, .u-col-span-10, .u-col-span-11, .u-col-span-12, .u-col-span-full
  ) { grid-column: span 8 / span 8 !important; }

  /* max-lg:u-col-span-* — natif Ycode Desktop-First */
${buildResponsiveSpans('max-lg\\:')}

  /* md:u-col-span-* — legacy mobile-first */
${buildResponsiveSpans('md\\:')}

  /* max-lg: break/outset — natif Ycode Desktop-First */
${buildResponsiveBreaks('max-lg\\:')}

  /* md: break/outset — legacy mobile-first */
${buildResponsiveBreaks('md\\:')}
}

/* Mobile (< 768px) : 4 colonnes + variantes responsives */
@media screen and (max-width: 767px) {
  ${ROOT_SELECTOR} { --site--column-count: 4 !important; }

  ${ROOT_SELECTOR} .u-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }

  /* Clamp des spans trop larges (classes de base sans préfixe) */
  ${ROOT_SELECTOR} :is(
    .u-col-span-4, .u-col-span-5, .u-col-span-6, .u-col-span-7,
    .u-col-span-8, .u-col-span-9, .u-col-span-10, .u-col-span-11,
    .u-col-span-12, .u-col-span-full
  ) { grid-column: span 4 / span 4 !important; }

  /* max-md:u-col-span-* — natif Ycode Desktop-First */
${buildResponsiveSpans('max-md\\:')}

  /* sm:u-col-span-* — legacy mobile-first */
${buildResponsiveSpans('sm\\:')}

  /* max-md: break/outset — natif Ycode Desktop-First */
${buildResponsiveBreaks('max-md\\:')}

  /* sm: break/outset — legacy mobile-first */
${buildResponsiveBreaks('sm\\:')}
}

`;

  if (content.includes(RESP_START)) {
    content = content.replace(
      new RegExp(`${escapeRegex(RESP_START)}[\\s\\S]*?(?=${escapeRegex(RESP_END)})`),
      responsiveBlock
    );
  } else {
    content = content.replace(RESP_END, `${responsiveBlock}${RESP_END}`);
  }

  /* ── 6. Ensure primary/secondary color scales in STUDIO_CORE ── */
  content = ensureColorScales(content);

  /* ── 7. Fix stale theme var refs + ensure theme defaults ── */
  content = fixThemeVars(content);

  /* ── 8. Ensure --space-0: 0px is in STUDIO_CORE ── */
  content = ensureSpaceZeroVar(content);

  /* ── 9. Regenerate runtime bridges ── */
  content = injectRuntimeBridges(content);

  /* ── 10. Write public + sync to app ── */
  fs.writeFileSync(publicThemePath, content, 'utf8');
  console.log('✅ public/global-theme.css updated');

  fs.copyFileSync(publicThemePath, appThemePath);
  console.log('✅ Synced → app/global-theme.css');
}

/* ── Canvas placeholder guard ── */
function guardCanvasPlaceholder() {
  if (!fs.existsSync(canvasUtilsPath)) return;

  let content = fs.readFileSync(canvasUtilsPath, 'utf8');

  // Remove old link tags if still present
  const oldLinkRe = /<link rel="stylesheet" href="\/global-theme\.css\?v=\$\{Date\.now\(\)\}">/g;
  if (oldLinkRe.test(content)) {
    content = content.replace(oldLinkRe, '');
    console.log('🚮 Removed legacy link tag from canvas-utils.ts');
  }

  if (!content.includes('id="studio-runtime-css"')) {
    content = content.replace('</head>', `${canvasStylePlaceholder}\n</head>`);
    fs.writeFileSync(canvasUtilsPath, content, 'utf8');
    console.log('✅ Patched canvas-utils.ts with Studio style placeholder');
  } else {
    console.log('✅ canvas-utils.ts already has Studio placeholder');
  }
}

/* ── Run ── */
generateAndInjectSpans();
guardCanvasPlaceholder();
