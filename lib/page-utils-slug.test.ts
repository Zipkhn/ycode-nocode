import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '@/types';
import {
  sanitizeSlug,
  generateSlug,
  generateUniqueSlug,
  isReservedRootSlug,
  normalizeSlugSegment,
  getNextNumberFromNames,
} from '@/lib/page-utils';

function page(over: Partial<Page>): Page {
  return {
    id: over.id ?? 'p',
    slug: over.slug ?? '',
    page_folder_id: over.page_folder_id ?? null,
    is_published: over.is_published ?? false,
    error_page: over.error_page ?? null,
    ...over,
  } as Page;
}

// --- sanitizeSlug -------------------------------------------------------------
test('sanitizeSlug: lowercases, spaces→dash, collapses dashes, trims', () => {
  assert.equal(sanitizeSlug('  My  Cool   Page!! '), 'my-cool-page');
});

test('sanitizeSlug: transliterates mapped (Lithuanian) chars', () => {
  assert.equal(sanitizeSlug('Ąžuolas'), 'azuolas');
});

test('sanitizeSlug: invalid symbols collapse to a single dash', () => {
  assert.equal(sanitizeSlug('a & b @ c'), 'a-b-c');
});

test('sanitizeSlug: allowTrailingDash preserves the trailing dash (mid-typing)', () => {
  assert.equal(sanitizeSlug('hello world ', true), 'hello-world-');
  assert.equal(sanitizeSlug('hello world ', false), 'hello-world');
});

test('generateSlug delegates to sanitizeSlug', () => {
  assert.equal(generateSlug('Hello World'), 'hello-world');
});

// --- isReservedRootSlug / normalizeSlugSegment --------------------------------
test('isReservedRootSlug: "ycode" reserved, case/space-insensitive', () => {
  assert.equal(isReservedRootSlug('ycode'), true);
  assert.equal(isReservedRootSlug('  YCode '), true);
  assert.equal(isReservedRootSlug('blog'), false);
});

test('normalizeSlugSegment: strips edge slashes, keeps interior, handles null', () => {
  assert.equal(normalizeSlugSegment('/foo/'), 'foo');
  assert.equal(normalizeSlugSegment('foo/bar'), 'foo/bar');
  assert.equal(normalizeSlugSegment(null), '');
});

// --- generateUniqueSlug -------------------------------------------------------
test('generateUniqueSlug: free base slug returned as-is', () => {
  assert.equal(generateUniqueSlug('About Us', []), 'about-us');
});

test('generateUniqueSlug: appends -2 on collision in same folder+state', () => {
  const pages = [page({ id: '1', slug: 'about-us' })];
  assert.equal(generateUniqueSlug('About Us', pages), 'about-us-2');
});

test('generateUniqueSlug: skips taken numbers to next free', () => {
  const pages = [
    page({ id: '1', slug: 'about-us' }),
    page({ id: '2', slug: 'about-us-2' }),
  ];
  assert.equal(generateUniqueSlug('About Us', pages), 'about-us-3');
});

test('generateUniqueSlug: collisions scoped by folder and published state', () => {
  const pages = [
    page({ id: '1', slug: 'about-us', page_folder_id: 'other' }),
    page({ id: '2', slug: 'about-us', is_published: true }),
  ];
  // target folder=null, unpublished → no collision
  assert.equal(generateUniqueSlug('About Us', pages, null, false), 'about-us');
});

test('generateUniqueSlug: excludePageId ignores the edited page', () => {
  const pages = [page({ id: '1', slug: 'about-us' })];
  assert.equal(generateUniqueSlug('About Us', pages, null, false, '1'), 'about-us');
});

test('generateUniqueSlug: reserved root slug bumped to -2', () => {
  assert.equal(generateUniqueSlug('ycode', [], null), 'ycode-2');
});

test('generateUniqueSlug: empty base slug → empty string', () => {
  assert.equal(generateUniqueSlug('!!!', []), '');
});

// --- getNextNumberFromNames ---------------------------------------------------
test('getNextNumberFromNames: no matches → 1', () => {
  assert.equal(getNextNumberFromNames([{ name: 'Home' }], 'Page'), 1);
});

test('getNextNumberFromNames: returns max+1, case-insensitive prefix', () => {
  const items = [{ name: 'Page 5' }, { name: 'page 2' }, { name: 'Other' }];
  assert.equal(getNextNumberFromNames(items, 'Page'), 6);
});
