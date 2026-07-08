import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkApiRateLimit, rateLimitIdentity } from '@/lib/apiRateLimit';

// Each test uses a unique identity so buckets don't collide across tests.
let seq = 0;
const id = () => `test-${seq++}-${Date.now()}`;

test('allows up to the limit, then blocks', () => {
  process.env.API_RATE_LIMIT_PER_MIN = '3';
  const key = id();
  assert.equal(checkApiRateLimit(key).allowed, true); // 1
  assert.equal(checkApiRateLimit(key).allowed, true); // 2
  const third = checkApiRateLimit(key); // 3
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  const fourth = checkApiRateLimit(key); // 4 → blocked
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.remaining, 0);
  assert.ok(fourth.retryAfterSec > 0);
});

test('separate identities have independent buckets', () => {
  process.env.API_RATE_LIMIT_PER_MIN = '1';
  const a = id();
  const b = id();
  assert.equal(checkApiRateLimit(a).allowed, true);
  assert.equal(checkApiRateLimit(a).allowed, false);
  assert.equal(checkApiRateLimit(b).allowed, true); // unaffected by a
});

test('invalid env falls back to default (>1)', () => {
  delete process.env.API_RATE_LIMIT_PER_MIN;
  const r = checkApiRateLimit(id());
  assert.equal(r.allowed, true);
  assert.ok(r.limit >= 100); // default 120
});

test('rateLimitIdentity prefers bearer token over IP', () => {
  const req = new Request('https://x/', {
    headers: { authorization: 'Bearer abc123', 'x-forwarded-for': '1.2.3.4' },
  });
  assert.match(rateLimitIdentity(req), /^k:/);
});

test('rateLimitIdentity falls back to IP without bearer', () => {
  const req = new Request('https://x/', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } });
  assert.equal(rateLimitIdentity(req), 'ip:1.2.3.4');
});
