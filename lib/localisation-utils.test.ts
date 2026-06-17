import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOCALES, getLocaleByCode, isLocaleCodeSupported, isLocaleRtl,
} from '@/lib/localisation-utils';

// ── LOCALES data integrity ────────────────────────────────────────────────────

test('LOCALES: codes are unique (a duplicate would shadow a lookup)', () => {
  const codes = LOCALES.map(l => l.code);
  const dupes = [...new Set(codes.filter((c, i) => codes.indexOf(c) !== i))];
  assert.deepEqual(dupes, [], `duplicate locale codes: ${dupes.join(', ')}`);
});

test('LOCALES: every entry has a lowercase code and a non-empty label', () => {
  for (const l of LOCALES) {
    assert.equal(l.code, l.code.toLowerCase(), `code not lowercase: ${l.code}`);
    assert.ok(l.label && l.label.trim(), `missing label for: ${l.code}`);
  }
});

// ── Lookups ───────────────────────────────────────────────────────────────────

test('getLocaleByCode / isLocaleCodeSupported agree and reject unknowns', () => {
  assert.equal(getLocaleByCode('fr')?.label, 'French');
  assert.equal(getLocaleByCode('en-us')?.label, 'English (United States)');
  assert.equal(getLocaleByCode('zz'), undefined);
  assert.equal(isLocaleCodeSupported('fr'), true);
  assert.equal(isLocaleCodeSupported('zz'), false);
  assert.equal(isLocaleCodeSupported('FR'), false); // case-sensitive: stored codes are lowercase
});

// ── RTL ───────────────────────────────────────────────────────────────────────

test('isLocaleRtl: true for RTL scripts, false otherwise', () => {
  for (const code of ['ar', 'he', 'fa', 'ur']) {
    assert.equal(isLocaleRtl(getLocaleByCode(code)!), true, `${code} should be RTL`);
  }
  for (const code of ['en', 'fr', 'zh', 'ja']) {
    assert.equal(isLocaleRtl(getLocaleByCode(code)!), false, `${code} should be LTR`);
  }
});
