/**
 * llms.txt Generation
 *
 * Builds the default /llms.txt body from the published pages — the settings
 * field stays the override, not the only source. Format follows llmstxt.org:
 * an H1 site name, an optional blockquote summary, then a flat link list where
 * each entry carries the page's AI summary (falling back to its meta
 * description) so a generative engine can pick pages without crawling them.
 *
 * Pure — no repositories, no server-only imports. See app/(site)/llms.txt/route.ts.
 */

import type { Page, PageFolder } from '@/types';
import { buildSlugPath } from './page-utils';
import { shouldAppearInSitemap } from './seo-governance';

export interface LlmsTxtInput {
  pages: Page[];
  folders: PageFolder[];
  /** Canonical base URL. Required — links must be absolute. */
  baseUrl: string;
  /** Site name for the H1. Falls back to the host when empty. */
  siteName?: string | null;
  /** Optional one-line site summary, rendered as the blockquote. */
  siteDescription?: string | null;
}

/** Collapse whitespace and escape the markdown link syntax used around it. */
function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Generate the llms.txt body. Returns null when nothing qualifies — the route
 * then 404s rather than serving an empty file.
 *
 * Dynamic (CMS) pages are skipped: their URLs need per-item slugs, which live
 * in the sitemap's data path, not here.
 */
export function generateLlmsTxt(input: LlmsTxtInput): string | null {
  const base = input.baseUrl.replace(/\/$/, '');
  if (!base) return null;

  const entries = input.pages
    .filter(p => p.is_published && p.deleted_at == null && !p.is_dynamic && shouldAppearInSitemap(p))
    .map(page => {
      const seo = page.settings?.seo;
      const title = clean(seo?.title || page.name || '');
      if (!title) return null;

      const path = buildSlugPath(page, input.folders, 'page');
      const summary = clean(seo?.ai_summary || seo?.description || '');

      return summary
        ? `- [${title}](${base}${path}): ${summary}`
        : `- [${title}](${base}${path})`;
    })
    .filter((line): line is string => line !== null);

  if (entries.length === 0) return null;

  const name = clean(input.siteName || '') || base.replace(/^https?:\/\//, '');
  const lines = [`# ${name}`, ''];

  const description = clean(input.siteDescription || '');
  if (description) lines.push(`> ${description}`, '');

  lines.push('## Pages', '', ...entries, '');

  return lines.join('\n');
}
