'use client';

import { useEffect } from 'react';

import { recreateScript } from '@/lib/script-utils';

interface HeadCodeInjectorProps {
  html: string;
  id: string;
}

/**
 * Injects custom HTML elements into document.head via useEffect.
 * Next.js streaming SSR prevents React 19 hoisting from working for
 * page-level content, so we programmatically append all elements
 * (meta, link, style, script, noscript) to document.head client-side.
 * Scripts are recreated to ensure execution.
 */
export default function HeadCodeInjector({ html, id }: HeadCodeInjectorProps) {
  useEffect(() => {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const injected: Element[] = [];

    Array.from(temp.children).forEach((original, i) => {
      const tag = `${id}-${i}`;

      if (original.tagName === 'SCRIPT') {
        const script = recreateScript(original as HTMLScriptElement);
        script.dataset.meta = tag;
        document.head.appendChild(script);
        injected.push(script);
      } else {
        const clone = original.cloneNode(true) as Element;
        clone.setAttribute('data-meta', tag);
        document.head.appendChild(clone);
        injected.push(clone);
      }
    });

    return () => {
      injected.forEach((el) => el.remove());
    };
  }, [html, id]);

  return null;
}
