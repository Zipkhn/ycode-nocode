import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const THEME_PATH = path.join(process.cwd(), 'public', 'global-theme.css');
const APP_THEME_PATH = path.join(process.cwd(), 'app', 'global-theme.css');

export async function GET() {
  try {
    const css = await fs.readFile(THEME_PATH, 'utf-8');
    const startIdx = css.indexOf('/* STUDIO_CORE_START */');
    const endIdx = css.indexOf('/* STUDIO_CORE_END */');
    
    if (startIdx === -1 || endIdx === -1) {
      return NextResponse.json({ error: 'Studio core section not found' }, { status: 404 });
    }
    
    const coreSection = css.substring(startIdx, endIdx);
    
    const variables: Record<string, string> = {};
    const regex = /--([a-zA-Z0-9_-]+):\s*([^;]+);/g;
    let match;
    while ((match = regex.exec(coreSection)) !== null) {
      variables[match[1]] = match[2];
    }
    
    return NextResponse.json({ variables });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read theme file' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { updates, bridges } = await request.json();
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Invalid updates payload' }, { status: 400 });
    }

    let css = await fs.readFile(THEME_PATH, 'utf-8');
    
    // 1. Appliquer les mises à jour de variables
    for (const [key, value] of Object.entries(updates)) {
      if (value === '__remove__') {
        css = css.replace(new RegExp(`\\s*--${key}:[^;]+;`, 'g'), '');
      } else if (new RegExp(`--${key}:`).test(css)) {
        css = css.replace(new RegExp(`(--${key}:\\s*)([^;]+)(;)`, 'g'), `$1${value}$3`);
      } else {
        css = css.replace('/* STUDIO_CORE_END */', `:root {\n  --${key}: ${value};\n}\n/* STUDIO_CORE_END */`);
      }
    }

    // 2. Injecter les Bridges CSS de manière persistente pour la Production
    if (bridges && typeof bridges === 'string') {
      const bridgeStart = '/* STUDIO_RUNTIME_BRIDGES_START */';
      const bridgeEnd   = '/* STUDIO_RUNTIME_BRIDGES_END */';

      // Preserve the theme dark bridge (contains Ycode UUIDs — only set by Sync)
      // If the incoming bridges don't include it, carry it over from the existing section.
      let finalBridges = bridges;
      if (!bridges.includes('Studio Theme Dark Bridge')) {
        const existingMatch = css.match(
          new RegExp(`\\/\\* STUDIO_RUNTIME_BRIDGES_START \\*\\/([\\s\\S]*?)\\/\\* STUDIO_RUNTIME_BRIDGES_END \\*\\/`)
        );
        if (existingMatch) {
          const themeDarkMatch = existingMatch[1].match(
            /\/\* Studio Theme Dark Bridge \*\/[\s\S]*?\.u-theme-dark\s*\{[\s\S]*?\}/
          );
          if (themeDarkMatch) finalBridges = bridges + '\n\n' + themeDarkMatch[0];
        }
      }

      const bridgeBlock = `\n${bridgeStart}\n${finalBridges}\n${bridgeEnd}\n`;

      if (css.includes(bridgeStart) && css.includes(bridgeEnd)) {
        const startIdx = css.indexOf(bridgeStart);
        const endIdx = css.indexOf(bridgeEnd) + bridgeEnd.length;
        css = css.substring(0, startIdx) + bridgeBlock + css.substring(endIdx);
      } else {
        css = css.trimEnd() + '\n' + bridgeBlock;
      }
    }

    await fs.writeFile(THEME_PATH, css, 'utf-8');
    
    // Also copy to app folder to trigger Next.js native Hot Reloading for the builder interface
    try {
      await fs.writeFile(APP_THEME_PATH, css, 'utf-8');
    } catch(e) {
      // App theme might not exist or be accessible, that's fine
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update theme file' }, { status: 500 });
  }
}
