import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveShaderTransition, SHADER_TRANSITIONS } from './shader-transitions';
import { DEFAULT_PAGE_TRANSITION, type PageTransitionConfig } from './page-transitions';

const cfg = (over: Partial<PageTransitionConfig> = {}): PageTransitionConfig => ({
  ...DEFAULT_PAGE_TRANSITION,
  ...over,
});

test('resolveShaderTransition: null for CSS presets', () => {
  for (const type of ['fade', 'rgb_split', 'slide', 'zoom', 'reveal'] as const) {
    assert.equal(resolveShaderTransition(cfg({ type })), null);
  }
});

test('resolveShaderTransition: maps each shader preset to its Paper component', () => {
  assert.equal(resolveShaderTransition(cfg({ type: 'shader_dither' }))?.component, 'Dithering');
  assert.equal(resolveShaderTransition(cfg({ type: 'shader_warp' }))?.component, 'Warp');
  assert.equal(resolveShaderTransition(cfg({ type: 'shader_smoke' }))?.component, 'SmokeRing');
});

test('buildProps: primary colour is wired into every shader', () => {
  const dither = resolveShaderTransition(cfg({ type: 'shader_dither', colorPrimary: '#ff0000' }))!;
  assert.equal(dither.props.colorFront, '#ff0000');
  const warp = resolveShaderTransition(cfg({ type: 'shader_warp', colorPrimary: '#00ff00', colorBack: '#0000ff' }))!;
  assert.deepEqual(warp.props.colors, ['#00ff00', '#0000ff']);
  const smoke = resolveShaderTransition(cfg({ type: 'shader_smoke', colorPrimary: '#abcdef', colorBack: '#111111' }))!;
  assert.deepEqual(smoke.props.colors, ['#abcdef']);
  assert.equal(smoke.props.colorBack, '#111111');
});

test('buildProps: intensity scales speed monotonically within bounds', () => {
  const low = resolveShaderTransition(cfg({ type: 'shader_smoke', intensity: 0 }))!.props.speed as number;
  const high = resolveShaderTransition(cfg({ type: 'shader_smoke', intensity: 100 }))!.props.speed as number;
  assert.ok(high > low);
  assert.ok(low >= 0.3 && high <= 1.6);
});

test('registry: every entry builds a fill-sizing style', () => {
  for (const key of Object.keys(SHADER_TRANSITIONS)) {
    const props = SHADER_TRANSITIONS[key].buildProps(cfg());
    assert.deepEqual(props.style, { width: '100%', height: '100%' });
  }
});
