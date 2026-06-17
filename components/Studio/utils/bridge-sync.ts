// Mirrors the Studio runtime bridges into Ycode's `custom_css` setting so the
// design tokens survive on the published site (where global-theme.css is not served).
// Pure + fetch-injectable so the robustness branches are unit-testable.

const START = '/* STUDIO_RUNTIME_BRIDGES_START */';
const END   = '/* STUDIO_RUNTIME_BRIDGES_END */';

/**
 * Insert/replace the Studio bridge block (root vars + bridges) inside existing CSS.
 * Idempotent: re-running with the same inputs yields byte-identical output (no
 * blank-line drift), so repeated saves don't bloat custom_css.
 */
export function buildBridgeCustomCss(
  currentCss: string,
  vars: Record<string, string>,
  bridges: string,
): string {
  const varBlock = `:root {\n${Object.entries(vars).map(([k, v]) => `  --${k}: ${v};`).join('\n')}\n}`;
  const inner    = `${START}\n${varBlock}\n\n${bridges}\n${END}`;
  if (currentCss.includes(START) && currentCss.includes(END)) {
    const before = currentCss.substring(0, currentCss.indexOf(START)).replace(/\s+$/, '');
    const after  = currentCss.substring(currentCss.indexOf(END) + END.length).replace(/^\s+/, '');
    return [before, inner, after].filter(Boolean).join('\n\n');
  }
  return [currentCss.replace(/\s+$/, ''), inner].filter(Boolean).join('\n\n');
}

/**
 * Sync the bridge block to `custom_css`.
 * - 404 → fresh project, write from an empty base.
 * - Any other GET failure → throw without writing, so existing custom CSS is never clobbered.
 * - PUT failure → throw, so the caller can surface an error instead of failing silently.
 */
export async function syncBridgesToCustomCss(
  vars: Record<string, string>,
  bridges: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const getRes = await fetchImpl('/ycode/api/settings/custom_css');
  if (!getRes.ok && getRes.status !== 404) {
    throw new Error(`GET custom_css ${getRes.status}`);
  }
  const currentCss = getRes.ok ? ((await getRes.json()).data || '') : '';
  const newCss = buildBridgeCustomCss(currentCss, vars, bridges);
  const putRes = await fetchImpl('/ycode/api/settings/custom_css', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: newCss }),
  });
  if (!putRes.ok) throw new Error(`PUT custom_css ${putRes.status}`);
}
