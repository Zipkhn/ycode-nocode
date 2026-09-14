'use client';

import React, { memo } from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import SettingsPanel from './SettingsPanel';
import { useControlledInput } from '@/hooks/use-controlled-input';
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

/** Tailwind only ships `col-span-1` … `col-span-12` and `col-span-full` */
const MAX_SPAN = 12;

/** Stored span → input text; `auto` is the browser default so the field stays empty */
function toInputValue(value: string): string {
  if (!value || value === 'auto') return '';
  return value === 'full' ? 'Full' : value;
}

/** Input text → stored span, or `undefined` while the text is not a valid span yet */
function parseSpan(text: string): string | null | undefined {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === '') return null;
  if (trimmed === 'full') return 'full';
  if (/^\d{1,2}$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n >= 1 && n <= MAX_SPAN) return String(n);
  }
  return undefined;
}

/**
 * Compact span field with an X/Y prefix (same treatment as the Gap inputs).
 * Accepts 1–12 or "full"; empty means auto (one cell).
 */
function SpanInput({ axis, value, onChange }: {
  axis: 'X' | 'Y';
  value: string;
  onChange: (value: string | null) => void;
}) {
  const [input, setInput] = useControlledInput(value, toInputValue, false);

  const handleChange = (text: string) => {
    setInput(text);
    const parsed = parseSpan(text);
    // Partial input like "fu" is kept locally and only committed once valid
    if (parsed !== undefined) onChange(parsed);
  };

  return (
    <InputGroup>
      <InputGroupAddon className="pl-1.5 text-[10px] opacity-50">{axis}</InputGroupAddon>
      <InputGroupInput
        type="text"
        inputMode="numeric"
        placeholder="Auto"
        aria-label={axis === 'X' ? 'Column span' : 'Row span'}
        className="px-1!"
        value={input}
        onChange={(e) => handleChange(e.target.value)}
      />
    </InputGroup>
  );
}

/**
 * "Grid child" section: how many columns (X) and rows (Y) this layer spans inside
 * its grid parent. Renders nothing when the parent is not a grid container.
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

  // Span classes are stored under the `sizing` category (col-span-* / row-span-*)
  const columnSpan = getDesignProperty('sizing', 'gridColumnSpan') || '';
  const rowSpan = getDesignProperty('sizing', 'gridRowSpan') || '';

  if (!layer || !isGrid) return null;

  return (
    <SettingsPanel
      title="Grid child"
      isOpen
      onToggle={noop}
    >
      <div className="grid grid-cols-3">
        <Label variant="muted">Span</Label>
        <div className="col-span-2 grid grid-cols-2 gap-2">
          <SpanInput
            axis="X"
            value={columnSpan}
            onChange={(value) => updateDesignProperty('sizing', 'gridColumnSpan', value)}
          />
          <SpanInput
            axis="Y"
            value={rowSpan}
            onChange={(value) => updateDesignProperty('sizing', 'gridRowSpan', value)}
          />
        </div>
      </div>
    </SettingsPanel>
  );
});

export default GridChildControls;
