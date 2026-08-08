import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFullClass,
  parseBreakpointClass,
  addBreakpointPrefix,
  getBreakpointClasses,
  removeConflictingClasses,
  removeRedundantSpacingShorthands,
  designToClassString,
  classesToDesign,
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

// --- spaced colour values (oklch / oklab / modern rgb) ------------------------
// Tailwind writes spaces inside an arbitrary value as `_`. Emitting the raw
// spaces produced several class tokens instead of one, so the rule was never
// generated and the colour silently did not render.
test('designToClassString: oklch is emitted as a single escaped token', () => {
  const cls = designToClassString({ backgrounds: { backgroundColor: 'oklch(0.7 0.2 180)' } } as never);
  assert.equal(cls, 'bg-[oklch(0.7_0.2_180)]');
  assert.equal(cls.trim().split(/\s+/).length, 1);
});

test('designToClassString: the slash inside oklch is not read as an opacity modifier', () => {
  const cls = designToClassString({ backgrounds: { backgroundColor: 'oklch(0.7 0.2 180 / 0.5)' } } as never);
  assert.equal(cls, 'bg-[oklch(0.7_0.2_180_/_0.5)]');
});

test('designToClassString: a trailing /NN stays an opacity modifier', () => {
  const oklch = designToClassString({ backgrounds: { backgroundColor: 'oklch(0.7 0.2 180)/50' } } as never);
  assert.equal(oklch, 'bg-[oklch(0.7_0.2_180)]/50');
  const hex = designToClassString({ backgrounds: { backgroundColor: '#cc8d8d/59' } } as never);
  assert.equal(hex, 'bg-[#cc8d8d]/59');
});

test('designToClassString: modern rgb and gradients are escaped too', () => {
  assert.equal(
    designToClassString({ backgrounds: { backgroundColor: 'rgb(255 0 0)' } } as never),
    'bg-[rgb(255_0_0)]'
  );
  assert.equal(
    designToClassString({ backgrounds: { backgroundColor: 'linear-gradient(90deg, #fff, #000)' } } as never),
    'bg-[linear-gradient(90deg,_#fff,_#000)]'
  );
});

test('designToClassString: colour properties other than background are escaped', () => {
  assert.equal(designToClassString({ typography: { color: 'oklch(0.5 0.1 20)' } } as never), 'text-[oklch(0.5_0.1_20)]');
  assert.equal(designToClassString({ borders: { borderColor: 'oklch(0.5 0.1 20)' } } as never), 'border-[oklch(0.5_0.1_20)]');
});

test('classesToDesign: underscores are restored to spaces for colour functions', () => {
  const design = classesToDesign('bg-[oklch(0.7_0.2_180)]');
  assert.equal(design?.backgrounds?.backgroundColor, 'oklch(0.7 0.2 180)');
});

test('classesToDesign: underscores in a custom-property name are left alone', () => {
  const design = classesToDesign('bg-[color:var(--my_token)]');
  assert.equal(design?.backgrounds?.backgroundColor, 'color:var(--my_token)');
});

test('oklch survives a full design → class → design round trip', () => {
  for (const value of ['oklch(0.7 0.2 180)', 'oklch(70% 0.2 180)', 'oklch(0.7 0.2 180 / 0.5)', '#2B3799']) {
    const cls = designToClassString({ backgrounds: { backgroundColor: value } } as never);
    assert.equal(classesToDesign(cls)?.backgrounds?.backgroundColor, value, `round trip for ${value}`);
  }
});
