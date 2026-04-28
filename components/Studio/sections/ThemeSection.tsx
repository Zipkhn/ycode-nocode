'use client';

import React from 'react';
import { StudioTable, type StudioRow, type StudioMode } from '../StudioTable';
import { resolveVarToHex } from '../utils/color-utils';
import type { StudioVariablesHook } from '../hooks/useStudioVariables';

interface Props { hook: StudioVariablesHook }

const THEME_ROWS: StudioRow[] = [
  { key: 'background',   label: 'Background',    type: 'color' },
  { key: 'background-2', label: 'Background 2',  type: 'color' },
  { key: 'text-main',    label: 'Text',          type: 'color' },
  { key: 'text-heading', label: 'Text Heading',  type: 'color' },
  { key: 'text-muted',   label: 'Text Muted',    type: 'color' },
  { key: 'border',       label: 'Border',        type: 'color' },
  { key: 'accent',       label: 'Accent',        type: 'color' },
];

const THEME_MODES: StudioMode[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark',  label: 'Dark'  },
];

export function ThemeSection({ hook }: Props) {
  const { variables, setVar } = hook;

  const getValue = (rowKey: string, modeId: string) => {
    const cssKey = `theme-${modeId}--${rowKey}`;
    const raw = variables[cssKey] ?? '';
    return raw.startsWith('var(') ? resolveVarToHex(raw, variables) || raw : raw;
  };

  const handleChange = (rowKey: string, modeId: string, value: string) =>
    setVar(`theme-${modeId}--${rowKey}`, value);

  return (
    <StudioTable
      rows={THEME_ROWS}
      modes={THEME_MODES}
      getValue={getValue}
      onValueChange={handleChange}
      searchable={false}
    />
  );
}
