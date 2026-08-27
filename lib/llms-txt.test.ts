import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page, PageFolder } from '@/types';
import { generateLlmsTxt } from '@/lib/llms-txt';

const page = (over: Record<string, unknown> = {}): Page =>
  ({
    id: 'p1',
    name: 'About',
    slug: 'about',
    page_folder_id: null,
    is_published: true,
    is_dynamic: false,
    deleted_at: null,
    error_page: null,
    settings: {},
    ...over,
  }) as unknown as Page;

const folders: PageFolder[] = [];
const base = 'https://example.com';

test('generateLlmsTxt: lists published pages with their AI summary', () => {
  const out = generateLlmsTxt({
    pages: [page({ settings: { seo: { ai_summary: 'Who we are.' } } })],
    folders,
    baseUrl: `${base}/`,
    siteName: 'Acme',
    siteDescription: 'Landing pages, fast.',
  })!;
  assert.equal(
    out,
    '# Acme\n\n> Landing pages, fast.\n\n## Pages\n\n- [About](https://example.com/about): Who we are.\n'
  );
});

test('generateLlmsTxt: falls back to the meta description, then to no summary', () => {
  const out = generateLlmsTxt({
    pages: [
      page({ id: 'p1', settings: { seo: { description: 'Meta desc.' } } }),
      page({ id: 'p2', name: 'Contact', slug: 'contact' }),
    ],
    folders,
    baseUrl: base,
  })!;
  assert.match(out, /- \[About\]\(https:\/\/example\.com\/about\): Meta desc\./);
  assert.match(out, /- \[Contact\]\(https:\/\/example\.com\/contact\)\n/);
});

test('generateLlmsTxt: skips noindex, error, unpublished, deleted and dynamic pages', () => {
  const out = generateLlmsTxt({
    pages: [
      page({ id: 'p1', name: 'Hidden', settings: { seo: { noindex: true } } }),
      page({ id: 'p2', name: 'NotFound', error_page: 404 }),
      page({ id: 'p3', name: 'Draft', is_published: false }),
      page({ id: 'p4', name: 'Gone', deleted_at: '2026-01-01' }),
      page({ id: 'p5', name: 'Blog post', is_dynamic: true }),
      page({ id: 'p6', name: 'Kept', slug: 'kept' }),
    ],
    folders,
    baseUrl: base,
  })!;
  assert.deepEqual(out.split('\n').filter(l => l.startsWith('- ')), ['- [Kept](https://example.com/kept)']);
});

test('generateLlmsTxt: null when nothing qualifies or no base URL', () => {
  assert.equal(generateLlmsTxt({ pages: [], folders, baseUrl: base }), null);
  assert.equal(generateLlmsTxt({ pages: [page()], folders, baseUrl: '' }), null);
});

test('generateLlmsTxt: site name falls back to the host, whitespace is collapsed', () => {
  const out = generateLlmsTxt({
    pages: [page({ settings: { seo: { title: '  About\n  us  ', ai_summary: 'A\n\nB' } } })],
    folders,
    baseUrl: base,
  })!;
  assert.match(out, /^# example\.com\n/);
  assert.match(out, /- \[About us\]\(https:\/\/example\.com\/about\): A B/);
});
