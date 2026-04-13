import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const THEME_PATH = path.join(process.cwd(), 'public', 'global-theme.css');
const APP_THEME_PATH = path.join(process.cwd(), 'app', 'global-theme.css');

export async function GET() {
  try {
    const css = await fs.readFile(THEME_PATH, 'utf-8');
    const startIdx = css.indexOf('/* LUMOS_CORE_START */');
    const endIdx = css.indexOf('/* LUMOS_CORE_END */');
    
    if (startIdx === -1 || endIdx === -1) {
      return NextResponse.json({ error: 'Lumos core section not found' }, { status: 404 });
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
    const { updates } = await request.json();
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'Invalid updates payload' }, { status: 400 });
    }

    let css = await fs.readFile(THEME_PATH, 'utf-8');
    
    for (const [key, value] of Object.entries(updates)) {
      // Safely replace the variable value.
      // E.g. --site--viewport-max: 90;
      const regex = new RegExp(`(--${key}:\\s*)([^;]+)(;)`, 'g');
      css = css.replace(regex, `$1${value}$3`);
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
