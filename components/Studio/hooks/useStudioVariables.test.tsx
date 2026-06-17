import 'global-jsdom/register'; // must run before react-dom loads — sets up document/window
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useStudioVariables } from '@/components/Studio/hooks/useStudioVariables';

const LEVELS = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'large', 'body', 'small'];

// Fully-populated vars so the load effect adds no defaults (→ no stray POST).
function fullVars(): Record<string, string> {
  const v: Record<string, string> = {};
  for (const l of LEVELS) {
    v[`${l}-font-weight`] = '600';
    v[`${l}-letter-spacing`] = '0em';
    v[`${l}-margin-bottom`] = '0rem';
    v[`${l}-line-height`] = '1.5';
  }
  return Object.assign(v, {
    'radius--small': '0.5rem', 'radius--main': '1rem', 'radius--round': '9999px',
    'border-width--main': '0.094rem',
    'theme-light--background-2': '#f5f5f5', 'theme-dark--background-2': '#2a2a2a',
  });
}

const res = (status: number, json: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => json, text: async () => '' }) as Response;

let log: string[] = [];
let postOk = true;

/** Reset state + install a controllable fetch that logs the save round-trips. */
function setup() {
  log = [];
  postOk = true;
  global.fetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.startsWith('/global-theme.css')) return res(200, {}); // triggerIframeCSSReload
    if (u === '/api/studio' && method === 'GET') return res(200, { variables: fullVars() });
    if (u === '/api/studio' && method === 'POST') {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      log.push(`POST /api/studio ${Object.keys(body.updates || {})[0] ?? '?'}`);
      return postOk ? res(200, { ok: true }) : res(500, {});
    }
    if (u.includes('custom_css') && method === 'GET') { log.push('GET custom_css'); return res(200, { data: '' }); }
    if (u.includes('custom_css') && method === 'PUT') { log.push('PUT custom_css'); return res(200, {}); }
    return res(200, {});
  }) as typeof fetch;
}

/** Render the hook past its initial load and let the mount bridge-sync settle. */
async function renderReady() {
  const view = renderHook(() => useStudioVariables());
  await waitFor(() => assert.equal(view.result.current.loading, false));
  await waitFor(() => assert.ok(log.includes('PUT custom_css'))); // mount sync done
  log = [];
  return view;
}

// ── #2: POST /api/studio failure is no longer silent ─────────────────────────

test('save: failed canvas POST surfaces status="error", success ends "done"', async (t) => {
  t.after(cleanup);
  setup();
  const { result } = await renderReady();

  await act(async () => { await result.current.saveUpdates({ 'h1-font-weight': '700' }); });
  assert.equal(result.current.status, 'done');

  postOk = false;
  await act(async () => { await result.current.saveUpdates({ 'h1-font-weight': '300' }); });
  assert.equal(result.current.status, 'error');
});

// ── #3: concurrent saves are serialized (no custom_css read-modify-write race) ─

test('saves are serialized — round-trips never interleave', async (t) => {
  t.after(cleanup);
  setup();
  const { result } = await renderReady();

  await act(async () => {
    const p1 = result.current.saveUpdates({ a: '1' });
    const p2 = result.current.saveUpdates({ b: '2' });
    await Promise.all([p1, p2]);
  });

  // Serialized → two complete, contiguous triples. Interleaved would be POST,POST,GET,GET,…
  assert.deepEqual(log, [
    'POST /api/studio a', 'GET custom_css', 'PUT custom_css',
    'POST /api/studio b', 'GET custom_css', 'PUT custom_css',
  ]);
});

// ── #1: debounced edit path surfaces failures (was swallowed before) ──────────

test('debounced setVar surfaces a failing save as status="error"', async (t) => {
  t.after(cleanup);
  setup();
  const { result } = await renderReady();

  postOk = false;
  await act(async () => { result.current.setVar('h1-font-weight', '300'); });
  await waitFor(() => assert.equal(result.current.status, 'error'), { timeout: 2000 });
});
