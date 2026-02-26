'use client';

/**
 * Shared component for rendering component variable override controls.
 * Used in both the RightSidebar (component instance panel) and
 * RichTextComponentBlock (inline rich-text component).
 */

import React, { useCallback } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import ImageSettings from './ImageSettings';
import LinkSettings from './LinkSettings';
import AudioSettings from './AudioSettings';
import VideoSettings from './VideoSettings';
import IconSettings from './IconSettings';
import {
  extractTiptapFromComponentVariable,
  createTextComponentVariableValue,
} from '@/lib/variable-utils';
import type {
  ComponentVariable,
  ImageSettingsValue,
  LinkSettingsValue,
  AudioSettingsValue,
  VideoSettingsValue,
  IconSettingsValue,
  Layer,
  CollectionField,
  Collection,
} from '@/types';
import type { FieldGroup } from '@/lib/collection-field-utils';

type Overrides = Layer['componentOverrides'];

interface ComponentVariableOverridesProps {
  variables: ComponentVariable[];
  componentOverrides: Overrides;
  onOverridesChange: (overrides: Overrides) => void;
  fieldGroups?: FieldGroup[];
  allFields?: Record<string, CollectionField[]>;
  collections?: Collection[];
  isInsideCollectionLayer?: boolean;
  /** Custom renderer for text variable overrides (avoids circular dependency with RichTextEditor). */
  renderTextOverride?: (
    variable: ComponentVariable,
    value: any,
    onChange: (tiptapContent: any) => void,
  ) => React.ReactNode;
  /** Number of columns for the override layout (default: 1) */
  columns?: 1 | 2;
}

export default function ComponentVariableOverrides({
  variables,
  componentOverrides,
  onOverridesChange,
  fieldGroups,
  allFields,
  collections,
  isInsideCollectionLayer,
  renderTextOverride,
  columns = 1,
}: ComponentVariableOverridesProps) {
  const handleTextChange = useCallback(
    (variableId: string, tiptapContent: any) => {
      const value = createTextComponentVariableValue(tiptapContent);
      onOverridesChange({
        ...componentOverrides,
        text: { ...(componentOverrides?.text ?? {}), [variableId]: value },
      });
    },
    [componentOverrides, onOverridesChange],
  );

  const handleTypedChange = useCallback(
    (category: keyof NonNullable<Overrides>, variableId: string, value: any) => {
      onOverridesChange({
        ...componentOverrides,
        [category]: { ...(componentOverrides?.[category] ?? {}), [variableId]: value },
      });
    },
    [componentOverrides, onOverridesChange],
  );

  const getTextValue = useCallback(
    (variableId: string) => {
      const override = componentOverrides?.text?.[variableId];
      const def = variables.find(v => v.id === variableId)?.default_value;
      return extractTiptapFromComponentVariable(override ?? def);
    },
    [componentOverrides, variables],
  );

  const getTypedValue = useCallback(
    (category: 'image' | 'link' | 'audio' | 'video' | 'icon', variableId: string) => {
      const override = componentOverrides?.[category]?.[variableId];
      const def = variables.find(v => v.id === variableId)?.default_value;
      return override ?? def;
    },
    [componentOverrides, variables],
  );

  if (variables.length === 0) return null;

  const isTwoCol = columns === 2;

  /** Renders a group of variable items, using masonry-style columns when 2-col is enabled. */
  const renderGroup = (items: React.ReactNode[], key: string) => {
    if (!isTwoCol) {
      return <div key={key} className="flex flex-col gap-3">{items}</div>;
    }

    return (
      <div
        key={key}
        className="columns-2 gap-x-10 [column-rule:1px_solid_var(--color-border)] [column-fill:balance]"
      >
        {items.map((item, i) => (
          <div key={i} className="break-inside-avoid mb-5">{item}</div>
        ))}
      </div>
    );
  };

  const renderItem = (variable: ComponentVariable) => {
    const label = (
      <Label variant="muted" className="truncate pt-2">
        {variable.name}
      </Label>
    );

    switch (variable.type) {
      case 'image':
        return (
          <div key={variable.id} className="grid grid-cols-3 gap-2 items-start">
            {label}
            <div className="col-span-2">
              <ImageSettings
                mode="standalone"
                value={getTypedValue('image', variable.id) as ImageSettingsValue | undefined}
                onChange={(val) => handleTypedChange('image', variable.id, val)}
                fieldGroups={fieldGroups}
                allFields={allFields}
                collections={collections}
              />
            </div>
          </div>
        );
      case 'link':
        return (
          <div key={variable.id} className="grid grid-cols-3 gap-2 items-start">
            {label}
            <div className="col-span-2">
              <LinkSettings
                mode="standalone"
                value={getTypedValue('link', variable.id) as LinkSettingsValue | undefined}
                onChange={(val) => handleTypedChange('link', variable.id, val)}
                fieldGroups={fieldGroups}
                allFields={allFields}
                collections={collections}
                isInsideCollectionLayer={isInsideCollectionLayer}
              />
            </div>
          </div>
        );
      case 'audio':
        return (
          <div key={variable.id} className="grid grid-cols-3 gap-2 items-start">
            {label}
            <div className="col-span-2">
              <AudioSettings
                mode="standalone"
                value={getTypedValue('audio', variable.id) as AudioSettingsValue | undefined}
                onChange={(val) => handleTypedChange('audio', variable.id, val)}
                fieldGroups={fieldGroups}
                allFields={allFields}
                collections={collections}
              />
            </div>
          </div>
        );
      case 'video':
        return (
          <div key={variable.id} className="grid grid-cols-3 gap-2 items-start">
            {label}
            <div className="col-span-2">
              <VideoSettings
                mode="standalone"
                value={getTypedValue('video', variable.id) as VideoSettingsValue | undefined}
                onChange={(val) => handleTypedChange('video', variable.id, val)}
                fieldGroups={fieldGroups}
                allFields={allFields}
                collections={collections}
              />
            </div>
          </div>
        );
      case 'icon':
        return (
          <div key={variable.id} className="grid grid-cols-3 gap-2 items-start">
            {label}
            <div className="col-span-2">
              <IconSettings
                mode="standalone"
                value={getTypedValue('icon', variable.id) as IconSettingsValue | undefined}
                onChange={(val) => handleTypedChange('icon', variable.id, val)}
              />
            </div>
          </div>
        );
      default:
        return (
          <div key={variable.id} className="grid grid-cols-3 gap-2 items-start">
            {label}
            <div className="col-span-2 min-w-0 *:w-full">
              {renderTextOverride
                ? renderTextOverride(
                  variable,
                  getTextValue(variable.id),
                  (val) => handleTextChange(variable.id, val),
                )
                : null}
            </div>
          </div>
        );
    }
  };

  const allItems = variables.map(renderItem);

  return renderGroup(allItems, 'all');
}
