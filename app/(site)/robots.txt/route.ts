/**
 * Dynamic Robots.txt Route
 *
 * Generates robots.txt with configurable content and sitemap reference
 */

import { NextResponse } from 'next/server';
import { getSettingsByKeys } from '@/lib/repositories/settingsRepository';
import { credentials } from '@/lib/credentials';
import { buildRobotsTxt } from '@/lib/robots-txt';
import { getSiteBaseUrl } from '@/lib/url-utils';
import type { SitemapSettings } from '@/types';

export async function GET() {
  try {
    const hasSupabaseCredentials = await credentials.exists();
    if (!hasSupabaseCredentials) {
      const baseUrl = getSiteBaseUrl() || '';

      return new NextResponse(buildRobotsTxt({ sitemapUrl: baseUrl ? `${baseUrl}/sitemap.xml` : null }), {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        },
      });
    }

    const allSettings = await getSettingsByKeys(['robots_txt', 'sitemap', 'global_canonical_url']);
    const sitemapSettings = allSettings.sitemap as SitemapSettings | null;
    const sitemapEnabled = sitemapSettings?.mode && sitemapSettings.mode !== 'none';
    const baseUrl = getSiteBaseUrl({ globalCanonicalUrl: allSettings.global_canonical_url }) || '';

    const content = buildRobotsTxt({
      customRobots: typeof allSettings.robots_txt === 'string' ? allSettings.robots_txt : null,
      // A relative `Sitemap:` line is invalid — omit it when no base URL is set.
      sitemapUrl: sitemapEnabled && baseUrl ? `${baseUrl}/sitemap.xml` : null,
    });

    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch (error) {
    console.error('[robots.txt] Error generating robots.txt:', error);

    // Return default on error
    return new NextResponse(buildRobotsTxt({}), {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}
