import type { Knex } from 'knex';

/**
 * Migration: enable Row Level Security on Knex's bookkeeping tables
 * (`migrations`, `migrations_lock`) — security fix.
 *
 * Knex auto-creates these two tables to track ran migrations and the lock flag.
 * They are created outside any migration file, so they never got RLS. Because
 * 20260527000002 GRANTs anon/authenticated SELECT/INSERT/UPDATE/DELETE on every
 * public table, both tables were fully readable/writable/deletable through the
 * anon key — Supabase flags them as `rls_disabled_in_public` (CRITICAL). Anyone
 * with the project URL could read migration history or corrupt the lock.
 *
 * Knex connects as the table owner (SUPABASE_CONNECTION_URL), and owners bypass
 * non-forced RLS, so migrations keep working. We enable RLS with NO policy
 * (anon/authenticated denied entirely) and revoke their grants as defense-in-depth.
 *
 * Idempotent: safe to run on already-deployed projects to remediate them.
 */
const TABLES = ['migrations', 'migrations_lock'];

export async function up(knex: Knex): Promise<void> {
  for (const t of TABLES) {
    if (!(await knex.schema.hasTable(t))) continue;
    await knex.schema.raw(`ALTER TABLE ?? ENABLE ROW LEVEL SECURITY`, [t]);
    await knex.schema.raw(`REVOKE ALL ON ?? FROM anon, authenticated`, [t]);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const t of TABLES) {
    if (!(await knex.schema.hasTable(t))) continue;
    await knex.schema.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ?? TO anon, authenticated`, [t]);
    await knex.schema.raw(`ALTER TABLE ?? DISABLE ROW LEVEL SECURITY`, [t]);
  }
}
