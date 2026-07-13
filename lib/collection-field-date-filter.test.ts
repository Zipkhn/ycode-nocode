import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isDateOnlyString,
  isDatePreset,
  dateStringToDayBounds,
  compareDateFilter,
  zonedTimeToUtcMs,
  parseItemIdList,
  operatorRequiresValue,
  operatorRequiresSecondValue,
} from '@/lib/collection-field-utils';

// --- isDateOnlyString / isDatePreset -----------------------------------------
test('isDateOnlyString: only YYYY-MM-DD matches', () => {
  assert.equal(isDateOnlyString('2026-07-13'), true);
  assert.equal(isDateOnlyString('2026-07-13T10:00:00Z'), false);
  assert.equal(isDateOnlyString(''), false);
  assert.equal(isDateOnlyString(null), false);
});

test('isDatePreset: $-prefixed values are presets', () => {
  assert.equal(isDatePreset('$today'), true);
  assert.equal(isDatePreset('2026-07-13'), false);
  assert.equal(isDatePreset(undefined), false);
});

// --- zonedTimeToUtcMs ---------------------------------------------------------
test('zonedTimeToUtcMs: UTC wall time equals Date.UTC', () => {
  assert.equal(
    zonedTimeToUtcMs(2026, 7, 13, 0, 0, 0, 0, 'UTC'),
    Date.UTC(2026, 6, 13, 0, 0, 0, 0),
  );
});

test('zonedTimeToUtcMs: America/New_York midnight is later in UTC (DST offset)', () => {
  // 2026-07-13 is EDT (UTC-4) → local midnight = 04:00 UTC
  const utc = zonedTimeToUtcMs(2026, 7, 13, 0, 0, 0, 0, 'America/New_York');
  assert.equal(utc, Date.UTC(2026, 6, 13, 4, 0, 0, 0));
});

test('zonedTimeToUtcMs: invalid timezone falls back to UTC guess', () => {
  assert.equal(
    zonedTimeToUtcMs(2026, 7, 13, 12, 0, 0, 0, 'Not/AZone'),
    Date.UTC(2026, 6, 13, 12, 0, 0, 0),
  );
});

// --- dateStringToDayBounds ----------------------------------------------------
test('dateStringToDayBounds: date_only spans the day in UTC', () => {
  const b = dateStringToDayBounds('2026-07-13', 'America/New_York', true);
  assert.deepEqual(b, {
    start: Date.parse('2026-07-13T00:00:00.000Z'),
    end: Date.parse('2026-07-13T23:59:59.999Z'),
  });
});

test('dateStringToDayBounds: datetime field spans the day in project timezone', () => {
  const tz = 'America/New_York';
  const b = dateStringToDayBounds('2026-07-13', tz, false)!;
  // Delegates to zonedTimeToUtcMs for both edges (start = local 00:00 = 04:00 UTC in EDT)
  assert.equal(b.start, zonedTimeToUtcMs(2026, 7, 13, 0, 0, 0, 0, tz));
  assert.equal(b.start, Date.UTC(2026, 6, 13, 4, 0, 0, 0));
  assert.equal(b.end, zonedTimeToUtcMs(2026, 7, 13, 23, 59, 59, 999, tz));
});

test('dateStringToDayBounds: full timestamp collapses to a single instant', () => {
  const ts = Date.parse('2026-07-13T10:30:00Z');
  assert.deepEqual(dateStringToDayBounds('2026-07-13T10:30:00Z'), { start: ts, end: ts });
});

test('dateStringToDayBounds: unparseable → null', () => {
  assert.equal(dateStringToDayBounds('not-a-date'), null);
  assert.equal(dateStringToDayBounds(null), null);
});

// --- compareDateFilter (day-aware) -------------------------------------------
test('compareDateFilter is: any timestamp on the day matches (UTC date_only)', () => {
  assert.equal(compareDateFilter('2026-07-13T10:00:00Z', 'is', '2026-07-13', undefined, 'UTC', true), true);
  assert.equal(compareDateFilter('2026-07-14T00:00:00Z', 'is', '2026-07-13', undefined, 'UTC', true), false);
});

test('compareDateFilter is_before / is_after use day boundaries', () => {
  // stored just before the day start → before; just after day end → after
  assert.equal(compareDateFilter('2026-07-12T23:00:00Z', 'is_before', '2026-07-13', undefined, 'UTC', true), true);
  assert.equal(compareDateFilter('2026-07-13T12:00:00Z', 'is_before', '2026-07-13', undefined, 'UTC', true), false);
  assert.equal(compareDateFilter('2026-07-14T01:00:00Z', 'is_after', '2026-07-13', undefined, 'UTC', true), true);
});

test('compareDateFilter is_between spans start-of-A to end-of-B', () => {
  assert.equal(
    compareDateFilter('2026-07-14T12:00:00Z', 'is_between', '2026-07-13', '2026-07-15', 'UTC', true),
    true,
  );
  assert.equal(
    compareDateFilter('2026-07-16T00:00:00Z', 'is_between', '2026-07-13', '2026-07-15', 'UTC', true),
    false,
  );
});

test('compareDateFilter: unparseable stored value → false', () => {
  assert.equal(compareDateFilter('garbage', 'is', '2026-07-13', undefined, 'UTC', true), false);
});

test('compareDateFilter is_between: missing second bound → false', () => {
  assert.equal(compareDateFilter('2026-07-14T00:00:00Z', 'is_between', '2026-07-13', undefined, 'UTC', true), false);
});

// --- parseItemIdList ----------------------------------------------------------
test('parseItemIdList: valid JSON array of strings', () => {
  assert.deepEqual(parseItemIdList('["a","b"]'), ['a', 'b']);
});

test('parseItemIdList: filters non-strings, tolerates malformed/empty', () => {
  assert.deepEqual(parseItemIdList('["a",1,null,"b"]'), ['a', 'b']);
  assert.deepEqual(parseItemIdList('{oops'), []);
  assert.deepEqual(parseItemIdList(''), []);
  assert.deepEqual(parseItemIdList(null), []);
  assert.deepEqual(parseItemIdList('"notarray"'), []);
});

// --- operator predicates ------------------------------------------------------
test('operatorRequiresValue: presence operators need no value', () => {
  assert.equal(operatorRequiresValue('is_empty'), false);
  assert.equal(operatorRequiresValue('is_not_empty'), false);
  assert.equal(operatorRequiresValue('is'), true);
});

test('operatorRequiresSecondValue: only is_between', () => {
  assert.equal(operatorRequiresSecondValue('is_between'), true);
  assert.equal(operatorRequiresSecondValue('is'), false);
});
