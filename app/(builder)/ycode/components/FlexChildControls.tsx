'use client';

import { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useParentLayout } from '@/hooks/use-parent-layout';
import { useEditorStore } from '@/stores/useEditorStore';
import type { Layer } from '@/types';

interface FlexChildControlsProps {
  layer: Layer | null;
  parentLayer?: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

/** Sentinel for "no class set" in selects (Radix Select disallows an empty string value) */
const DEFAULT_VALUE = 'default';

const FLEX_OPTIONS = [
  { value: DEFAULT_VALUE, label: 'Default' },
  { value: '1', label: 'Expand' },
  { value: 'auto', label: 'Auto' },
  { value: 'initial', label: 'Initial' },
  { value: 'none', label: 'None' },
];

const ORDER_OPTIONS = [
  { value: DEFAULT_VALUE, label: 'Default' },
  { value: 'first', label: 'First' },
  { value: 'last', label: 'Last' },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

/** Yes/No toggle bound to a '1' | '0' design value */
function BooleanRow({ label, value, onChange }: {
  label: string;
  value: '1' | '0';
  onChange: (value: '1' | '0') => void;
}) {
  return (
    <div className="grid grid-cols-3">
        <Label variant="muted">{label}</Label>
        <div className="col-span-2">
            <Tabs
              value={value}
              onValueChange={(next) => onChange(next as '1' | '0')}
              className="w-full"
            >
                <TabsList className="w-full">
                    <TabsTrigger value="1">Yes</TabsTrigger>
                    <TabsTrigger value="0">No</TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    </div>
  );
}

/**
 * "Flex child" section: how this layer behaves inside its flex parent
 * (flex shorthand, grow/shrink, order). Renders nothing when the parent
 * is not a flex container.
 */
const FlexChildControls = memo(function FlexChildControls({ layer, parentLayer = null, onLayerUpdate }: FlexChildControlsProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { updateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
  });
  const { isFlex } = useParentLayout(parentLayer);

  if (!layer || !isFlex) return null;

  const flex = getDesignProperty('layout', 'flex') || DEFAULT_VALUE;
  // Browser defaults: flex-grow 0, flex-shrink 1
  const flexGrow = getDesignProperty('layout', 'flexGrow') === '1' ? '1' : '0';
  const flexShrink = getDesignProperty('layout', 'flexShrink') === '0' ? '0' : '1';
  const order = getDesignProperty('layout', 'order') || DEFAULT_VALUE;

  const handleFlexChange = (value: string) => {
    updateDesignProperty('layout', 'flex', value === DEFAULT_VALUE ? null : value);
  };

  const handleOrderChange = (value: string) => {
    updateDesignProperty('layout', 'order', value === DEFAULT_VALUE ? null : value);
  };

  return (
    <div className="py-5">
      <header className="py-4 -mt-4">
        <Label>Flex child</Label>
      </header>
      <div className="flex flex-col gap-2">
          <div className="grid grid-cols-3">
              <Label variant="muted">Flex</Label>
              <div className="col-span-2">
                  <Select value={flex} onValueChange={handleFlexChange}>
                      <SelectTrigger>
                          <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectGroup>
                              {FLEX_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                          </SelectGroup>
                      </SelectContent>
                  </Select>
              </div>
          </div>

          <BooleanRow
            label="Grow"
            value={flexGrow}
            onChange={(value) => updateDesignProperty('layout', 'flexGrow', value)}
          />

          <BooleanRow
            label="Shrink"
            value={flexShrink}
            onChange={(value) => updateDesignProperty('layout', 'flexShrink', value)}
          />

          <div className="grid grid-cols-3">
              <Label variant="muted">Order</Label>
              <div className="col-span-2">
                  <Select value={order} onValueChange={handleOrderChange}>
                      <SelectTrigger>
                          <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectGroup>
                              {ORDER_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                              ))}
                          </SelectGroup>
                      </SelectContent>
                  </Select>
              </div>
          </div>
      </div>
    </div>
  );
});

export default FlexChildControls;
