'use client';

import { memo, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import Icon from '@/components/ui/icon';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import IconTabs, { type IconOption } from './IconTabs';
import SettingsPanel from './SettingsPanel';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useParentLayout } from '@/hooks/use-parent-layout';
import { useEditorStore } from '@/stores/useEditorStore';
import type { Layer } from '@/types';

const noop = () => {};

interface FlexChildControlsProps {
  layer: Layer | null;
  parentLayer?: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

/** Sizing presets, one per Tailwind `flex-*` utility (legacy: Initial / Expand / Auto / None) */
type Sizing = 'shrink' | 'grow' | 'auto' | 'fixed';
type OrderMode = 'default' | 'first' | 'last' | 'custom';

const SIZING_OPTIONS: IconOption<Sizing>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'shrink', icon: 'minSize', label: 'Shrink if needed' },
  { value: 'grow', icon: 'maxSize', label: 'Grow equally' },
  { value: 'fixed', icon: 'flex-fixed', label: "Don't shrink or grow" },
];

/** Preset → `flex` shorthand (initial = 0 1 auto, 1 = 1 1 0%, auto = 1 1 auto, none = 0 0 auto) */
const SIZING_FLEX_VALUE: Record<Sizing, string> = {
  shrink: 'initial',
  grow: '1',
  auto: 'auto',
  fixed: 'none',
};

/** Optional per-child override of the parent's Align; added via "+" and removed with "x" */
type AlignSelf = 'start' | 'center' | 'end' | 'stretch';

const ALIGN_SELF_OPTIONS: IconOption<AlignSelf>[] = [
  { value: 'start', icon: 'alignStart', label: 'Start' },
  { value: 'center', icon: 'alignCenter', label: 'Center' },
  { value: 'end', icon: 'alignEnd', label: 'End' },
  { value: 'stretch', icon: 'alignStretch', label: 'Stretch' },
];

const ORDER_OPTIONS: IconOption<OrderMode>[] = [
  { value: 'default', icon: 'x', label: 'Default' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  { value: 'custom', icon: 'more', label: 'Custom' },
];

/**
 * Map the layer's flex classes to a preset. Individual grow/shrink classes
 * (from imports or the AI) have no preset, so no tab is selected for them.
 */
function resolveSizing(flex: string, hasIndividual: boolean): Sizing | '' {
  if (flex === '1') return 'grow';
  if (flex === 'auto') return 'auto';
  if (flex === 'none') return 'fixed';
  if (hasIndividual) return '';
  return 'shrink';
}

/** `self-auto`/`self-baseline` have no tab, so they select nothing rather than a wrong option */
function resolveAlignSelf(alignSelf: string): AlignSelf | '' {
  return ALIGN_SELF_OPTIONS.some((option) => option.value === alignSelf) ? (alignSelf as AlignSelf) : '';
}

function resolveOrderMode(order: string, forceCustom: boolean): OrderMode {
  if (order === 'first' || order === 'last') return order;
  if (/^\d+$/.test(order) || forceCustom) return 'custom';
  return 'default';
}

/**
 * "Flex child" section: how this layer behaves inside its flex parent
 * (sizing preset, order, optional align override). Renders nothing when the parent
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
  const { isFlex, isColumnAxis } = useParentLayout(parentLayer);

  const flex = getDesignProperty('layout', 'flex') || '';
  const flexGrowRaw = getDesignProperty('layout', 'flexGrow') || '';
  const flexShrinkRaw = getDesignProperty('layout', 'flexShrink') || '';
  const alignSelfRaw = getDesignProperty('layout', 'alignSelf') || '';
  const order = getDesignProperty('layout', 'order') || '';

  // Custom order can be chosen before a number is typed
  const [isCustomOrder, setIsCustomOrder] = useState(false);
  const [orderInput, setOrderInput] = useState(/^\d+$/.test(order) ? order : '');

  useEffect(() => {
    setIsCustomOrder(false);
  }, [layer?.id]);

  useEffect(() => {
    setOrderInput(/^\d+$/.test(order) ? order : '');
  }, [order]);

  if (!layer || !isFlex) return null;

  const sizing = resolveSizing(flex, Boolean(flexGrowRaw || flexShrinkRaw));
  const alignSelf = resolveAlignSelf(alignSelfRaw);
  const orderMode = resolveOrderMode(order, isCustomOrder);

  const hasAlignSelf = Boolean(alignSelfRaw);

  const handleAlignSelfChange = (value: AlignSelf | null) => {
    updateDesignProperties([{ category: 'layout', property: 'alignSelf', value }]);
  };

  // A preset replaces any individual grow/shrink classes so the two never conflict
  const handleSizingChange = (next: Sizing) => {
    updateDesignProperties([
      { category: 'layout', property: 'flex', value: SIZING_FLEX_VALUE[next] },
      { category: 'layout', property: 'flexGrow', value: null },
      { category: 'layout', property: 'flexShrink', value: null },
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
    <SettingsPanel
      title="Flex child"
      isOpen
      onToggle={noop}
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost" size="xs"
              aria-label="Add flex child option"
            >
              <Icon name="plus" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => handleAlignSelfChange('start')}
              disabled={hasAlignSelf}
            >
              Align
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
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

      {hasAlignSelf && (
        <div className="grid grid-cols-3">
          <Label variant="muted">Align</Label>
          <div className="col-span-2 flex items-center gap-2">
            <div className="flex-1">
              <IconTabs
                value={alignSelf}
                options={ALIGN_SELF_OPTIONS}
                onChange={handleAlignSelfChange}
                iconClassName={isColumnAxis ? '-rotate-90' : undefined}
              />
            </div>
            <button
              type="button"
              aria-label="Remove align override"
              className="p-0.5 rounded-sm opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
              onClick={() => handleAlignSelfChange(null)}
            >
              <Icon name="x" className="size-2.5" />
            </button>
          </div>
        </div>
      )}
    </SettingsPanel>
  );
});

export default FlexChildControls;
