'use client';

import { useEffect, useRef } from 'react';

import { recreateScript } from '@/lib/script-utils';

interface CustomCodeInjectorProps {
  html: string;
}

/**
 * Injects custom HTML/script code after React hydration.
 * Renders an empty container on SSR to avoid hydration mismatches,
 * then injects and executes scripts via useEffect on the client.
 */
export default function CustomCodeInjector({ html }: CustomCodeInjectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = html;

    const scripts = container.querySelectorAll('script');
    scripts.forEach((original) => {
      original.replaceWith(recreateScript(original));
    });
  }, [html]);

  return <div ref={containerRef} />;
}
