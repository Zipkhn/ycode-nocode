import fs from 'fs/promises';
import path from 'path';
import { getSupabaseAdmin } from './supabase-server';
import type { CustomVarsConfig } from '@/components/Studio/utils/bridge-generators';
import {
  applyStudioMutations,
  parseStudioVariablesFromCss,
  parseCustomVarsConfig,
  DEFAULT_CUSTOM_VARS_CONFIG,
  type StudioThemeData,
} from './studio-css';

export type { StudioThemeData };

/**
 * Studio theme persistence & IO (Phase 1 + 2).
 *
 * Supabase is the source of truth (singleton row id = 1). The committed
 * global-theme.css is read as the static base skeleton and mirrored best-effort
 * for local live-preview; writes no-op on read-only serverless filesystems (Vercel).
 */

const TABLE = 'studio_theme';

export const THEME_PATH = path.join(process.cwd(), 'public', 'global-theme.css');
export const APP_THEME_PATH = path.join(process.cwd(), 'app', 'global-theme.css');

// ── Supabase (source of truth) ──────────────────────────────────────────────────

/** Read the theme from the DB. Returns null when Supabase is unavailable or empty. */
export async function loadStudioTheme(): Promise<StudioThemeData | null> {
  const db = await getSupabaseAdmin();
  if (!db) return null;

  const { data, error } = await db
    .from(TABLE)
    .select('variables, custom_vars_config')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return null;

  return {
    variables: (data.variables as Record<string, string>) ?? {},
    customVarsConfig: (data.custom_vars_config as CustomVarsConfig | null) ?? null,
  };
}

/** Upsert the singleton theme row. Returns false when Supabase is unavailable. */
export async function saveStudioTheme(
  variables: Record<string, string>,
  customVarsConfig: CustomVarsConfig | null,
): Promise<boolean> {
  const db = await getSupabaseAdmin();
  if (!db) return false;

  const { error } = await db.from(TABLE).upsert(
    {
      id: 1,
      variables,
      custom_vars_config: customVarsConfig ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  return !error;
}

// ── File access (static base + local mirror) ────────────────────────────────────

/** Read the committed base CSS (static skeleton + markers). FS-safe on Vercel when traced. */
export async function readBaseCss(): Promise<string | null> {
  try { return await fs.readFile(THEME_PATH, 'utf-8'); }
  catch {
    try { return await fs.readFile(APP_THEME_PATH, 'utf-8'); }
    catch { return null; }
  }
}

/** Parse {variables, customVarsConfig} from the on-disk CSS (seed/fallback source). */
export async function readThemeFromFile(): Promise<StudioThemeData | null> {
  const css = await readBaseCss();
  if (!css) return null;
  const variables = parseStudioVariablesFromCss(css);
  if (!variables) return null;
  return { variables, customVarsConfig: parseCustomVarsConfig(css) };
}

/**
 * Load the current theme — Supabase is authoritative; on a fresh DB (or when
 * Supabase is unavailable) fall back to the on-disk file and seed the table.
 */
export async function loadCurrentTheme(): Promise<StudioThemeData> {
  const db = await loadStudioTheme();
  if (db) return { variables: db.variables, customVarsConfig: db.customVarsConfig ?? DEFAULT_CUSTOM_VARS_CONFIG };

  const file = await readThemeFromFile();
  if (file) {
    await saveStudioTheme(file.variables, file.customVarsConfig).catch(() => {});
    return file;
  }
  return { variables: {}, customVarsConfig: DEFAULT_CUSTOM_VARS_CONFIG };
}

/**
 * Best-effort mirror of the theme to the on-disk CSS file (local live-preview).
 * No-ops silently on a read-only FS (Vercel) — Supabase remains the source of truth.
 */
export async function writeThemeFile(
  updates: Record<string, unknown> | undefined,
  bridges: string | undefined,
  customVarsConfig: CustomVarsConfig | undefined,
): Promise<void> {
  const baseCss = await fs.readFile(THEME_PATH, 'utf-8');
  const css = applyStudioMutations(baseCss, updates, bridges, customVarsConfig);

  // Integrity check — never write a file that lost its core markers.
  if (!css.includes('/* STUDIO_CORE_START */') || !css.includes('/* STUDIO_CORE_END */')) return;
  if (css === baseCss) return;

  await fs.writeFile(THEME_PATH, css, 'utf-8');
  try { await fs.writeFile(APP_THEME_PATH, css, 'utf-8'); } catch { /* ok */ }
}
