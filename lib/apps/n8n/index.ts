import type { N8NConnection, N8NWebhookPayload, N8NTestResult } from './types';

const TIMEOUT_MS = 5000;

/**
 * Fire a single N8N webhook and return a structured result.
 * Never throws — caller always gets a typed result.
 */
export async function sendToN8N(
  connection: N8NConnection,
  payload: N8NWebhookPayload
): Promise<{ ok: boolean; error?: string }> {
  const result = await callWebhook(connection.webhookUrl, payload, {
    headerName: connection.authHeaderName,
    headerValue: connection.authHeaderValue,
  });

  if (!result.ok) {
    return { ok: false, error: 'error' in result ? result.error : result.message };
  }
  return { ok: true };
}

/**
 * Test a webhook URL (used by the /test API route).
 * Sends a synthetic ping payload so the user can validate connectivity.
 */
export async function testWebhook(
  webhookUrl: string,
  authHeaderName?: string,
  authHeaderValue?: string
): Promise<N8NTestResult> {
  return callWebhook(
    webhookUrl,
    { formId: '__test__', submissionId: '__test__', submittedAt: new Date().toISOString(), data: { test: true } },
    { headerName: authHeaderName, headerValue: authHeaderValue }
  );
}

// =============================================================================
// Internal
// =============================================================================

async function callWebhook(
  url: string,
  body: N8NWebhookPayload,
  auth: { headerName?: string; headerValue?: string }
): Promise<N8NTestResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.headerName && auth.headerValue) {
      headers[auth.headerName] = auth.headerValue;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      return { ok: false, status: response.status, message: `HTTP ${response.status} from webhook` };
    }

    // Try to parse a human-readable message from the response body
    let message: string | null = null;
    try {
      const text = await response.text();
      if (text) {
        const json = JSON.parse(text);
        if (typeof json?.message === 'string') message = json.message;
      }
    } catch {
      // non-JSON body is fine
    }

    return { ok: true, status: response.status, message };
  } catch (err) {
    clearTimeout(timer);

    if (err instanceof DOMException && err.name === 'AbortError') {
      return { ok: false, status: 0, error: 'timeout' };
    }
    return { ok: false, status: 0, error: 'unreachable' };
  }
}

/**
 * Process all active N8N connections for a form submission.
 * Fire-and-forget: errors are logged, never thrown.
 */
export async function processN8NConnections(
  connections: N8NConnection[],
  formId: string,
  submissionId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const active = connections.filter((c) => c.active && c.formId === formId);
  if (active.length === 0) return;

  const webhookPayload: N8NWebhookPayload = {
    formId,
    submissionId,
    submittedAt: new Date().toISOString(),
    data: payload,
  };

  const results = await Promise.allSettled(
    active.map((c) => sendToN8N(c, webhookPayload))
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const c = active[i];
    if (r.status === 'fulfilled') {
      if (!r.value.ok) {
        console.error(`[N8N] "${c.name}" (form: ${formId}):`, r.value.error);
      }
    } else {
      console.error(`[N8N] "${c.name}" (form: ${formId}):`, r.reason);
    }
  }
}
