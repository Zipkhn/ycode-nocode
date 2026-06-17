import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Page } from '@/types';
import {
  isIndexablePage, shouldAppearInSitemap, getCanonicalUrl, getRobotsDirectives,
  type SeoGovernanceContext,
} from '@/lib/seo-governance';

const page = (over: Record<string, unknown> = {}): Page =>
  ({ name: 'Home', error_page: null, settings: {}, ...over }) as unknown as Page;
const seoPage = (seo: Record<string, unknown>): Page => page({ settings: { seo } });

// ── isIndexablePage ───────────────────────────────────────────────────────────

test('isIndexablePage: true by default, false for each blocker', () => {
  assert.equal(isIndexablePage({ page: page() }), true);
  assert.equal(isIndexablePage({ page: page(), isPreview: true }), false);
  assert.equal(isIndexablePage({ page: page({ error_page: 404 }) }), false);
  assert.equal(isIndexablePage({ page: seoPage({ noindex: true }) }), false);
  assert.equal(isIndexablePage({ page: page(), isPasswordProtected: true }), false);
});

// ── shouldAppearInSitemap ─────────────────────────────────────────────────────

test('shouldAppearInSitemap: excludes error and noindex, ignores password', () => {
  assert.equal(shouldAppearInSitemap(page()), true);
  assert.equal(shouldAppearInSitemap(page({ error_page: 500 })), false);
  assert.equal(shouldAppearInSitemap(seoPage({ noindex: true })), false);
});

// ── getCanonicalUrl ───────────────────────────────────────────────────────────

test('getCanonicalUrl: override wins verbatim', () => {
  const ctx: SeoGovernanceContext = {
    page: seoPage({ canonical_override: 'https://other.com/x' }),
    pagePath: '/ignored', globalCanonicalUrl: 'https://example.com',
  };
  assert.equal(getCanonicalUrl(ctx), 'https://other.com/x');
});

test('getCanonicalUrl: base + path, trailing slash normalized, root → base', () => {
  assert.equal(getCanonicalUrl({ page: page(), globalCanonicalUrl: 'https://example.com/', pagePath: '/about' }),
    'https://example.com/about');
  assert.equal(getCanonicalUrl({ page: page(), globalCanonicalUrl: 'https://example.com', pagePath: '/' }),
    'https://example.com');
  assert.equal(getCanonicalUrl({ page: page(), globalCanonicalUrl: 'https://example.com', pagePath: 'about' }),
    'https://example.com/about'); // missing leading slash repaired
});

test('getCanonicalUrl: falls back to primaryDomain, null when no base or preview', () => {
  assert.equal(getCanonicalUrl({ page: page(), primaryDomainUrl: 'https://d.com', pagePath: '/a' }), 'https://d.com/a');
  assert.equal(getCanonicalUrl({ page: page(), pagePath: '/a' }), null);
  assert.equal(getCanonicalUrl({ page: page(), globalCanonicalUrl: 'https://example.com', pagePath: '/a', isPreview: true }), null);
});

// ── getRobotsDirectives ───────────────────────────────────────────────────────

test('getRobotsDirectives: noindex page has no granular directives', () => {
  const d = getRobotsDirectives({ page: seoPage({ noindex: true, max_snippet: 50 }) });
  assert.deepEqual(d, { index: false, follow: false });
});

test('getRobotsDirectives: indexable page includes explicit granular directives', () => {
  const d = getRobotsDirectives({ page: seoPage({ max_snippet: 50, max_image_preview: 'large' }) });
  assert.equal(d.index, true);
  assert.equal(d['max-snippet'], 50);
  assert.equal(d['max-image-preview'], 'large');
  assert.equal(d['max-video-preview'], undefined);
});
