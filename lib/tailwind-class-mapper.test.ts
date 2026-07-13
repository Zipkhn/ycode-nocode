import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFullClass,
  parseBreakpointClass,
  addBreakpointPrefix,
  getBreakpointClasses,
  removeConflictingClasses,
  removeRedundantSpacingShorthands,
} from '@/lib/tailwind-class-mapper';
import type { Breakpoint } from '@/types';

// --- parseFullClass: responsive prefix THEN state, desktop-first --------------
test('parseFullClass: bare class → desktop / neutral', () => {
  assert.deepEqual(parseFullClass('text-red-500'), {
    breakpoint: 'desktop', uiState: 'neutral', baseClass: 'text-red-500',
  });
});

test('parseFullClass: max-md: → mobile', () => {
  assert.deepEqual(parseFullClass('max-md:w-[100px]'), {
    breakpoint: 'mobile', uiState: 'neutral', baseClass: 'w-[100px]',
  });
});

test('parseFullClass: responsive + state combined', () => {
  assert.deepEqual(parseFullClass('max-md:hover:text-red-500'), {
    breakpoint: 'mobile', uiState: 'hover', baseClass: 'text-red-500',
  });
});

test('parseFullClass: visited aliases to current uiState', () => {
  assert.equal(parseFullClass('visited:text-blue-500').uiState, 'current');
});

// --- parseBreakpointClass + addBreakpointPrefix round-trip --------------------
const BPS: Breakpoint[] = ['desktop', 'tablet', 'mobile'];
for (const bp of BPS) {
  test(`breakpoint round-trip: ${bp}`, () => {
    const prefixed = addBreakpointPrefix(bp, 'w-[100px]');
    assert.deepEqual(parseBreakpointClass(prefixed), { breakpoint: bp, baseClass: 'w-[100px]' });
  });
}

test('addBreakpointPrefix: desktop is unprefixed', () => {
  assert.equal(addBreakpointPrefix('desktop', 'w-[100px]'), 'w-[100px]');
  assert.equal(addBreakpointPrefix('tablet', 'w-[100px]'), 'max-lg:w-[100px]');
  assert.equal(addBreakpointPrefix('mobile', 'w-[100px]'), 'max-md:w-[100px]');
});

test('parseBreakpointClass: legacy mobile-first prefixes map back', () => {
  assert.deepEqual(parseBreakpointClass('lg:flex'), { breakpoint: 'desktop', baseClass: 'flex' });
  assert.deepEqual(parseBreakpointClass('md:flex'), { breakpoint: 'tablet', baseClass: 'flex' });
});

// --- getBreakpointClasses: filter + strip prefix, exclude legacy on desktop ---
test('getBreakpointClasses: desktop excludes all breakpoint prefixes incl. legacy', () => {
  const classes = ['flex', 'max-md:hidden', 'max-lg:block', 'md:grid', 'lg:inline'];
  assert.deepEqual(getBreakpointClasses(classes, 'desktop'), ['flex']);
});

test('getBreakpointClasses: mobile returns only max-md, stripped', () => {
  const classes = ['flex', 'max-md:hidden', 'max-lg:block'];
  assert.deepEqual(getBreakpointClasses(classes, 'mobile'), ['hidden']);
});

// --- removeConflictingClasses: text size vs color disambiguation --------------
test('removeConflictingClasses(color): removes named text color, keeps arbitrary size', () => {
  assert.deepEqual(
    removeConflictingClasses(['text-red-500', 'text-[10rem]'], 'color'),
    ['text-[10rem]'],
  );
});

test('removeConflictingClasses(color): strips text-gradient helpers', () => {
  assert.deepEqual(
    removeConflictingClasses(['bg-clip-text', 'text-transparent', 'bg-[linear-gradient(90deg,#000,#fff)]'], 'color'),
    [],
  );
});

test('removeConflictingClasses(fontSize): keeps arbitrary color, drops arbitrary size', () => {
  assert.deepEqual(
    removeConflictingClasses(['text-[10rem]', 'text-[#0000FF]'], 'fontSize'),
    ['text-[#0000FF]'],
  );
});

test('removeConflictingClasses: unknown property is a no-op', () => {
  const input = ['text-red-500', 'w-full'];
  assert.deepEqual(removeConflictingClasses(input, 'not-a-property'), input);
});

// --- removeRedundantSpacingShorthands: per breakpoint/state group -------------
test('removeRedundantSpacingShorthands: px covered by pl+pr is dropped', () => {
  // px-4 is redundant when both pl-2 and pr-2 explicitly present in same group
  const out = removeRedundantSpacingShorthands(['px-4', 'pl-2', 'pr-2']);
  assert.ok(!out.includes('px-4'));
  assert.ok(out.includes('pl-2') && out.includes('pr-2'));
});

test('removeRedundantSpacingShorthands: shorthand kept when a side is missing', () => {
  const out = removeRedundantSpacingShorthands(['px-4', 'pl-2']);
  assert.deepEqual(out, ['px-4', 'pl-2']);
});

test('removeRedundantSpacingShorthands: different breakpoint groups do not cross-cancel', () => {
  // pl/pr on desktop must NOT make max-md:px redundant
  const out = removeRedundantSpacingShorthands(['max-md:px-4', 'pl-2', 'pr-2']);
  assert.ok(out.includes('max-md:px-4'));
});
