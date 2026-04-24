'use client';

import { useCallback, memo, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import Icon from '@/components/ui/icon';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useEditorStore } from '@/stores/useEditorStore';
import type { Layer } from '@/types';
import MarginPadding from './MarginPadding';
import SettingsPanel from './SettingsPanel';

interface SpacingControlsProps {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
  activeTextStyleKey?: string | null;
}

type SpacingProperty = 'marginTop' | 'marginRight' | 'marginBottom' | 'marginLeft' | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';

const STUDIO_TOKENS = [
  { key: 'space-0',   label: '0'   },
  { key: 'space-3xs', label: '3XS' },
  { key: 'space-2xs', label: '2XS' },
  { key: 'space-xs',  label: 'XS'  },
  { key: 'space-s',   label: 'S'   },
  { key: 'space-m',   label: 'M'   },
  { key: 'space-l',   label: 'L'   },
  { key: 'space-xl',  label: 'XL'  },
  { key: 'space-2xl', label: '2XL' },
  { key: 'space-3xl', label: '3XL' },
] as const;

const SpacingControls = memo(function SpacingControls({ layer, onLayerUpdate, activeTextStyleKey }: SpacingControlsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [focusedField, setFocusedField] = useState<SpacingProperty>('paddingTop');
  const focusedFieldRef = useRef<SpacingProperty>('paddingTop');
  const { activeBreakpoint, activeUIState } = useEditorStore();
  const { debouncedUpdateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
    activeTextStyleKey,
  });

  const marginTop    = getDesignProperty('spacing', 'marginTop') || '';
  const marginRight  = getDesignProperty('spacing', 'marginRight') || '';
  const marginBottom = getDesignProperty('spacing', 'marginBottom') || '';
  const marginLeft   = getDesignProperty('spacing', 'marginLeft') || '';
  const paddingTop    = getDesignProperty('spacing', 'paddingTop') || '';
  const paddingRight  = getDesignProperty('spacing', 'paddingRight') || '';
  const paddingBottom = getDesignProperty('spacing', 'paddingBottom') || '';
  const paddingLeft   = getDesignProperty('spacing', 'paddingLeft') || '';

  const handleChange = useCallback((property: SpacingProperty, value: string) => {
    debouncedUpdateDesignProperty('spacing', property, value || null);
  }, [debouncedUpdateDesignProperty]);

  const handleMarginAuto = useCallback(() => {
    handleChange('marginLeft', 'auto');
    handleChange('marginRight', 'auto');
  }, [handleChange]);

  const values = { marginTop, marginRight, marginBottom, marginLeft, paddingTop, paddingRight, paddingBottom, paddingLeft };

  return (
    <SettingsPanel
      title="Spacing"
      isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              onClick={handleMarginAuto}
              variant="ghost"
              size="xs"
            >
              <Icon name="center-block" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Center element horizontally.
          </TooltipContent>
        </Tooltip>
      }
    >
      <MarginPadding
        values={values}
        onChange={handleChange}
        onFocus={(property) => { focusedFieldRef.current = property; setFocusedField(property); }}
      />

      {/* Studio spacing token strip */}
      <div className="mt-2 pt-2 border-t border-border/60">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Studio tokens</span>
          <span className="text-[9px] text-muted-foreground/60 italic">→ {focusedField}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {STUDIO_TOKENS.map(({ key, label }) => {
            const currentValue = values[focusedFieldRef.current];
            const isActive = currentValue === key;
            return (
              <button
                key={key}
                onClick={() => handleChange(focusedFieldRef.current, isActive ? '' : key)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                }`}
                title={`Appliquer ${key} à ${focusedFieldRef.current}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </SettingsPanel>
  );
});
export default SpacingControls;
