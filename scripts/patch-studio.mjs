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

  /* ── 6. Write public + sync to app ── */
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
