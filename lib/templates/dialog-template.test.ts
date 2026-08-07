import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getLayerFromTemplate } from '@/lib/templates/blocks';
import { getLayerHtmlTag } from '@/lib/layer-utils';
import type { Layer } from '@/types';

/**
 * The Dialog runtime (components/DialogInitializer + the static-export
 * DIALOG_BOOT_SCRIPT) finds every moving part through `data-dialog-*`
 * attributes carried by this template. Dropping one silently breaks the
 * element, so the wiring is pinned here.
 */

function findLayer(layer: Layer, predicate: (l: Layer) => boolean): Layer | null {
  if (predicate(layer)) return layer;
  for (const child of layer.children ?? []) {
    const found = findLayer(child, predicate);
    if (found) return found;
  }
  return null;
}

const hasAttr = (attr: string) => (l: Layer) => l.settings?.customAttributes?.[attr] !== undefined;

test('dialog template resolves with its runtime wiring intact', () => {
  const root = getLayerFromTemplate('dialogRoot');
  assert.ok(root, 'dialogRoot template should resolve');

  assert.ok(hasAttr('data-dialog-root')(root), 'root carries data-dialog-root');
  assert.ok(findLayer(root, hasAttr('data-dialog-trigger')), 'has a trigger');
  assert.ok(findLayer(root, hasAttr('data-dialog-close')), 'has a close button');
  assert.ok(findLayer(root, hasAttr('data-dialog-title')), 'has a title (aria-labelledby target)');
});

test('dialog modal renders as a native <dialog> and the root stays a div', () => {
  const root = getLayerFromTemplate('dialogRoot');
  assert.ok(root);

  assert.equal(getLayerHtmlTag(root), 'div');

  const modal = findLayer(root, (l) => l.name === 'dialog');
  assert.ok(modal, 'modal layer exists');
  // showModal() only exists on a native <dialog>; anything else silently
  // degrades to a permanently visible block.
  assert.equal(getLayerHtmlTag(modal), 'dialog');
});

test('the <dialog> carries no display utility', () => {
  const root = getLayerFromTemplate('dialogRoot');
  assert.ok(root);
  const modal = findLayer(root, (l) => l.name === 'dialog');
  assert.ok(modal);

  // A closed <dialog> is hidden by a UA rule, and author styles beat the UA
  // origin regardless of specificity — one display utility here leaves the
  // modal permanently visible, stretched over the page by the UA's absolute
  // positioning. Layout belongs on the Dialog Content child.
  const classes = Array.isArray(modal.classes) ? modal.classes : String(modal.classes).split(/\s+/);
  const display = ['block', 'flex', 'grid', 'inline-flex', 'inline-block', 'inline-grid', 'contents', 'table'];
  assert.deepEqual(classes.filter((c) => display.includes(c)), []);
  assert.equal(modal.design?.layout?.display, undefined);

  const content = findLayer(modal, (l) => l.customName === 'Dialog Content');
  assert.ok(content, 'layout lives on a Dialog Content child');
  assert.equal(content.design?.layout?.display, 'Flex');
});

test('the modal is full-viewport by default', () => {
  const root = getLayerFromTemplate('dialogRoot');
  assert.ok(root);
  const modal = findLayer(root, (l) => l.name === 'dialog');
  assert.ok(modal);

  // Sizing lives in classes so the Sizing panel can edit it — the stylesheets
  // only contribute a zero-specificity ceiling. A `max-w-*` here would re-cap
  // the modal below the viewport, which is what `max-w-[90vw]` used to do.
  const classes = Array.isArray(modal.classes) ? modal.classes : String(modal.classes).split(/\s+/);
  assert.ok(classes.includes('w-[100vw]'), 'full viewport width');
  assert.ok(classes.includes('h-[100vh]'), 'full viewport height');
  assert.deepEqual(classes.filter((c) => c.startsWith('max-w-') || c.startsWith('max-h-')), []);
  // Rounded corners on a full-bleed modal leave four notches of backdrop.
  assert.deepEqual(classes.filter((c) => c.startsWith('rounded')), []);
});

test('the close button sits inside the modal, the trigger outside it', () => {
  const root = getLayerFromTemplate('dialogRoot');
  assert.ok(root);
  const modal = findLayer(root, (l) => l.name === 'dialog');
  assert.ok(modal);

  // The runtime scopes its close lookup to the modal and its trigger lookup to
  // the root. A trigger inside the modal would be unreachable: a closed
  // <dialog> is display:none.
  assert.ok(findLayer(modal, hasAttr('data-dialog-close')), 'close is inside the modal');
  assert.equal(findLayer(modal, hasAttr('data-dialog-trigger')), null, 'trigger is not inside the modal');
});
