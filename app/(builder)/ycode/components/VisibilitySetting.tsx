'use client';

/**
 * Visibility Setting
 *
 * Visible / Hidden toggle for a layer's `settings.hidden` flag.
 * Same flag the layers tree eye icon and Shift+Cmd+H toggle, surfaced in the
 * Settings tab so it can be found without hunting through the tree.
 */

import React from 'react';

import { Label } from '@/components/ui/label';
import ToggleGroup from './ToggleGroup';

import type { Layer } from '@/types';

interface VisibilitySettingProps {
  layer: Layer;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
  disabled?: boolean;
}

const VISIBILITY_OPTIONS = [
  { label: 'Visible', value: false },
  { label: 'Hidden', value: true },
];

export default function VisibilitySetting({
  layer,
  onLayerUpdate,
  disabled = false,
}: VisibilitySettingProps) {
  const isHidden = layer.settings?.hidden ?? false;

  const handleChange = (value: string | boolean) => {
    const hidden = value === true;
    if (hidden === isHidden) return;
    onLayerUpdate(layer.id, {
      settings: { ...layer.settings, hidden },
    });
  };

  return (
    <div className="grid grid-cols-3">
      <Label variant="muted">Visibility</Label>
      <div className="col-span-2 *:w-full">
        <ToggleGroup
          options={VISIBILITY_OPTIONS}
          value={isHidden}
          onChange={handleChange}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
