'use client';

import { useLayoutEffect } from 'react';

/**
 * Sets <html lang> from the page locale. The root element is rendered by the
 * shared layout (which can't know the per-page locale). An effect rather than an
 * inline <script>: under client routing React can't execute a script it creates
 * during a client render (it warns), so the attribute would go stale when
 * navigating between locales.
 */
export default function HtmlLangApplier({ lang }: { lang: string }) {
  useLayoutEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  return null;
}
