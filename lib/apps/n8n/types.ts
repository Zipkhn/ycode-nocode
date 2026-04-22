// =============================================================================
// N8N Integration Types
// =============================================================================

export interface N8NConnection {
  id: string;
  name: string;
  formId: string;
  webhookUrl: string;
  authHeaderName?: string;
  authHeaderValue?: string;
  active: boolean;
}

export interface N8NWebhookPayload {
  formId: string;
  submissionId: string;
  submittedAt: string;
  data: Record<string, unknown>;
}

export type N8NTestResult =
  | { ok: true; status: number; message: string | null }
  | { ok: false; status: number; message: string }
  | { ok: false; status: 0; error: 'timeout' | 'unreachable' };
