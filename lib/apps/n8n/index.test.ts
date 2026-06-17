import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { N8NConnection } from '@/lib/apps/n8n/types';
import { testWebhook, sendToN8N, processN8NConnections } from '@/lib/apps/n8n/index';

interface Call { url: string; headers: Record<string, string>; body: string }

/** Install a fetch mock. `responder` returns a Response-like object or throws. */
function mockFetch(responder: (url: string) => unknown) {
  const calls: Call[] = [];
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers as Record<string, string>) ?? {}, body: String(init?.body ?? '') });
    return responder(String(url));
  }) as typeof fetch;
  return calls;
}

const httpRes = (status: number, body = '') =>
  ({ ok: status >= 200 && status < 300, status, text: async () => body });

const conn = (over: Partial<N8NConnection> = {}): N8NConnection =>
  ({ id: 'c1', name: 'Conn', formId: 'form-1', webhookUrl: 'https://hook/1', active: true, ...over });

// ── callWebhook (via testWebhook) ─────────────────────────────────────────────

test('testWebhook: 2xx with JSON {message} surfaces the message', async () => {
  mockFetch(() => httpRes(200, JSON.stringify({ message: 'pong' })));
  assert.deepEqual(await testWebhook('https://hook/x'), { ok: true, status: 200, message: 'pong' });
});

test('testWebhook: 2xx with non-JSON body → ok, message null', async () => {
  mockFetch(() => httpRes(200, 'OK'));
  assert.deepEqual(await testWebhook('https://hook/x'), { ok: true, status: 200, message: null });
});

test('testWebhook: non-2xx → ok false with HTTP message', async () => {
  mockFetch(() => httpRes(500));
  assert.deepEqual(await testWebhook('https://hook/x'), { ok: false, status: 500, message: 'HTTP 500 from webhook' });
});

test('testWebhook: AbortError → timeout', async () => {
  mockFetch(() => { throw new DOMException('aborted', 'AbortError'); });
  assert.deepEqual(await testWebhook('https://hook/x'), { ok: false, status: 0, error: 'timeout' });
});

test('testWebhook: network failure → unreachable', async () => {
  mockFetch(() => { throw new TypeError('failed to fetch'); });
  assert.deepEqual(await testWebhook('https://hook/x'), { ok: false, status: 0, error: 'unreachable' });
});

test('testWebhook: auth header sent only when both name and value present', async () => {
  let calls = mockFetch(() => httpRes(200));
  await testWebhook('https://hook/x', 'X-Key', 'secret');
  assert.equal(calls[0].headers['X-Key'], 'secret');

  calls = mockFetch(() => httpRes(200));
  await testWebhook('https://hook/x', 'X-Key'); // value missing
  assert.equal(calls[0].headers['X-Key'], undefined);
});

// ── sendToN8N (error mapping) ─────────────────────────────────────────────────

test('sendToN8N: maps failures to {ok:false,error}, success to {ok:true}', async () => {
  const payload = { formId: 'form-1', submissionId: 's1', submittedAt: 't', data: {} };
  mockFetch(() => httpRes(200));
  assert.deepEqual(await sendToN8N(conn(), payload), { ok: true });

  mockFetch(() => httpRes(502));
  assert.deepEqual(await sendToN8N(conn(), payload), { ok: false, error: 'HTTP 502 from webhook' });

  mockFetch(() => { throw new DOMException('x', 'AbortError'); });
  assert.deepEqual(await sendToN8N(conn(), payload), { ok: false, error: 'timeout' });
});

// ── processN8NConnections (routing) ───────────────────────────────────────────

test('processN8NConnections: fires only active connections for the matching form', async () => {
  const calls = mockFetch(() => httpRes(200));
  await processN8NConnections([
    conn({ id: 'a', webhookUrl: 'https://hook/a', active: true, formId: 'form-1' }),   // fires
    conn({ id: 'b', webhookUrl: 'https://hook/b', active: false, formId: 'form-1' }),  // inactive
    conn({ id: 'c', webhookUrl: 'https://hook/c', active: true, formId: 'form-2' }),   // other form
  ], 'form-1', 'sub-1', { email: 'a@b.c' });

  assert.deepEqual(calls.map(c => c.url), ['https://hook/a']);
  const sent = JSON.parse(calls[0].body);
  assert.equal(sent.formId, 'form-1');
  assert.equal(sent.submissionId, 'sub-1');
  assert.deepEqual(sent.data, { email: 'a@b.c' });
  assert.ok(typeof sent.submittedAt === 'string' && sent.submittedAt.length > 0);
});

test('processN8NConnections: no active match → no fetch at all', async () => {
  const calls = mockFetch(() => httpRes(200));
  await processN8NConnections([conn({ active: false })], 'form-1', 'sub-1', {});
  assert.equal(calls.length, 0);
});
