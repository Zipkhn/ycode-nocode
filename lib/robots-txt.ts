/**
 * robots.txt Generation
 *
 * Shared by the live route (app/(site)/robots.txt) and the static export so
 * both ship the same crawler policy.
 */

/**
 * Generative-engine crawlers, allowed explicitly.
 *
 * They already obey `User-agent: *`, but naming them makes the site's stance
 * auditable — and keeps a future blanket `Disallow` from silently cutting the
 * site out of AI answers.
 */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
  'Applebot-Extended',
] as const;

export const AI_CRAWLER_BLOCK = `# AI crawlers (generative engines)\n${AI_CRAWLERS.map(
  ua => `User-agent: ${ua}`,
).join('\n')}\nAllow: /\nDisallow: /ycode/`;

export interface RobotsTxtInput {
  /** Operator-authored robots.txt from settings — used verbatim when set. */
  customRobots?: string | null;
  /** Absolute sitemap URL. Omitted when the sitemap is disabled. */
  sitemapUrl?: string | null;
}

/**
 * Build the robots.txt body.
 *
 * A custom body is emitted as-is, with only the sitemap line appended when it
 * declares none — the operator's rules are never rewritten.
 */
export function buildRobotsTxt({ customRobots, sitemapUrl }: RobotsTxtInput): string {
  const custom = customRobots?.trim();

  if (custom) {
    return sitemapUrl && !custom.toLowerCase().includes('sitemap:')
      ? `${custom}\n\nSitemap: ${sitemapUrl}`
      : custom;
  }

  const content = `# Default robots.txt
User-agent: *
Allow: /

# Disallow admin/editor paths
Disallow: /ycode/

${AI_CRAWLER_BLOCK}`;

  return sitemapUrl ? `${content}\n\n# Sitemap\nSitemap: ${sitemapUrl}` : content;
}
