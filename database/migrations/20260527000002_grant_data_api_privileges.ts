import type { Knex } from 'knex';

/**
 * Grant Data API (PostgREST / supabase-js) privileges on the public schema.
 *
 * As of May 30, 2026, new Supabase projects no longer auto-grant table
 * privileges to the anon / authenticated roles (the old ALTER DEFAULT
 * PRIVILEGES behavior is removed). Without this, a fresh Supabase project
 * running the migrations would create every table in `public` with no grants,
 * and supabase-js (anon key) would get "permission denied" on every table —
 * breaking the app on first install. GRANT is checked before RLS.
 *
 * This runs last (after all CREATE TABLE migrations) and:
 *  - grants on all existing tables/sequences (no-op on already-granted projects),
 *  - sets default privileges so every FUTURE migration is covered automatically.
 */

const ROLES = 'anon, authenticated, service_role';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`GRANT USAGE ON SCHEMA public TO ${ROLES}`);
  await knex.raw(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROLES}`);
  await knex.raw(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROLES}`);
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLES}`);
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${ROLES}`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM ${ROLES}`);
  await knex.raw(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM ${ROLES}`);
  await knex.raw(`REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM ${ROLES}`);
  await knex.raw(`REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM ${ROLES}`);
}
