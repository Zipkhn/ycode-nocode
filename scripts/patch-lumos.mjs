import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const globalsCssPath = path.join(rootDir, 'app', 'globals.css');
const canvasUtilsPath = path.join(rootDir, 'lib', 'canvas-utils.ts');
const publicThemePath = path.join(rootDir, 'public', 'global-theme.css');
const appThemePath = path.join(rootDir, 'app', 'global-theme.css');

const globalsImportStatement = '@import "./global-theme.css";';
const canvasStylePlaceholder = `  <style id="lumos-runtime-css">
    /* Injected at runtime by Canvas.tsx to ensure priority and bypass caching */
  </style>`;

/**
 * GUARDIAN LOGIC: Heal public/global-theme.css to ensure Sur-Spécificité
 */
function healGlobalTheme() {
  if (!fs.existsSync(publicThemePath)) {
    console.error('❌ Could not find public/global-theme.css');
    return;
  }

  let content = fs.readFileSync(publicThemePath, 'utf8');
  let originalContent = content;

  console.log('🛡️  Running Lumos CSS Guardian...');

  // 1. Ensure Doubled IDs for Utilitates
  // First, collapse any multiple occurrences back to single
  content = content.replace(/(#ybody){2,}/g, '#ybody');
  content = content.replace(/(\[data-ycode-canvas\]){2,}/g, '[data-ycode-canvas]');
  
  // Then apply doubling for the specific classes we want to boost
  // We only boost classes starting with .u-
  content = content.replace(/#ybody\s+\.u-/g, '#ybody#ybody .u-');
  content = content.replace(/\[data-ycode-canvas\]\s+\.u-/g, '[data-ycode-canvas][data-ycode-canvas] .u-');

  // 2. Ensure Base Tag Neutralization
  // First, remove any existing :not() selectors to avoid doubling up
  content = content.replace(/:not\(\[class\*="u-text-"\]\)/g, '');
  
  // Then re-apply to heading/paragraph resets in the transition section
  const tags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'];
  tags.forEach(tag => {
    const tagRegex = new RegExp(`(?<=:is\\(#ybody,.*\\)\\s+)${tag}`, 'g');
    content = content.replace(tagRegex, `${tag}:not([class*="u-text-"])`);
  });

  // 3. Ensure Grid Stabilization
  if (!content.includes('.u-grid')) {
      console.warn('⚠️  .u-grid not found in CSS, skipping grid healing');
  } else {
      // Ensure width: 100% !important and gaps are present
      if (!content.includes('width: 100% !important')) {
          content = content.replace(/\.u-grid\s*\{([^}]*)\}/, (match, p1) => {
              if (p1.includes('width: 100% !important')) return match;
              return `.u-grid {${p1.trim()}\n  width: 100% !important;\n}`;
          });
      }
  }

  // 4. Mobile Stacking Check (767px)
  if (!content.includes('max-width: 767px')) {
      const mobileStacking = `
@media (max-width: 767px) {
  #ybody#ybody .u-grid { grid-template-columns: 1fr !important; }
  #ybody#ybody [class*="u-col-span-"] { grid-column: span 1 / span 1 !important; }
}`;
      content = content.replace('/* LUMOS_CORE_END */', `${mobileStacking}\n\n/* LUMOS_CORE_END */`);
  }

  if (content !== originalContent) {
    fs.writeFileSync(publicThemePath, content, 'utf8');
    console.log('✅ Healed public/global-theme.css with Sur-Spécificité rules');
  } else {
    console.log('✅ public/global-theme.css is already healthy');
  }

  // Sync to app
  fs.copyFileSync(publicThemePath, appThemePath);
  console.log('✅ Synchronized healed theme to app/global-theme.css');
}

// 1. Run CSS Guardian
healGlobalTheme();

// 2. Patch app/globals.css
if (fs.existsSync(globalsCssPath)) {
  let content = fs.readFileSync(globalsCssPath, 'utf8');
  if (!content.includes(globalsImportStatement)) {
    content = `${content.trim()}\n\n${globalsImportStatement}\n`;
    fs.writeFileSync(globalsCssPath, content, 'utf8');
    console.log('✅ Patched app/globals.css for Lumos Integration');
  }
}

// 3. Patch lib/canvas-utils.ts (placeholder guard)
if (fs.existsSync(canvasUtilsPath)) {
  let content = fs.readFileSync(canvasUtilsPath, 'utf8');
  
  // Clean up any old link tags if they exist
  const oldLinkRegex = /<link rel="stylesheet" href="\/global-theme\.css\?v=\$\{Date\.now\(\)\}">/g;
  if (oldLinkRegex.test(content)) {
    content = content.replace(oldLinkRegex, '');
    console.log('🚮 Removed legacy global-theme link from canvas-utils.ts');
  }

  // Ensure placeholder exists
  if (!content.includes('id="lumos-runtime-css"')) {
    content = content.replace(
      '</head>',
      `${canvasStylePlaceholder}\n</head>`
    );
    fs.writeFileSync(canvasUtilsPath, content, 'utf8');
    console.log('✅ Patched lib/canvas-utils.ts with Lumos style placeholder');
  } else {
    console.log('✅ lib/canvas-utils.ts already has Lumos placeholder');
  }
}
