/**
 * AI SEO Suggestion endpoint — Phase 4
 *
 * Proxies to an n8n webhook (AI_SEO_N8N_WEBHOOK_URL) and returns
 * AI-generated meta description and ai_summary for a page.
 *
 * The webhook URL is never exposed to the client.
 * Returns 503 when the env var is not set so the UI can degrade gracefully.
 *
 * Ycode product rule: datePublished is a blocking field for Article schema.
 * This route only handles meta description + ai_summary generation.
 * JSON-LD is never generated here.
 *
 * n8n payload shape:
 *   page_name, slug, locale, language, current_title, current_description,
 *   page_type, content[], generation_rules{}
 *
 * Expected n8n response: { description: string, ai_summary?: string }
 */

import { NextResponse } from 'next/server';
import type { ExtractedSegment } from '@/lib/page-text-extractor';

interface SeoSuggestRequest {
  pageName: string;
  slug: string;
  /** Full locale code, e.g. 'fr_FR'. Derived from og_locale or site locale. */
  locale?: string | null;
  currentTitle?: string;
  currentDescription?: string;
  pageType?: string | null;
  content: ExtractedSegment[];
}

interface N8nResponse {
  description?: string;
  ai_summary?: string;
}

/**
 * Derive ISO 639-1 language code from a locale string.
 * 'fr_FR' → 'fr', 'en-US' → 'en', 'fr' → 'fr', null → 'en'
 */
function localeToLanguage(locale: string | null | undefined): string {
  if (!locale) return 'en';
  return locale.split(/[_-]/)[0].toLowerCase() || 'en';
}

export async function POST(request: Request): Promise<NextResponse> {
  const webhookUrl = process.env.AI_SEO_N8N_WEBHOOK_URL;

  if (!webhookUrl) {
    return NextResponse.json(
      { error: 'AI SEO generation is not configured on this instance.' },
      { status: 503 }
    );
  }

  let body: SeoSuggestRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body.pageName || !body.slug) {
    return NextResponse.json({ error: 'pageName and slug are required.' }, { status: 400 });
  }

  const language = localeToLanguage(body.locale);

  let n8nResponse: Response;
  try {
    n8nResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page_name: body.pageName,
        slug: body.slug,
        locale: body.locale ?? null,
        language,
        current_title: body.currentTitle ?? '',
        current_description: body.currentDescription ?? '',
        page_type: body.pageType ?? null,
        content: body.content,
        generation_rules: {
          target_language: language,
          target_length_chars: { min: 120, max: 160 },
          requirements: [
            'unique and specific to this page — not reusable across other pages',
            'factual — based only on the provided page content, not invented',
            'no boilerplate phrases ("Welcome to", "Best in class", "We offer", "Discover our")',
            'do not paraphrase or repeat the page title verbatim',
            'natural prose sentence, not a keyword list',
            `written in ${language} — match the page language exactly`,
          ],
        },
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    return NextResponse.json(
      { error: isTimeout ? 'AI service timed out.' : 'Failed to reach AI service.' },
      { status: isTimeout ? 504 : 502 }
    );
  }

  if (!n8nResponse.ok) {
    return NextResponse.json({ error: 'AI service returned an error.' }, { status: 502 });
  }

  let result: N8nResponse;
  try {
    result = await n8nResponse.json();
  } catch {
    return NextResponse.json({ error: 'Unexpected AI response format.' }, { status: 502 });
  }

  if (typeof result.description !== 'string') {
    return NextResponse.json({ error: 'AI response missing description field.' }, { status: 502 });
  }

  return NextResponse.json({
    description: result.description,
    aiSummary: result.ai_summary ?? '',
  });
}
