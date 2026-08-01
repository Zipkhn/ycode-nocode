'use client';

/**
 * DialogInitializer - Client component that wires Dialog elements on
 * preview/production pages.
 *
 * The modal is a native `<dialog>`, so `showModal()` gives us focus trapping,
 * Escape-to-close, an inert background and top-layer stacking (immune to any
 * ancestor's z-index / transform) for free. This runtime only has to bind the
 * trigger and close buttons, close on backdrop click, lock body scroll and
 * point `aria-labelledby` at the dialog title.
 *
 * Binds by `data-dialog-*` attributes carried by the Dialog template, and
 * re-binds on ITEMS_INJECTED_EVENT for collection/load-more clones (mirrors
 * VariableTriggers).
 */

import { useEffect } from 'react';
import { ITEMS_INJECTED_EVENT } from '@/components/FilterableCollection';

export default function DialogInitializer({ doc }: { doc?: Document }) {
  useEffect(() => {
    // Resolved here, not as a default param: the component is server-rendered
    // and `document` only exists once the effect runs.
    const target = doc ?? document;
    const win = target.defaultView ?? window;
    let cleanups: Array<() => void> = [];

    const bind = () => {
      cleanups.forEach(c => c());
      cleanups = [];

      target.querySelectorAll<HTMLElement>('[data-dialog-root]').forEach((root, index) => {
        const modal = root.querySelector<HTMLDialogElement>('dialog');
        if (!modal || typeof modal.showModal !== 'function') return;

        // Radix/Webstudio require a title for accessibility; we wire it when
        // present rather than failing, since the user can delete the layer.
        const title = modal.querySelector<HTMLElement>('[data-dialog-title]');
        if (title) {
          if (!title.id) title.id = `ycode-dialog-title-${index}`;
          modal.setAttribute('aria-labelledby', title.id);
        }

        const on = (el: EventTarget, evt: string, handler: EventListener) => {
          el.addEventListener(evt, handler);
          cleanups.push(() => el.removeEventListener(evt, handler));
        };

        const open = () => {
          if (modal.open) return;
          modal.showModal();
          target.body.classList.add('overflow-hidden');
        };
        const close = () => { if (modal.open) modal.close(); };

        root.querySelectorAll('[data-dialog-trigger]').forEach(el => on(el, 'click', open));
        modal.querySelectorAll('[data-dialog-close]').forEach(el => on(el, 'click', close));

        // A click whose target is the <dialog> itself landed on its ::backdrop —
        // clicks inside the panel bubble up from a descendant instead.
        on(modal, 'click', (e) => { if (e.target === modal) close(); });

        // `close` also fires on Escape, so scroll unlocking lives here only.
        on(modal, 'close', () => target.body.classList.remove('overflow-hidden'));
      });

      cleanups.push(() => target.body.classList.remove('overflow-hidden'));
    };

    bind();
    win.addEventListener(ITEMS_INJECTED_EVENT, bind);
    return () => {
      cleanups.forEach(c => c());
      win.removeEventListener(ITEMS_INJECTED_EVENT, bind);
    };
  }, [doc]);

  return null;
}
