'use client';

import { useEffect, type ScriptHTMLAttributes } from 'react';

/**
 * Flips to false after the first client render (hydration). All instances share it:
 * React runs every render before any effect, so every initial-load instance captures
 * `true`, then the first effect flips it — subsequent client (router.push) navigations
 * see `false`.
 */
let initialLoad = true;

/**
 * Renders an inline <script> only for the initial document load. Under client routing
 * (router.push) the page re-renders on the client, where React can't execute a
 * freshly-created <script> (it warns) and re-running init code is wrong (e.g. double
 * GA pageviews). Use for SSR/initial-only scripts: analytics init, JSON-LD, FOUC guards.
 */
export default function InitialLoadScript(props: ScriptHTMLAttributes<HTMLScriptElement>) {
  const emit = initialLoad;
  useEffect(() => { initialLoad = false; }, []);
  if (!emit) return null;
  return <script {...props} />;
}
