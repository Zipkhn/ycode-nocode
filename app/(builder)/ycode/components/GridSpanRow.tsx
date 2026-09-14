'use client';

import React from 'react';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { Label } from '@/components/ui/label';
import { useControlledInput } from '@/hooks/use-controlled-input';
import { useEditorStore } from '@/stores/useEditorStore';
import { getInheritedValue } from '@/lib/tailwind-class-mapper';
import type { Breakpoint, Layer, UIState } from '@/types';

/** Tailwind only ships `col-span-1` … `col-span-12` and `col-span-full` */
const MAX_SPAN = 12;

type SpanProperty = 'gridColumnSpan' | 'gridRowSpan';

/** Stored span → input text. No class (or `auto`) is the browser default of one cell, shown as "1". */
function toInputValue(value: string): string {
  if (!value || value === 'auto') return '1';
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
 * True when a wider breakpoint (or the neutral state) already sets this property, so an
 * explicit class is needed at the current breakpoint to override it.
 */
function inheritsFromWiderBreakpoint(layer: Layer, property: SpanProperty, breakpoint: Breakpoint, uiState: UIState): boolean {
  const classes = Array.isArray(layer.classes)
    ? layer.classes
    : (layer.classes || '').split(' ').filter(Boolean);
  const { value, source } = getInheritedValue(classes, property, breakpoint, uiState);
  return Boolean(value) && source !== breakpoint;
}

interface GridSpanRowProps {
  label: string;
  layer: Layer;
  property: SpanProperty;
  /** Resolved span for the current breakpoint/state ('' when unset) */
  value: string;
  onChange: (property: SpanProperty, value: string | null) => void;
}

/**
 * One "Col span" / "Row span" row for a grid child. Shows 1 when unset (the browser
 * default) and accepts 1–12 or "full".
 */
export default function GridSpanRow({ label, layer, property, value, onChange }: GridSpanRowProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const [input, setInput] = useControlledInput(value, toInputValue, false);

  const handleChange = (text: string) => {
    setInput(text);
    const parsed = parseSpan(text);
    // Partial input like "fu" is kept locally and only committed once valid
    if (parsed === undefined) return;

    // A span of 1 is the default, so it is stored as "no class" — unless a wider breakpoint
    // spans more, in which case `col-span-1` is a real override and must be written.
    const isDefault = parsed === '1' && !inheritsFromWiderBreakpoint(layer, property, activeBreakpoint, activeUIState);
    onChange(property, isDefault ? null : parsed);
  };

  // Leaving the field empty or with junk snaps it back to what actually applies
  const handleBlur = () => {
    if (parseSpan(input) === undefined || input.trim() === '') {
      setInput(toInputValue(value));
    }
  };

  return (
    <div className="grid grid-cols-3">
      <Label variant="muted">{label}</Label>
      <div className="col-span-2">
        <InputGroup>
          <InputGroupInput
            stepper
            type="text"
            inputMode="numeric"
            min="1"
            max={String(MAX_SPAN)}
            step="1"
            aria-label={property === 'gridColumnSpan' ? 'Column span' : 'Row span'}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
          />
        </InputGroup>
      </div>
    </div>
  );
}
