import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const globalsCssPath = path.join(rootDir, 'app', 'globals.css');
const canvasUtilsPath = path.join(rootDir, 'lib', 'canvas-utils.ts');

const globalsImportStatment = '@import "./global-theme.css";';
const canvasLinkStatement = '<link rel="stylesheet" href="/global-theme.css">';
const publicThemePath = path.join(rootDir, 'public', 'global-theme.css');
const appThemePath = path.join(rootDir, 'app', 'global-theme.css');

// Sync global-theme.css
if (fs.existsSync(publicThemePath)) {
  fs.copyFileSync(publicThemePath, appThemePath);
  console.log('✅ Synchronized public/global-theme.css to app/global-theme.css');
} else {
  console.error('❌ Could not find public/global-theme.css');
}
// Patch app/globals.css
if (fs.existsSync(globalsCssPath)) {
  let content = fs.readFileSync(globalsCssPath, 'utf8');
  if (!content.includes(globalsImportStatment)) {
    content = `${globalsImportStatment}\n${content}`;
    fs.writeFileSync(globalsCssPath, content, 'utf8');
    console.log('✅ Patched app/globals.css for Lumos Integration');
  } else {
    console.log('⚡ app/globals.css already patched for Lumos');
  }
} else {
  console.error('❌ Could not find app/globals.css');
}

// Patch lib/canvas-utils.ts
if (fs.existsSync(canvasUtilsPath)) {
  let content = fs.readFileSync(canvasUtilsPath, 'utf8');
  if (!content.includes(canvasLinkStatement)) {
    content = content.replace(
      '<link rel="stylesheet" href="/canvas.css?v=0.2.1.1">',
      `<link rel="stylesheet" href="/canvas.css?v=0.2.1.1">\n  ${canvasLinkStatement}`
    );
    fs.writeFileSync(canvasUtilsPath, content, 'utf8');
    console.log('✅ Patched lib/canvas-utils.ts for Lumos Integration');
  } else {
    console.log('⚡ lib/canvas-utils.ts already patched for Lumos');
  }
} else {
  console.error('❌ Could not find lib/canvas-utils.ts');
}
