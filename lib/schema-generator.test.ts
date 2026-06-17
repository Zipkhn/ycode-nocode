import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '@/types';
import type { SeoGovernanceContext } from '@/lib/seo-governance';
import {
  buildEntityId, generateWebSiteSchema, generateOrganizationSchema,
  generateArticleSchema, generateFaqSchema, serializeJsonLd, generatePageJsonLd,
} from '@/lib/schema-generator';

// ── @id helper ──────────────────────────────────────────────────────────────────

test('buildEntityId: strips trailing slash, appends /#type', () => {
  assert.equal(buildEntityId('https://example.com', 'website'), 'https://example.com/#website');
  assert.equal(buildEntityId('https://example.com/', 'organization'), 'https://example.com/#organization');
});

// ── WebSite ─────────────────────────────────────────────────────────────────────

test('generateWebSiteSchema: null without url, includes name + publisher when set', () => {
  assert.equal(generateWebSiteSchema({ url: '' }), null);
  assert.deepEqual(generateWebSiteSchema({ url: 'https://example.com/' }), {
    '@type': 'WebSite', '@id': 'https://example.com/#website', url: 'https://example.com',
  });
  const node = generateWebSiteSchema({ url: 'https://example.com', name: 'Acme', publisherId: 'https://example.com/#organization' });
  assert.equal(node!.name, 'Acme');
  assert.deepEqual(node!.publisher, { '@id': 'https://example.com/#organization' });
});

// ── Organization ────────────────────────────────────────────────────────────────

test('generateOrganizationSchema: null without name, @id only with baseUrl, logo as ImageObject', () => {
  assert.equal(generateOrganizationSchema({ name: '' }), null);
  const bare = generateOrganizationSchema({ name: 'Acme' });
  assert.equal(bare!['@id'], undefined);
  const full = generateOrganizationSchema({ name: 'Acme', url: 'https://example.com/', logoUrl: 'https://example.com/logo.png' }, 'https://example.com');
  assert.equal(full!['@id'], 'https://example.com/#organization');
  assert.equal(full!.url, 'https://example.com');
  assert.deepEqual(full!.logo, { '@type': 'ImageObject', url: 'https://example.com/logo.png' });
});

// ── Article ─────────────────────────────────────────────────────────────────────

test('generateArticleSchema: null without datePublished', () => {
  assert.equal(generateArticleSchema({ datePublished: '' } as never, 'https://example.com/p'), null);
});

test('generateArticleSchema: person author, headline fallback', () => {
  const node = generateArticleSchema(
    { datePublished: '2026-01-01', author: 'Jane' } as never, 'https://example.com/p/', undefined, 'Fallback Title');
  assert.equal(node!.headline, 'Fallback Title');
  assert.equal(node!['@id'], 'https://example.com/p/#article');
  assert.deepEqual(node!.author, { '@type': 'Person', name: 'Jane' });
});

test('generateArticleSchema: author defaults to org @id when publisher set and no author', () => {
  const node = generateArticleSchema(
    { datePublished: '2026-01-01' } as never, 'https://example.com/p', 'https://example.com/#organization');
  assert.deepEqual(node!.publisher, { '@id': 'https://example.com/#organization' });
  assert.deepEqual(node!.author, { '@id': 'https://example.com/#organization' });
});

// ── FAQ ─────────────────────────────────────────────────────────────────────────

test('generateFaqSchema: drops blank items, null when all blank, trims', () => {
  assert.equal(generateFaqSchema({ items: [{ question: ' ', answer: '' }] } as never, 'https://example.com/f'), null);
  const node = generateFaqSchema(
    { items: [{ question: ' Q1 ', answer: ' A1 ' }, { question: 'Q2', answer: '' }] } as never, 'https://example.com/f');
  const main = node!.mainEntity as Array<Record<string, unknown>>;
  assert.equal(main.length, 1);
  assert.equal(main[0].name, 'Q1');
});

// ── Serialization (XSS) ─────────────────────────────────────────────────────────

test('serializeJsonLd: escapes </script> breakout and &', () => {
  const out = serializeJsonLd({ name: '</script><script>alert(1)</script>', amp: 'a&b' });
  assert.ok(!out.includes('</script>'), 'raw </script> must not survive');
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('\\u003c') && out.includes('\\u003e') && out.includes('\\u0026'));
  assert.deepEqual(JSON.parse(out.replace(/\\u003c/g, '<').replace(/\\u003e/g, '>').replace(/\\u0026/g, '&')),
    { name: '</script><script>alert(1)</script>', amp: 'a&b' });
});

// ── Orchestrator ────────────────────────────────────────────────────────────────

const govCtx = (over: Record<string, unknown> = {}): SeoGovernanceContext =>
  ({ page: { name: 'Home', error_page: null, settings: {}, ...over } as unknown as Page }) as SeoGovernanceContext;

test('generatePageJsonLd: empty when not indexable', () => {
  const ctx = govCtx({ settings: { seo: { noindex: true } } });
  assert.deepEqual(generatePageJsonLd({ baseUrl: 'https://example.com', schemaOrgName: 'Acme', govCtx: ctx }), []);
});

test('generatePageJsonLd: empty when no qualifying data', () => {
  assert.deepEqual(generatePageJsonLd({ baseUrl: null, govCtx: govCtx() }), []);
});

test('generatePageJsonLd: WebSite + Organization graph with publisher cross-reference', () => {
  const out = generatePageJsonLd({
    baseUrl: 'https://example.com/', ogSiteName: 'Acme Site', schemaOrgName: 'Acme Inc', govCtx: govCtx(),
  });
  assert.equal(out.length, 1);
  const doc = JSON.parse(out[0]) as { '@context': string; '@graph': Array<Record<string, unknown>> };
  assert.equal(doc['@context'], 'https://schema.org');
  const types = doc['@graph'].map(n => n['@type']);
  assert.deepEqual(types, ['WebSite', 'Organization']);
  const website = doc['@graph'].find(n => n['@type'] === 'WebSite')!;
  assert.deepEqual(website.publisher, { '@id': 'https://example.com/#organization' });
});
