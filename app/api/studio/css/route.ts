import { renderFullStudioCss } from '@/lib/studio-css';
import { loadCurrentTheme, readBaseCss } from '@/lib/studio-theme-store';

/**
 * Dynamic Studio stylesheet — the full global-theme.css equivalent rendered from
 * the DB (static skeleton + DB-managed variables/custom-vars/bridges).
 *
 * Replaces the static /global-theme.css fetch in the builder so live theme edits
 * are reflected without writing to a read-only FS. Never cached.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const headers = { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' };
  try {
    const baseCss = await readBaseCss();
    if (!baseCss) {
      return new Response('/* studio base css unavailable */', { status: 200, headers });
    }
    const theme = await loadCurrentTheme();
    return new Response(renderFullStudioCss(baseCss, theme), { status: 200, headers });
  } catch {
    return new Response('/* studio css error */', { status: 500, headers });
  }
}
