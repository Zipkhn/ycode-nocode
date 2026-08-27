/**
 * Dynamic llms.txt Route
 *
 * Serves the custom content from settings when set; otherwise generates the
 * file from the published pages (see lib/llms-txt.ts).
 * See: https://llmstxt.org/
 */

import { NextResponse } from 'next/server';
import { credentials } from '@/lib/credentials';
import { getSettingsByKeys } from '@/lib/repositories/settingsRepository';
import { getAllPages } from '@/lib/repositories/pageRepository';
import { getAllPublishedPageFolders } from '@/lib/repositories/pageFolderRepository';
import { generateLlmsTxt } from '@/lib/llms-txt';
import { getSiteBaseUrl } from '@/lib/url-utils';

const TEXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=86400, s-maxage=86400',
};

export async function GET() {
  try {
    if (!(await credentials.exists())) return new NextResponse(null, { status: 404 });

    const settings = await getSettingsByKeys([
      'llms_txt',
      'global_canonical_url',
      'og_site_name',
      'schema_org_name',
    ]);

    const customLlms = settings.llms_txt;
    if (customLlms && typeof customLlms === 'string' && customLlms.trim()) {
      return new NextResponse(customLlms.trim(), { headers: TEXT_HEADERS });
    }

    const baseUrl = getSiteBaseUrl({ globalCanonicalUrl: settings.global_canonical_url }) || '';
    if (!baseUrl) return new NextResponse(null, { status: 404 });

    const [pages, folders] = await Promise.all([
      getAllPages({ is_published: true }),
      getAllPublishedPageFolders(),
    ]);

    // The home page's meta description doubles as the site summary — there is
    // no dedicated global field for it.
    const homePage = pages.find(p => p.is_index && p.deleted_at == null);

    const content = generateLlmsTxt({
      pages,
      folders,
      baseUrl,
      siteName: settings.og_site_name || settings.schema_org_name || null,
      siteDescription: homePage?.settings?.seo?.description || null,
    });

    if (!content) return new NextResponse(null, { status: 404 });

    return new NextResponse(content, { headers: TEXT_HEADERS });
  } catch (error) {
    console.error('[llms.txt] Error:', error);
    return new NextResponse(null, { status: 404 });
  }
}
