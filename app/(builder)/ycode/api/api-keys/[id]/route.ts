import { NextRequest } from 'next/server';
import { getApiKeyById, deleteApiKey, revokeApiKey } from '@/lib/repositories/apiKeyRepository';
import { noCache } from '@/lib/api-response';

// Disable caching for this route
export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /ycode/api/api-keys/[id]
 * Get a single API key by ID (internal endpoint)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const key = await getApiKeyById(id);

    if (!key) {
      return noCache(
        { error: 'API key not found' },
        404
      );
    }

    return noCache({
      data: key,
    });
  } catch (error) {
    console.error('Error fetching API key:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to fetch API key' },
      500
    );
  }
}

/**
 * PATCH /ycode/api/api-keys/[id]
 * Revoke an API key (sets revoked_at; row kept for audit).
 * Body: { action: 'revoke' }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    if (body?.action !== 'revoke') {
      return noCache({ error: "Unsupported action. Use { action: 'revoke' }" }, 400);
    }

    const existing = await getApiKeyById(id);
    if (!existing) {
      return noCache({ error: 'API key not found' }, 404);
    }

    const revoked = await revokeApiKey(id);
    return noCache({ data: revoked });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to revoke API key' },
      500
    );
  }
}

/**
 * DELETE /ycode/api/api-keys/[id]
 * Delete an API key (internal endpoint for settings UI)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify the key exists first
    const existing = await getApiKeyById(id);
    if (!existing) {
      return noCache(
        { error: 'API key not found' },
        404
      );
    }

    await deleteApiKey(id);

    return noCache({
      data: { deleted: true, id },
    });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to delete API key' },
      500
    );
  }
}
