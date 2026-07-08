import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey as validateApiKeyFromRepo, type ApiKeyScope } from '@/lib/repositories/apiKeyRepository';
import { checkApiRateLimit, rateLimitIdentity } from '@/lib/apiRateLimit';

export interface ApiKeyValidation {
  valid: boolean;
  error?: string;
  status?: number; // HTTP status for the failure (401 auth, 403 scope, 429 rate limit). Default 401.
}

/** Read-only HTTP methods need 'read'; everything else needs 'write'. */
function requiredScopeForMethod(method: string): ApiKeyScope {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase()) ? 'read' : 'write';
}

/**
 * Validate API key from Authorization header
 * Expects: Authorization: Bearer <api_key>
 * 
 * The API key is hashed and compared against stored hashes in the api_keys table.
 * Updates last_used_at on successful validation.
 */
export async function validateApiKey(request: NextRequest): Promise<ApiKeyValidation> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    return { valid: false, error: 'Missing Authorization header' };
  }

  if (!authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Invalid Authorization format. Use: Bearer <api_key>' };
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!apiKey) {
    return { valid: false, error: 'API key is required' };
  }

  // Rate limit before touching the DB (sécu #3): blunts invalid-key floods and
  // enforces a per-key quota. Keyed by the bearer token, IP as fallback.
  const rate = checkApiRateLimit(rateLimitIdentity(request));
  if (!rate.allowed) {
    return {
      valid: false,
      status: 429,
      error: `Rate limit exceeded (${rate.limit}/min). Retry in ${rate.retryAfterSec}s.`,
    };
  }

  try {
    // Validate against api_keys table
    const key = await validateApiKeyFromRepo(apiKey);

    if (!key) {
      // Generic message (sécu #6): don't distinguish invalid / expired / revoked,
      // and don't leak DB configuration details.
      return { valid: false, error: 'Invalid, expired, or revoked API key' };
    }

    // Enforce scope for the HTTP method (sécu #1). Missing/empty scopes → deny writes.
    const required = requiredScopeForMethod(request.method);
    const scopes = key.scopes ?? [];
    if (!scopes.includes(required)) {
      return { valid: false, error: `API key lacks '${required}' scope`, status: 403 };
    }

    return { valid: true };
  } catch (error) {
    console.error('API key validation error:', error);
    return { valid: false, error: 'API key validation failed' };
  }
}

const STATUS_CODE: Record<number, string> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  429: 'RATE_LIMITED',
};

/**
 * Create an auth failure response (401 auth, 403 scope, 429 rate limit).
 */
export function unauthorizedResponse(message: string, status = 401): NextResponse {
  return NextResponse.json(
    { error: message, code: STATUS_CODE[status] ?? 'UNAUTHORIZED' },
    { status }
  );
}
