'use client';

import { memo, useEffect, useState } from 'react';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import IconTabs, { type IconOption } from './IconTabs';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useParentLayout } from '@/hooks/use-parent-layout';
import { useEditorStore } from '@/stores/useEditorStore';
import type { Layer } from '@/types';

interface FlexChildControlsProps {
  layer: Layer | null;
  parentLayer?: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

/** Sizing presets (Webflow-style); "custom" exposes grow/shrink individually */
type Sizing = 'shrink' | 'grow' | 'fixed' | 'custom';
type OrderMode = 'default' | 'first' | 'last' | 'custom';

const SIZING_OPTIONS: IconOption<Sizing>[] = [
  { value: 'shrink', icon: 'minSize', label: 'Shrink if needed' },
  { value: 'grow', icon: 'maxSize', label: 'Grow if possible' },
  { value: 'fixed', icon: 'flex-fixed', label: "Don't shrink or grow" },
  { value: 'custom', icon: 'more', label: 'Custom' },
];

/** Preset → `flex` shorthand value (initial = 0 1 auto, 1 = 1 1 0%, none = 0 0 auto) */
const SIZING_FLEX_VALUE: Record<Exclude<Sizing, 'custom'>, string> = {
  shrink: 'initial',
  grow: '1',
  fixed: 'none',
};

const ORDER_OPTIONS: IconOption<OrderMode>[] = [
  { value: 'default', icon: 'x', label: 'Default' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  { value: 'custom', icon: 'more', label: 'Custom' },
];

const YES_NO_OPTIONS: IconOption<'1' | '0'>[] = [
  { value: '1', label: 'Yes' },
  { value: '0', label: 'No' },
];

function resolveSizing(flex: string, hasIndividual: boolean, forceCustom: boolean): Sizing {
  if (flex === '1') return 'grow';
  if (flex === 'none') return 'fixed';
  if (flex === 'auto' || hasIndividual || forceCustom) return 'custom';
  return 'shrink';
}

/** Effective grow for the custom row: flex-auto is 1 1 auto, browser default is 0 1 auto */
function resolveGrow(flexGrow: string, flex: string): '1' | '0' {
  if (flexGrow) return flexGrow === '1' ? '1' : '0';
  return flex === 'auto' ? '1' : '0';
}

function resolveOrderMode(order: string, forceCustom: boolean): OrderMode {
  if (order === 'first' || order === 'last') return order;
  if (/^\d+$/.test(order) || forceCustom) return 'custom';
  return 'default';
}

/**
 * "Flex child" section: how this layer behaves inside its flex parent
 * (sizing presets, grow/shrink, order). Renders nothing when the parent
 * is not a flex container.
 */
const FlexChildControls = memo(function FlexChildControls({ layer, parentLayer = null, onLayerUpdate }: FlexChildControlsProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { updateDesignProperties, debouncedUpdateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
  });
  const { isFlex } = useParentLayout(parentLayer);

  const flex = getDesignProperty('layout', 'flex') || '';
  const flexGrowRaw = getDesignProperty('layout', 'flexGrow') || '';
  const flexShrinkRaw = getDesignProperty('layout', 'flexShrink') || '';
  const order = getDesignProperty('layout', 'order') || '';

  // "Custom" can be chosen before any individual value is set
  const [isCustomSizing, setIsCustomSizing] = useState(false);
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [orderInput, setOrderInput] = useState(/^\d+$/.test(order) ? order : '');

  useEffect(() => {
    setIsCustomSizing(false);
    setIsCustomOrder(false);
  }, [layer?.id]);

  useEffect(() => {
    setOrderInput(/^\d+$/.test(order) ? order : '');
  }, [order]);

  if (!layer || !isFlex) return null;

  const sizing = resolveSizing(flex, Boolean(flexGrowRaw || flexShrinkRaw), isCustomSizing);
  const orderMode = resolveOrderMode(order, isCustomOrder);

  const flexGrow = resolveGrow(flexGrowRaw, flex);
  const flexShrink: '1' | '0' = flexShrinkRaw === '0' ? '0' : '1';

  const handleSizingChange = (next: Sizing) => {
    if (next === 'custom') {
      setIsCustomSizing(true);
      updateDesignProperties([{ category: 'layout', property: 'flex', value: null }]);
      return;
    }

    setIsCustomSizing(false);
    updateDesignProperties([
      { category: 'layout', property: 'flex', value: SIZING_FLEX_VALUE[next] },
      { category: 'layout', property: 'flexGrow', value: null },
      { category: 'layout', property: 'flexShrink', value: null },
    ]);
  };

  // Individual grow/shrink replace the shorthand so the two never conflict
  const handleGrowChange = (value: '1' | '0') => {
    updateDesignProperties([
      { category: 'layout', property: 'flex', value: null },
      { category: 'layout', property: 'flexGrow', value },
    ]);
  };

  const handleShrinkChange = (value: '1' | '0') => {
    updateDesignProperties([
      { category: 'layout', property: 'flex', value: null },
      { category: 'layout', property: 'flexShrink', value },
    ]);
  };

  const handleOrderModeChange = (next: OrderMode) => {
    if (next === 'custom') {
      setIsCustomOrder(true);
      if (!/^\d+$/.test(order)) {
        updateDesignProperties([{ category: 'layout', property: 'order', value: null }]);
      }
      return;
    }

    setIsCustomOrder(false);
    updateDesignProperties([
      { category: 'layout', property: 'order', value: next === 'default' ? null : next },
    ]);
  };

  const handleOrderInputChange = (value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return;
    setOrderInput(value);
    debouncedUpdateDesignProperty('layout', 'order', value || null);
  };

  return (
    <div className="py-5">
      <header className="py-4 -mt-4">
        <Label>Flex child</Label>
      </header>
      <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3">
              <Label variant="muted">Sizing</Label>
              <div className="col-span-2">
                  <IconTabs
                    value={sizing}
                    options={SIZING_OPTIONS}
                    onChange={handleSizingChange}
                  />
              </div>
          </div>

          {sizing === 'custom' && (
              <>
                  <div className="grid grid-cols-3">
                      <Label variant="muted">Grow</Label>
                      <div className="col-span-2">
                          <IconTabs
                            value={flexGrow}
                            options={YES_NO_OPTIONS}
                            onChange={handleGrowChange}
                          />
                      </div>
                  </div>
                  <div className="grid grid-cols-3">
                      <Label variant="muted">Shrink</Label>
                      <div className="col-span-2">
                          <IconTabs
                            value={flexShrink}
                            options={YES_NO_OPTIONS}
                            onChange={handleShrinkChange}
                          />
                      </div>
                  </div>
              </>
          )}

          <div className="grid grid-cols-3">
              <Label variant="muted">Order</Label>
              <div className="col-span-2">
                  <IconTabs
                    value={orderMode}
                    options={ORDER_OPTIONS}
                    onChange={handleOrderModeChange}
                  />
              </div>
          </div>

          {orderMode === 'custom' && (
              <div className="grid grid-cols-3">
                  <Label variant="muted">Position</Label>
                  <div className="col-span-2">
                      <InputGroup>
                          <InputGroupInput
                            stepper
                            min="0"
                            step="1"
                            placeholder="0"
                            value={orderInput}
                            onChange={(e) => handleOrderInputChange(e.target.value)}
                          />
                      </InputGroup>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
});

export default FlexChildControls;
