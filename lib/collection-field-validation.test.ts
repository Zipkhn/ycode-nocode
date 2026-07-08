import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollectionField, FieldValidation, ObjectSubField } from '@/types';
import { validateField, validateObjectFieldsSchema } from '@/lib/collection-field-utils';

function field(
  type: CollectionField['type'],
  validation?: FieldValidation,
  name = 'Field'
): Pick<CollectionField, 'type' | 'name' | 'data'> {
  return { type, name, data: validation ? { validation } : {} };
}

test('no rules → valid', () => {
  const r = validateField(field('text'), 'hello');
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
});

test('required empty → error, blocks', () => {
  const r = validateField(field('text', { required: true }, 'Name'), '  ');
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /Name is required/);
});

test('required present → valid', () => {
  assert.equal(validateField(field('text', { required: true }), 'x').valid, true);
});

test('optional empty skips other rules', () => {
  const r = validateField(field('number', { min: 5 }), '');
  assert.equal(r.valid, true);
});

test('number min/max', () => {
  assert.equal(validateField(field('number', { min: 0 }), '-1').valid, false);
  assert.equal(validateField(field('number', { max: 100 }), '150').valid, false);
  assert.equal(validateField(field('number', { min: 0, max: 100 }), '42').valid, true);
});

test('number integer + precision', () => {
  assert.equal(validateField(field('number', { integer: true }), '1.5').valid, false);
  assert.equal(validateField(field('number', { precision: 2 }), '1.999').valid, false);
  assert.equal(validateField(field('number', { precision: 2 }), '1.99').valid, true);
});

test('non-numeric value on number field → error', () => {
  assert.equal(validateField(field('number', { min: 0 }), 'abc').valid, false);
});

test('string length', () => {
  assert.equal(validateField(field('text', { minLength: 3 }), 'ab').valid, false);
  assert.equal(validateField(field('text', { maxLength: 3 }), 'abcd').valid, false);
  assert.equal(validateField(field('text', { minLength: 3, maxLength: 5 }), 'abcd').valid, true);
});

test('regex (slug pattern)', () => {
  const slug = { regex: '^[a-z0-9-]+$' };
  assert.equal(validateField(field('text', slug), 'Nike Air').valid, false);
  assert.equal(validateField(field('text', slug), 'nike-air').valid, true);
});

test('invalid regex in config does not crash', () => {
  const r = validateField(field('text', { regex: '(' }), 'x');
  assert.equal(r.valid, true);
});

test('warning level does not block', () => {
  const r = validateField(field('text', { maxLength: 3, level: 'warning' }), 'abcdef');
  assert.equal(r.valid, true);
  assert.equal(r.warnings.length, 1);
  assert.equal(r.errors.length, 0);
});

test('required overrides warning level (still errors)', () => {
  const r = validateField(field('text', { required: true, level: 'warning' }), '');
  assert.equal(r.valid, false);
});

test('type-intrinsic email still enforced', () => {
  assert.equal(validateField(field('email'), 'not-an-email').valid, false);
  assert.equal(validateField(field('email'), 'a@b.co').valid, true);
});

// --- Nested object/array (amélioration #1) ---

const VARIANT_SUBFIELDS: ObjectSubField[] = [
  { key: 'sku', name: 'SKU', type: 'text', validation: { required: true } },
  { key: 'price', name: 'Price', type: 'number', validation: { min: 0 } },
];
function structuredField(
  type: 'object' | 'array',
  objectFields = VARIANT_SUBFIELDS
): Pick<CollectionField, 'type' | 'name' | 'data'> {
  return { type, name: 'Variants', data: { objectFields } };
}

test('object: valid sub-fields → valid', () => {
  assert.equal(validateField(structuredField('object'), '{"sku":"A1","price":"10"}').valid, true);
});

test('object: missing required sub-field → invalid', () => {
  const r = validateField(structuredField('object'), '{"price":"10"}');
  assert.equal(r.valid, false);
  assert.match(r.errors[0], /SKU is required/);
});

test('object: invalid JSON → invalid', () => {
  assert.equal(validateField(structuredField('object'), '{not json').valid, false);
});

test('object: value is array not object → invalid', () => {
  const r = validateField(structuredField('object'), '[]');
  assert.match(r.errors[0], /must be an object/);
});

test('array: all elements valid → valid', () => {
  assert.equal(validateField(structuredField('array'), '[{"sku":"A","price":"1"},{"sku":"B","price":"2"}]').valid, true);
});

test('array: one bad element reported with index', () => {
  const r = validateField(structuredField('array'), '[{"sku":"A","price":"1"},{"price":"-5"}]');
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => e.includes('[1]') && /SKU is required/.test(e)));
  assert.ok(r.errors.some((e) => e.includes('[1]') && /must be ≥ 0/.test(e)));
});

test('array: empty array → valid', () => {
  assert.equal(validateField(structuredField('array'), '[]').valid, true);
});

test('array: non-array JSON → invalid', () => {
  assert.match(validateField(structuredField('array'), '{}').errors[0], /must be an array/);
});

test('validateObjectFieldsSchema: valid → null', () => {
  assert.equal(validateObjectFieldsSchema(VARIANT_SUBFIELDS), null);
});

test('validateObjectFieldsSchema: empty → error', () => {
  assert.match(validateObjectFieldsSchema([])!, /non-empty/);
});

test('validateObjectFieldsSchema: nested type rejected', () => {
  assert.match(validateObjectFieldsSchema([{ key: 'x', name: 'X', type: 'object' }])!, /unsupported type/);
});

test('validateObjectFieldsSchema: duplicate key rejected', () => {
  const dup = [
    { key: 'a', name: 'A', type: 'text' },
    { key: 'a', name: 'B', type: 'text' },
  ];
  assert.match(validateObjectFieldsSchema(dup)!, /Duplicate/);
});
