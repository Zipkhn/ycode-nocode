import { NextResponse } from 'next/server';
import { loadCurrentTheme, writeThemeFile, saveStudioTheme } from '@/lib/studio-theme-store';
import { RESERVED_LOCAL_PROPS } from '@/lib/studio-css';
import type { CustomVarsConfig } from '@/components/Studio/utils/bridge-generators';

/**
 * Studio persistence — Supabase is the source of truth (see lib/studio-theme-store).
 * The on-disk global-theme.css is mirrored best-effort for local live-preview and
 * is a no-op on read-only serverless filesystems (Vercel).
 */

export async function GET() {
  try {
    const theme = await loadCurrentTheme();
    if (!Object.keys(theme.variables).length) {
      return NextResponse.json({ error: 'Studio core section not found' }, { status: 404 });
    }
    return NextResponse.json(theme);
  } catch (e) {
    console.error('Studio GET: failed to read theme', e);
    return NextResponse.json({ error: 'Failed to read theme' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { updates, bridges, customVarsConfig } = await request.json();

    // Merge deltas onto the current theme (Supabase-first, file fallback).
    const current = await loadCurrentTheme();
    const variables = { ...current.variables };
    if (updates && typeof updates === 'object') {
      for (const [key, value] of Object.entries(updates)) {
        // §14 utility-rule local aliases must never enter the token map (would
        // corrupt typographic levels at render — see RESERVED_LOCAL_PROPS).
        if (RESERVED_LOCAL_PROPS.has(key)) continue;
        if (value === '__remove__') delete variables[key];
        else variables[key] = String(value);
      }
    }
    const nextConfig = (customVarsConfig as CustomVarsConfig | undefined) ?? current.customVarsConfig;

    // Supabase is the source of truth.
    const saved = await saveStudioTheme(variables, nextConfig);

    // Best-effort file mirror for local live-preview; never fatal (read-only FS on Vercel).
    try { await writeThemeFile(updates, bridges, customVarsConfig as CustomVarsConfig | undefined); } catch { /* read-only FS */ }

    // Don't hard-fail when Supabase is absent (local-without-Supabase keeps working via file).
    return NextResponse.json(saved ? { success: true } : { success: true, persisted: 'file' });
  } catch (e) {
    console.error('Studio POST: failed to update theme', e);
    return NextResponse.json({ error: 'Failed to update theme' }, { status: 500 });
  }
}
