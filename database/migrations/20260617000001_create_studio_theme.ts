import type { Knex } from 'knex';
import fs from 'fs/promises';
import path from 'path';

/**
 * Migration: Studio theme persistence in the database (Phase 1).
 *
 * The Studio (fork-only design system) historically read/wrote its variables to
 * `public/global-theme.css` on disk at runtime. That breaks on read-only serverless
 * filesystems (e.g. Vercel). This table makes Supabase the source of truth.
 *
 * Singleton row (id = 1, enforced by CHECK) holding:
 *  - variables:           the Studio-managed CSS custom properties (token map)
 *  - custom_vars_config:  the custom variables × modes config (Figma-style table)
 *
 * Grants are covered by the schema default privileges set in
 * 20260527000002_grant_data_api_privileges (runs before this). Accessed only via
 * the service-role client server-side.
 *
 * Best-effort seed: parses the committed global-theme.css at migrate-time so a
 * fresh deploy already has the design system in the DB. Never fails the migration.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    CREATE TABLE IF NOT EXISTS studio_theme (
      id                 smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      variables          jsonb       NOT NULL DEFAULT '{}'::jsonb,
      custom_vars_config jsonb,
      updated_at         timestamptz NOT NULL DEFAULT now()
    )
  `);

  try {
    const css = await fs.readFile(path.join(process.cwd(), 'public', 'global-theme.css'), 'utf-8');
    const s = css.indexOf('/* STUDIO_CORE_START */');
    const e = css.indexOf('/* STUDIO_CORE_END */');
    if (s === -1 || e === -1) return;

    const core = css.substring(s, e);
    const variables: Record<string, string> = {};
    const re = /--([a-zA-Z0-9_-]+):\s*([^;]+);/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(core)) !== null) {
      if (m[2].includes('!important')) continue; // skip scoped/responsive overrides
      variables[m[1]] = m[2];
    }

    let customVarsConfig: unknown = null;
    const cs = css.indexOf('/* STUDIO_CUSTOM_VARS_START */');
    const ce = css.indexOf('/* STUDIO_CUSTOM_VARS_END */');
    if (cs !== -1 && ce !== -1) {
      const cm = css.substring(cs, ce).match(/\/\* CONFIG: (.+) \*\//);
      if (cm) { try { customVarsConfig = JSON.parse(cm[1]); } catch { /* ignore malformed */ } }
    }

    await knex('studio_theme')
      .insert({ id: 1, variables, custom_vars_config: customVarsConfig })
      .onConflict('id')
      .ignore();
  } catch {
    /* file unavailable at migrate-time — table stays empty, seeded on first GET */
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP TABLE IF EXISTS studio_theme');
}
