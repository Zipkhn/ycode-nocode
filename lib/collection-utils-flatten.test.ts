import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { CollectionField } from '@/types';
import { flattenObjectFields } from '@/lib/collection-utils';

let seq = 0;
function objField(id: string, objectFields: { key: string; name: string; type: CollectionField['type'] }[]): CollectionField {
  return {
    id, name: id, key: null, type: 'object', default: null, fillable: true, order: seq++,
    collection_id: 'c', reference_collection_id: null, created_at: '', updated_at: '',
    deleted_at: null, hidden: false, is_computed: false, is_published: false,
    data: { objectFields },
  };
}

const SEO = objField('seo', [
  { key: 'title', name: 'Title', type: 'text' },
  { key: 'noindex', name: 'No index', type: 'boolean' },
]);

test('flattens object sub-fields to objId.subKey (string JSON value)', () => {
  const out = flattenObjectFields({ seo: JSON.stringify({ title: 'Hi', noindex: true }) }, [SEO]);
  assert.equal(out['seo.title'], 'Hi');
  assert.equal(out['seo.noindex'], 'true');
});

test('handles already-parsed object value (client castValue path)', () => {
  const out = flattenObjectFields({ seo: { title: 'Yo', noindex: false } } as any, [SEO]);
  assert.equal(out['seo.title'], 'Yo');
  assert.equal(out['seo.noindex'], 'false');
});

test('missing/empty value → no keys', () => {
  assert.deepEqual(flattenObjectFields({ seo: '' }, [SEO]), {});
  assert.deepEqual(flattenObjectFields({}, [SEO]), {});
});

test('absent sub-field key is skipped', () => {
  const out = flattenObjectFields({ seo: JSON.stringify({ title: 'Only' }) }, [SEO]);
  assert.equal(out['seo.title'], 'Only');
  assert.ok(!('seo.noindex' in out));
});

test('invalid JSON → no keys, no throw', () => {
  assert.deepEqual(flattenObjectFields({ seo: '{bad' }, [SEO]), {});
});

test('non-object fields ignored', () => {
  const text: CollectionField = { ...SEO, id: 't', type: 'text', data: {} };
  assert.deepEqual(flattenObjectFields({ t: 'plain' }, [text]), {});
});
