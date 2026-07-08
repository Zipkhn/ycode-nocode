import type { Knex } from 'knex';

/**
 * Migration: API key lifecycle (P2 — sécu #2)
 *
 * Adds `expires_at` and `revoked_at` so a key can be time-boxed or revoked
 * without deleting the row (keeps an audit trail). Both nullable → existing
 * keys keep working (no expiry, not revoked).
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('expires_at');
    table.dropColumn('revoked_at');
  });
}
