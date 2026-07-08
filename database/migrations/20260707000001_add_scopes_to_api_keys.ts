import type { Knex } from 'knex';

/**
 * Migration: Add scopes to API Keys (amélioration #2 / sécu #1)
 *
 * Adds a `scopes` text[] column so a key can be limited to 'read' and/or 'write'.
 * Existing keys default to both scopes → no behavioural change for current keys.
 */

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table
      .specificType('scopes', 'text[]')
      .notNullable()
      .defaultTo(knex.raw(`ARRAY['read','write']::text[]`));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (table) => {
    table.dropColumn('scopes');
  });
}
