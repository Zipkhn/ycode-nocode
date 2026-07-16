'use client';

import { useLayoutEffect } from 'react';

/**
 * Flips to false after the first client render (hydration). The FOUC bootstrap
 * <script> below must only be emitted for the initial document load: on client
 * (router.push) navigations React can't execute a client-created script, and the
 * useLayoutEffect already swaps the body class. As a *client* component this render
 * runs on the client during navigation, where the flag is correctly false.
 */
let initialLoad = true;

export default function BodyClassApplier({ classes }: { classes: string }) {
  const emitBootstrap = initialLoad;

  useLayoutEffect(() => {
    initialLoad = false;
    const classList = (classes || 'bg-white').split(/\s+/).filter(Boolean);
    document.body.classList.add(...classList);
    return () => { document.body.classList.remove(...classList); };
  }, [classes]);

  // Apply body layer classes synchronously before first paint (initial load only).
  if (!emitBootstrap) return null;
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.body.className=document.body.className.replace(/\\bycode-body-applied\\b/g,'')+' ${(classes || 'bg-white').replace(/'/g, "\\'")} ycode-body-applied'`,
      }}
    />
  );
}
