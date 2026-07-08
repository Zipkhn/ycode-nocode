import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollectionField, FieldValidation } from '@/types';
import { validateItemWrite, bodyTooLarge, MAX_ITEM_BODY_BYTES, serializeWriteValue } from '@/lib/collection-item-write-validation';

let seq = 0;
function field(
  name: string,
  overrides: Partial<CollectionField> = {},
  validation?: FieldValidation
): CollectionField {
  return {
    id: `f-${name}-${seq++}`,
    name,
    key: null,
    type: 'text',
    default: null,
    fillable: true,
    order: 0,
    collection_id: 'col-1',
    reference_collection_id: null,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    hidden: false,
    is_computed: false,
    is_published: false,
    data: validation ? { validation } : {},
    ...overrides,
  };
}

test('bodyTooLarge: over limit → true, under/absent → false', () => {
  const over = new Request('http://x', { headers: { 'content-length': String(MAX_ITEM_BODY_BYTES + 1) } });
  const under = new Request('http://x', { headers: { 'content-length': '10' } });
  const none = new Request('http://x');
  assert.equal(bodyTooLarge(over), true);
  assert.equal(bodyTooLarge(under), false);
  assert.equal(bodyTooLarge(none), false);
});

test("requiredCheck 'all': missing required field → error", async () => {
  const f = field('Name', {}, { required: true });
  const errs = await validateItemWrite('col-1', [f], {}, { requiredCheck: 'all' });
  assert.equal(errs.length, 1);
  assert.match(errs[0].messages[0], /required/);
});

test("requiredCheck 'present': untouched required field → skipped", async () => {
  const f = field('Name', {}, { required: true });
  const errs = await validateItemWrite('col-1', [f], {}, { requiredCheck: 'present' });
  assert.deepEqual(errs, []);
});

test("requiredCheck 'present': provided empty required field → error", async () => {
  const f = field('Name', {}, { required: true });
  const errs = await validateItemWrite('col-1', [f], { [f.id]: '' }, { requiredCheck: 'present' });
  assert.equal(errs.length, 1);
});

test('protected + computed fields are skipped', async () => {
  const idF = field('Id', { key: 'id' }, { required: true });
  const statusF = field('Status', { is_computed: true }, { required: true });
  const errs = await validateItemWrite('col-1', [idF, statusF], {}, { requiredCheck: 'all' });
  assert.deepEqual(errs, []);
});

test('constraint violation reported by slug', async () => {
  const f = field('Price', { type: 'number' }, { min: 0 });
  const errs = await validateItemWrite('col-1', [f], { [f.id]: '-5' }, { requiredCheck: 'all' });
  assert.equal(errs.length, 1);
  assert.equal(errs[0].field, 'price');
});

test('serializeWriteValue: object/array stringified, others passthrough', () => {
  assert.equal(serializeWriteValue('object', { a: 1 }), '{"a":1}');
  assert.equal(serializeWriteValue('array', [1, 2]), '[1,2]');
  assert.equal(serializeWriteValue('object', '{"a":1}'), '{"a":1}'); // already string
  assert.equal(serializeWriteValue('text', 'hi'), 'hi');
  assert.equal(serializeWriteValue('object', null), null);
  assert.equal(serializeWriteValue('array', undefined), null);
});

test('valid payload → no errors', async () => {
  const name = field('Name', {}, { required: true });
  const price = field('Price', { type: 'number' }, { min: 0 });
  const errs = await validateItemWrite(
    'col-1',
    [name, price],
    { [name.id]: 'Shoe', [price.id]: '49.99' },
    { requiredCheck: 'all' }
  );
  assert.deepEqual(errs, []);
});
