import { NextRequest } from 'next/server';
import { getAllApiKeys, createApiKey } from '@/lib/repositories/apiKeyRepository';
import { noCache } from '@/lib/api-response';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /ycode/api/api-keys
 * List all API keys (internal endpoint for settings UI)
 */
export async function GET() {
  try {
    const keys = await getAllApiKeys();

    return noCache({
      data: keys,
    });
  } catch (error) {
    console.error('Error fetching API keys:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to fetch API keys' },
      500
    );
  }
}

/**
 * POST /ycode/api/api-keys
 * Generate a new API key (internal endpoint for settings UI)
 * 
 * Request body:
 * {
 *   "name": "Production API Key"
 * }
 * 
 * Response:
 * {
 *   "data": {
 *     "id": "uuid",
 *     "name": "Production API Key",
 *     "key_prefix": "ycode_abc123",
 *     "api_key": "ycode_abc123...",  // Only shown once!
 *     "created_at": "..."
 *   }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, scopes, expires_at } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return noCache(
        { error: 'Name is required' },
        400
      );
    }

    // Optional scopes: subset of ['read','write'], defaults to both.
    const allowedScopes = ['read', 'write'] as const;
    const parsedScopes = Array.isArray(scopes)
      ? allowedScopes.filter((s) => scopes.includes(s))
      : undefined;

    // Optional expiry: ISO date string in the future.
    let expiresAt: string | null = null;
    if (typeof expires_at === 'string' && expires_at) {
      const ts = new Date(expires_at).getTime();
      if (Number.isNaN(ts)) {
        return noCache({ error: 'Invalid expires_at (expected ISO date)' }, 400);
      }
      if (ts <= Date.now()) {
        return noCache({ error: 'expires_at must be in the future' }, 400);
      }
      expiresAt = new Date(ts).toISOString();
    }

    const key = await createApiKey(name.trim(), parsedScopes, expiresAt);

    return noCache({
      data: key,
    }, 201);
  } catch (error) {
    console.error('Error creating API key:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to create API key' },
      500
    );
  }
}
