'use client';

import React, { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsPanel from './SettingsPanel';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useParentLayout } from '@/hooks/use-parent-layout';
import { useEditorStore } from '@/stores/useEditorStore';
import type { Layer } from '@/types';

const noop = () => {};

interface GridChildControlsProps {
  layer: Layer | null;
  parentLayer?: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

/** Sentinel for "no span class" — Radix Select cannot use an empty string as an item value */
const AUTO = 'auto';

const SPAN_VALUES = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', 'full'];

/** `col-span-N` / `row-span-N` picker; unset shows "Auto" (the browser default of one cell) */
function SpanSelect({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="grid grid-cols-3">
      <Label variant="muted">{label}</Label>
      <div className="col-span-2">
        <Select
          value={value || AUTO}
          onValueChange={(next) => onChange(next === AUTO ? null : next)}
        >
          <SelectTrigger aria-label={`${label} span`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={AUTO}>Auto</SelectItem>
              {SPAN_VALUES.map((span) => (
                <SelectItem key={span} value={span}>
                  {span === 'full' ? 'Full' : span}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/**
 * "Grid child" section: how many columns and rows this layer spans inside its
 * grid parent. Renders nothing when the parent is not a grid container.
 */
const GridChildControls = memo(function GridChildControls({ layer, parentLayer = null, onLayerUpdate }: GridChildControlsProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { updateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
  });
  const { isGrid } = useParentLayout(parentLayer);

  if (!layer || !isGrid) return null;

  // Span classes are stored under the `sizing` category (col-span-* / row-span-*)
  const columnSpan = getDesignProperty('sizing', 'gridColumnSpan') || '';
  const rowSpan = getDesignProperty('sizing', 'gridRowSpan') || '';

  return (
    <SettingsPanel
      title="Grid child"
      isOpen
      onToggle={noop}
    >
      <SpanSelect
        label="Columns"
        value={columnSpan === AUTO ? '' : columnSpan}
        onChange={(value) => updateDesignProperty('sizing', 'gridColumnSpan', value)}
      />
      <SpanSelect
        label="Rows"
        value={rowSpan === AUTO ? '' : rowSpan}
        onChange={(value) => updateDesignProperty('sizing', 'gridRowSpan', value)}
      />
    </SettingsPanel>
  );
});

export default GridChildControls;
