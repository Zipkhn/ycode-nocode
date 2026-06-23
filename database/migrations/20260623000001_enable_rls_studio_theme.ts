import type { Knex } from 'knex';

/**
 * Migration: enable Row Level Security on studio_theme (security fix).
 *
 * studio_theme was created (20260617000001) without RLS. Because
 * 20260527000002 sets ALTER DEFAULT PRIVILEGES granting anon/authenticated
 * SELECT/INSERT/UPDATE/DELETE on every future public table, this singleton was
 * fully readable/writable/deletable through the anon key — Supabase flags it as
 * `rls_disabled_in_public` (CRITICAL).
 *
 * The table is only ever accessed server-side via the service-role client
 * (lib/studio-theme-store.ts → getSupabaseAdmin), and service_role bypasses RLS.
 * So we enable RLS with NO permissive policy: anon/authenticated are denied
 * entirely, the app keeps working. Grants are also revoked from those roles as
 * defense-in-depth.
 *
 * Idempotent: safe to run on already-deployed projects to remediate them.
 */
export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('studio_theme');
  if (!exists) return;

  await knex.schema.raw('ALTER TABLE studio_theme ENABLE ROW LEVEL SECURITY');
  await knex.schema.raw('REVOKE ALL ON studio_theme FROM anon, authenticated');
}

export async function down(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('studio_theme');
  if (!exists) return;

  await knex.schema.raw('GRANT SELECT, INSERT, UPDATE, DELETE ON studio_theme TO anon, authenticated');
  await knex.schema.raw('ALTER TABLE studio_theme DISABLE ROW LEVEL SECURITY');
}
