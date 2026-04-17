import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const publicThemePath = path.join(rootDir, 'public', 'global-theme.css');
const appThemePath    = path.join(rootDir, 'app',    'global-theme.css');
const canvasUtilsPath = path.join(rootDir, 'lib',    'canvas-utils.ts');

const canvasStylePlaceholder = `  <style id="lumos-runtime-css">
    /* Injected at runtime by Canvas.tsx to ensure priority and bypass caching */
  </style>`;

/**
 * Generate the u-col-span-* CSS and write it directly into public/global-theme.css
 * between the LUMOS_CORE_START and LUMOS_CORE_END markers.
 * No destructive regex — we simply replace the generated block each time.
 */
function generateAndInjectSpans() {
  if (!fs.existsSync(publicThemePath)) {
    console.error('❌ Could not find public/global-theme.css');
    return;
  }

  console.log('🛡️  Running Lumos CSS Guardian...');

  let content = fs.readFileSync(publicThemePath, 'utf8');

  /* ── 1. Build generated spans block ── */
  let spansBlock = '\n/* Grid Spans 1-12 (Lumos Native — generated) */\n';
  const ROOT_SELECTOR = ':is(#ybody, .y-canvas, [data-ycode-canvas])';
  for (let i = 1; i <= 12; i++) {
    spansBlock += `${ROOT_SELECTOR} .u-col-span-${i} { grid-column: span ${i} / span ${i} !important; box-sizing: border-box !important; }\n`;
  }
  spansBlock += `${ROOT_SELECTOR} .u-col-span-full { grid-column: 1 / -1 !important; }\n`;

  /* ── 2. Replace the generated block between sentinel comments ── */
  const START_MARKER = '/* LUMOS_SPANS_START */';
  const END_MARKER   = '/* LUMOS_SPANS_END */';

  const newBlock = `${START_MARKER}${spansBlock}${END_MARKER}`;

  if (content.includes(START_MARKER) && content.includes(END_MARKER)) {
    // Replace the existing block cleanly
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

  /* ── 3. Fix media queries — align breakpoints ── */
  // Remove any legacy one-liner @media column-count overrides (old format)
  content = content.replace(
    /@media\s+screen\s+and\s+\(max-width:\s*479px\)\s*\{\s*:root\s*\{[^}]*\}\s*\}/g,
    ''
  );

  // Always regenerate the responsive block between sentinel comments
  const RESP_START = '/* --- Responsive Breakpoints (Lumos) --- */';
  const RESP_END   = '/* LUMOS_CORE_END */';

  const responsiveBlock = `${RESP_START}

/* Tablette (768px - 991px) : 6 colonnes */
@media screen and (max-width: 991px) {
  ${ROOT_SELECTOR} { --site--column-count: 6 !important; }
  
  ${ROOT_SELECTOR} .u-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
  }

  ${ROOT_SELECTOR} :is(
    .u-col-span-6, 
    .u-col-span-7, 
    .u-col-span-8, 
    .u-col-span-9, 
    .u-col-span-10, 
    .u-col-span-11, 
    .u-col-span-12, 
    .u-col-span-full
  ) {
    grid-column: span 6 / span 6 !important;
  }
}

/* Mobile (< 768px) : 4 colonnes */
@media screen and (max-width: 767px) {
  ${ROOT_SELECTOR} { --site--column-count: 4 !important; }

  ${ROOT_SELECTOR} .u-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
  }

  /* Spans larges repliés sur 4/4 */
  ${ROOT_SELECTOR} :is(
    .u-col-span-4, 
    .u-col-span-5, 
    .u-col-span-6, 
    .u-col-span-7, 
    .u-col-span-8, 
    .u-col-span-9, 
    .u-col-span-10, 
    .u-col-span-11, 
    .u-col-span-12, 
    .u-col-span-full
  ) {
    grid-column: span 4 / span 4 !important;
    width: 100% !important;
  }
}

`;

  if (content.includes(RESP_START)) {
    // Replace everything from RESP_START up to (but not including) RESP_END
    content = content.replace(
      new RegExp(`${escapeRegex(RESP_START)}[\\s\\S]*?(?=${escapeRegex(RESP_END)})`),
      responsiveBlock
    );
  } else {
    content = content.replace(RESP_END, `${responsiveBlock}${RESP_END}`);
  }

  /* ── 4. Write public + sync to app ── */
  fs.writeFileSync(publicThemePath, content, 'utf8');
  console.log('✅ public/global-theme.css updated');

  fs.copyFileSync(publicThemePath, appThemePath);
  console.log('✅ Synced → app/global-theme.css');
}

/* ── Utility ── */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

  if (!content.includes('id="lumos-runtime-css"')) {
    content = content.replace('</head>', `${canvasStylePlaceholder}\n</head>`);
    fs.writeFileSync(canvasUtilsPath, content, 'utf8');
    console.log('✅ Patched canvas-utils.ts with Lumos style placeholder');
  } else {
    console.log('✅ canvas-utils.ts already has Lumos placeholder');
  }
}

/* ── Run ── */
generateAndInjectSpans();
guardCanvasPlaceholder();
