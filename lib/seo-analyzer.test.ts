import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Layer, PageSettings } from '@/types';
import { analyzePage, type SeoIssue } from '@/lib/seo-analyzer';

// Layer fixture: a heading-ish node. `name` + `settings.tag` drive resolveHeadingTag.
const L = (name: string, tag?: string, children?: Layer[]): Layer =>
  ({ name, settings: tag ? { tag } : {}, children }) as unknown as Layer;

const ctx = { isErrorPage: false, isDynamicPage: false };
const messages = (issues: SeoIssue[]) => issues.map(i => i.message);
const has = (issues: SeoIssue[], frag: string) => messages(issues).some(m => m.includes(frag));

// ── H1 ────────────────────────────────────────────────────────────────────────

test('checkH1: missing → error, multiple → warning, exactly one → neither', () => {
  assert.ok(has(analyzePage([L('text', 'h2')], undefined, ctx), 'No H1 heading'));
  assert.ok(has(analyzePage([L('heading', 'h1'), L('heading', 'h1')], undefined, ctx), '2 H1 headings'));
  assert.ok(!has(analyzePage([L('heading', 'h1')], undefined, ctx), 'H1'));
});

// ── Hierarchy ───────────────────────────────────────────────────────────────────

test('checkHeadingHierarchy: flags a skipped level once, allows going back up', () => {
  const issues = analyzePage([L('heading', 'h1'), L('heading', 'h2'), L('heading', 'h4'), L('heading', 'h2')], undefined, ctx);
  assert.ok(has(issues, '<h4> follows <h2>'));
  // dedup: the single h2→h4 jump is reported once
  assert.equal(messages(issues).filter(m => m.includes('Heading level skipped')).length, 1);
});

test('nested children headings are collected in DOM order', () => {
  const tree = [L('heading', 'h1', [L('heading', 'h3')])]; // h1 → h3 skips h2
  assert.ok(has(analyzePage(tree, undefined, ctx), '<h3> follows <h1>'));
});

// ── Regression: heading with a non-heading tag must NOT count as a heading ──────

test('a heading re-tagged to <p> is excluded and does not poison hierarchy', () => {
  // h1, then a 'heading' re-tagged to 'p' (not a heading), then a real h3.
  // Before the fix, 'p' leaked in → parseInt('p'[1]) = NaN → prevLevel=NaN
  // silently disabled the h1→h3 skip detection that follows.
  const issues = analyzePage([L('heading', 'h1'), L('heading', 'p'), L('heading', 'h3')], undefined, ctx);
  assert.ok(has(issues, '<h3> follows <h1>'), 'skip detection survived the non-heading tag');
  assert.ok(!has(issues, 'No H1'), 'the real h1 is still counted');
});

// ── Meta / OG / JSON-LD content ─────────────────────────────────────────────────

const seo = (s: Record<string, unknown>) => s as unknown as PageSettings['seo'];

test('checkMeta + checkOgImage: title/desc length + missing image', () => {
  const long = 'x'.repeat(70);
  assert.ok(has(analyzePage([L('heading', 'h1')], seo({ title: long }), ctx), '70 characters'));
  assert.ok(has(analyzePage([L('heading', 'h1')], seo({ description: '' }), ctx), 'No meta description'));
  assert.ok(has(analyzePage([L('heading', 'h1')], seo({ description: 'y'.repeat(170) }), ctx), '170 characters'));
  assert.ok(has(analyzePage([L('heading', 'h1')], seo({ image: '' }), ctx), 'No social preview image'));
});

test('checkJsonLdSchemas: article without date + incomplete FAQ items', () => {
  const article = analyzePage([L('heading', 'h1')], seo({ image: 'x', json_ld: { schemas: { article: {} } } }), ctx);
  assert.ok(has(article, 'Date published is missing'));
  const faq = analyzePage([L('heading', 'h1')], seo({
    image: 'x', json_ld: { schemas: { faq: { items: [{ question: 'q', answer: '' }, { question: '', answer: 'a' }] } } },
  }), ctx);
  assert.ok(has(faq, '2 incomplete items'));
});

// ── Error pages short-circuit ───────────────────────────────────────────────────

test('analyzePage: error page yields no issues', () => {
  assert.deepEqual(analyzePage([L('text', 'p')], undefined, { isErrorPage: true, isDynamicPage: false }), []);
});
