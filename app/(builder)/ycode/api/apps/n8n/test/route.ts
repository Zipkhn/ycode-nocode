import { NextRequest } from 'next/server';
import { testWebhook } from '@/lib/apps/n8n';
import { noCache } from '@/lib/api-response';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * POST /ycode/api/apps/n8n/test
 * Test an N8N webhook URL from the server side (avoids CORS issues).
 *
 * Body: { webhookUrl: string; authHeaderName?: string; authHeaderValue?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { webhookUrl, authHeaderName, authHeaderValue } = body;

    if (!webhookUrl || typeof webhookUrl !== 'string') {
      return noCache({ error: 'webhookUrl is required' }, 400);
    }

    const result = await testWebhook(webhookUrl, authHeaderName, authHeaderValue);

    return noCache({ data: result });
  } catch (error) {
    console.error('[N8N test] Unexpected error:', error);
    return noCache(
      { error: error instanceof Error ? error.message : 'Failed to test webhook' },
      500
    );
  }
}
