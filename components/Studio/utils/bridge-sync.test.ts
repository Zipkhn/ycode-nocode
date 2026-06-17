import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBridgeCustomCss, syncBridgesToCustomCss } from '@/components/Studio/utils/bridge-sync';

const VARS = { 'space-m': '1rem', 'h1-font-weight': '700' };
const BRIDGES = '/* bridge */ :root{--space-1:4px}';
const START = '/* STUDIO_RUNTIME_BRIDGES_START */';
const END   = '/* STUDIO_RUNTIME_BRIDGES_END */';

interface MockRes { ok: boolean; status: number; data?: string }

/** Build a fetch mock: GET returns `get`, PUT records its body and returns `put`. */
function mockFetch(get: MockRes, put: MockRes = { ok: true, status: 200 }) {
  const calls: { method: string; body?: string }[] = [];
  const fn = async (_url: string, init?: { method?: string; body?: string }) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, body: init?.body });
    const r = method === 'GET' ? get : put;
    return { ok: r.ok, status: r.status, json: async () => ({ data: r.data }) };
  };
  return { fn: fn as unknown as typeof fetch, calls };
}

const putBody = (calls: { method: string; body?: string }[]) =>
  JSON.parse(calls.find(c => c.method === 'PUT')!.body!).value as string;

// ── buildBridgeCustomCss (pure) ──────────────────────────────────────────────

test('build: appends block when no markers present', () => {
  const out = buildBridgeCustomCss('.user{color:red}', VARS, BRIDGES);
  assert.ok(out.startsWith('.user{color:red}'));
  assert.ok(out.includes(START) && out.includes(END));
  assert.ok(out.includes('--space-m: 1rem'));
  assert.ok(out.includes(BRIDGES));
});

test('build: replaces existing block, preserves surrounding CSS, idempotent', () => {
  const base = `.a{}\n${START}\nOLD\n${END}\n.b{}`;
  const once  = buildBridgeCustomCss(base, VARS, BRIDGES);
  const twice = buildBridgeCustomCss(once, VARS, BRIDGES);
  assert.ok(once.includes('.a{}') && once.includes('.b{}'));
  assert.ok(!once.includes('OLD'));
  assert.equal(once.match(new RegExp(START.replace(/[.*/]/g, '\\$&'), 'g'))!.length, 1);
  assert.equal(once, twice); // byte-identical on re-sync — no blank-line drift
});

// ── syncBridgesToCustomCss (fetch branches) ──────────────────────────────────

test('sync: 404 (fresh project) writes block from empty base', async () => {
  const { fn, calls } = mockFetch({ ok: false, status: 404 });
  await syncBridgesToCustomCss(VARS, BRIDGES, fn);
  assert.ok(calls.some(c => c.method === 'PUT'));
  assert.ok(putBody(calls).includes(START));
});

test('sync: existing CSS is preserved and block merged', async () => {
  const { fn, calls } = mockFetch({ ok: true, status: 200, data: '.keep{color:blue}' });
  await syncBridgesToCustomCss(VARS, BRIDGES, fn);
  assert.ok(putBody(calls).includes('.keep{color:blue}'));
});

test('sync: GET 500 throws and never PUTs (no clobber)', async () => {
  const { fn, calls } = mockFetch({ ok: false, status: 500 });
  await assert.rejects(syncBridgesToCustomCss(VARS, BRIDGES, fn), /GET custom_css 500/);
  assert.ok(!calls.some(c => c.method === 'PUT'));
});

test('sync: PUT failure throws', async () => {
  const { fn } = mockFetch({ ok: true, status: 200, data: '' }, { ok: false, status: 503 });
  await assert.rejects(syncBridgesToCustomCss(VARS, BRIDGES, fn), /PUT custom_css 503/);
});
