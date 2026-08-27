import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRobotsTxt, AI_CRAWLERS } from '@/lib/robots-txt';

test('buildRobotsTxt: default body allows every AI crawler and hides /ycode/', () => {
  const out = buildRobotsTxt({});
  for (const ua of AI_CRAWLERS) assert.match(out, new RegExp(`^User-agent: ${ua}$`, 'm'));
  assert.match(out, /^Disallow: \/ycode\/$/m);
  assert.doesNotMatch(out, /Sitemap:/);
});

test('buildRobotsTxt: appends the sitemap when one is enabled', () => {
  const out = buildRobotsTxt({ sitemapUrl: 'https://example.com/sitemap.xml' });
  assert.match(out, /\nSitemap: https:\/\/example\.com\/sitemap\.xml$/);
});

test('buildRobotsTxt: custom body is used verbatim, sitemap appended only when missing', () => {
  const custom = 'User-agent: *\nDisallow: /private';
  assert.equal(
    buildRobotsTxt({ customRobots: `  ${custom}  `, sitemapUrl: 'https://example.com/sitemap.xml' }),
    `${custom}\n\nSitemap: https://example.com/sitemap.xml`
  );

  const withSitemap = `${custom}\nSitemap: https://other.test/s.xml`;
  assert.equal(
    buildRobotsTxt({ customRobots: withSitemap, sitemapUrl: 'https://example.com/sitemap.xml' }),
    withSitemap
  );
});

test('buildRobotsTxt: a blank custom value falls back to the default body', () => {
  assert.equal(buildRobotsTxt({ customRobots: '   ' }), buildRobotsTxt({}));
});
