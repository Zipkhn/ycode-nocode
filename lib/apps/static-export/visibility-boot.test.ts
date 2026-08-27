import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VISIBILITY_BOOT_SCRIPT } from '@/lib/apps/static-export/visibility-runtime';

/**
 * Run the exported boot script against a minimal fake DOM and report what it
 * decided for a single node. The script only reads getAttribute and writes
 * element.style, so plain objects are enough.
 *
 * Guards the parity documented in lib/layer-utils::evaluateVisibility — the
 * static export re-implements it in ES5, and the two drifted once already
 * (groups were treated as a plain AND gate, ignoring action/defaultVisibility).
 */
function isVisible(rule: unknown): boolean {
  const style = {
    display: '',
    removeProperty(prop: string) {
      if (prop === 'display') this.display = '';
    },
  };
  const el = { getAttribute: () => JSON.stringify(rule), style };
  const document = { readyState: 'complete', addEventListener: () => {}, querySelectorAll: () => [el] };

  new Function('document', VISIBILITY_BOOT_SCRIPT)(document);
  return style.display !== 'none';
}

const yes = { dynamic: false, result: true };
const no = { dynamic: false, result: false };

test('boot script: default hidden + a matching show group reveals', () => {
  assert.equal(
    isVisible({ defaultVisibility: 'hidden', groups: [{ action: 'show', conditions: [yes] }] }),
    true
  );
});

test('boot script: default hidden + a non-matching show group stays hidden', () => {
  assert.equal(
    isVisible({ defaultVisibility: 'hidden', groups: [{ action: 'show', conditions: [no] }] }),
    false
  );
});

test('boot script: a matching hide group wins over a matching show group', () => {
  assert.equal(
    isVisible({
      defaultVisibility: 'visible',
      groups: [{ action: 'show', conditions: [yes] }, { action: 'hide', conditions: [yes] }],
    }),
    false
  );
});

test('boot script: a non-matching hide group falls back to the default', () => {
  assert.equal(
    isVisible({ defaultVisibility: 'visible', groups: [{ action: 'hide', conditions: [no] }] }),
    true
  );
  assert.equal(
    isVisible({ defaultVisibility: 'hidden', groups: [{ action: 'hide', conditions: [no] }] }),
    false
  );
});

test('boot script: conditions OR inside a group, groups default to show', () => {
  assert.equal(
    isVisible({ defaultVisibility: 'hidden', groups: [{ conditions: [no, yes] }] }),
    true
  );
  assert.equal(
    isVisible({ defaultVisibility: 'hidden', groups: [{ conditions: [no, no] }] }),
    false
  );
});

test('boot script: no groups and empty groups fall back to the default', () => {
  assert.equal(isVisible({ defaultVisibility: 'hidden', groups: [] }), false);
  assert.equal(isVisible({ groups: [] }), true);
  assert.equal(isVisible({ defaultVisibility: 'hidden', groups: [{ action: 'show', conditions: [] }] }), false);
});
