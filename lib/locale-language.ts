/**
 * Derive an ISO 639-1 *language* code from a *locale* string.
 *
 *   'fr_FR' → 'fr'   'en-US' → 'en'   'fr' → 'fr'   null/'' → 'en'
 *
 * Strict locale/language separation (see memory): `locale` (fr_FR, og:locale)
 * is what the client sends and what gets stored; `language` (fr) is for AI
 * generation only and is ALWAYS derived server-side via this function — never
 * stored, never sent by the client.
 */
export function localeToLanguage(locale: string | null | undefined): string {
  if (!locale) return 'en';
  return locale.split(/[_-]/)[0].toLowerCase() || 'en';
}
