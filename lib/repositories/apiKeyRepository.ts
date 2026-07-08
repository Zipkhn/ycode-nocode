import { getSupabaseAdmin } from '@/lib/supabase-server';
import { createHash, randomBytes } from 'crypto';

/**
 * API Key Repository
 *
 * Handles CRUD operations for API keys used in the public v1 API.
 * Keys are stored as SHA-256 hashes for security.
 */

/** Permission scopes a key may hold. */
export type ApiKeyScope = 'read' | 'write';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: ApiKeyScope[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns safe to expose (never the hash). */
const PUBLIC_COLUMNS =
  'id, name, key_prefix, scopes, last_used_at, expires_at, revoked_at, created_at, updated_at';

export interface ApiKeyWithPlainKey extends ApiKey {
  api_key: string; // Only returned once during creation
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate a new API key
 * Format: 64 random hex chars
 */
function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Get all API keys (without hashes)
 */
export async function getAllApiKeys(): Promise<ApiKey[]> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await client
    .from('api_keys')
    .select(PUBLIC_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch API keys: ${error.message}`);
  }

  return data || [];
}

/**
 * Create a new API key
 * Returns the key info including the plain key (shown only once)
 */
export async function createApiKey(
  name: string,
  scopes: ApiKeyScope[] = ['read', 'write'],
  expiresAt?: string | null
): Promise<ApiKeyWithPlainKey> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase client not configured');
  }

  // Generate the key
  const apiKey = generateApiKey();
  const keyHash = hashApiKey(apiKey);
  const keyPrefix = apiKey.substring(0, 8); // First 8 chars for identification

  const { data, error } = await client
    .from('api_keys')
    .insert({
      name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: scopes.length > 0 ? scopes : ['read'],
      expires_at: expiresAt || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to create API key: ${error.message}`);
  }

  return {
    ...data,
    api_key: apiKey, // Return plain key only on creation
  };
}

/**
 * Delete an API key
 */
export async function deleteApiKey(id: string): Promise<void> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase client not configured');
  }

  const { error } = await client
    .from('api_keys')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete API key: ${error.message}`);
  }
}

/**
 * Validate an API key
 * Returns the key record if valid, null otherwise
 * Also updates last_used_at timestamp
 */
export async function validateApiKey(apiKey: string): Promise<ApiKey | null> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase client not configured');
  }

  const keyHash = hashApiKey(apiKey);

  // Find the key by hash
  const { data, error } = await client
    .from('api_keys')
    .select(PUBLIC_COLUMNS)
    .eq('key_hash', keyHash)
    .single();

  if (error || !data) {
    return null;
  }

  // Reject revoked or expired keys (sécu #2) — treated as invalid.
  if (data.revoked_at) {
    return null;
  }
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
    return null;
  }

  // Update last_used_at (fire and forget - don't wait for it)
  (async () => {
    try {
      await client
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);
    } catch (err) {
      console.error('Failed to update last_used_at:', err);
    }
  })();

  return data;
}

/**
 * Get an API key by ID (without hash)
 */
export async function getApiKeyById(id: string): Promise<ApiKey | null> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await client
    .from('api_keys')
    .select(PUBLIC_COLUMNS)
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to fetch API key: ${error.message}`);
  }

  return data;
}

/**
 * Revoke an API key (sécu #2). Sets `revoked_at`; the row is kept for audit.
 * A revoked key is rejected by validateApiKey.
 */
export async function revokeApiKey(id: string): Promise<ApiKey | null> {
  const client = await getSupabaseAdmin();

  if (!client) {
    throw new Error('Supabase client not configured');
  }

  const { data, error } = await client
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(PUBLIC_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to revoke API key: ${error.message}`);
  }

  return data;
}
