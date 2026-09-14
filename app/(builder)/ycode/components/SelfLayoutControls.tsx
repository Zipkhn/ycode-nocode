'use client';

import { memo } from 'react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Icon from '@/components/ui/icon';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useEditorStore } from '@/stores/useEditorStore';
import type { Layer } from '@/types';

interface AlignSelfRowProps {
  layer: Layer | null;
  parentLayer?: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

const noop = () => {};

/**
 * Resolve the parent's layout (with breakpoint/state inheritance). Align-self
 * only applies inside a flex/grid parent, and its axis follows the parent's
 * flex direction, not this layer's.
 */
function useParentLayout(parentLayer: Layer | null) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { getDesignProperty } = useDesignSync({
    layer: parentLayer,
    onLayerUpdate: noop,
    activeBreakpoint,
    activeUIState,
  });

  const display = parentLayer ? (getDesignProperty('layout', 'display') || '') : '';
  const flexDirection = getDesignProperty('layout', 'flexDirection') || 'row';
  const isFlex = display === 'flex' || display === 'inline-flex';
  const isGrid = display === 'grid' || display === 'inline-grid';

  return {
    isFlexOrGrid: isFlex || isGrid,
    isColumnAxis: isFlex && (flexDirection === 'column' || flexDirection === 'column-reverse'),
  };
}

/**
 * "Align self" row (align-self) for a child of a flex/grid container.
 * Renders nothing when the parent is not a flex/grid container.
 */
export const AlignSelfRow = memo(function AlignSelfRow({ layer, parentLayer = null, onLayerUpdate }: AlignSelfRowProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { updateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
  });
  const { isFlexOrGrid, isColumnAxis } = useParentLayout(parentLayer);

  if (!isFlexOrGrid) return null;

  const alignSelf = getDesignProperty('layout', 'alignSelf') || 'auto';

  // 'auto' clears the override to keep classes clean
  const handleAlignSelfChange = (value: string) => {
    updateDesignProperty('layout', 'alignSelf', value === 'auto' ? null : value);
  };

  const iconClassName = isColumnAxis ? '-rotate-90' : '';

  return (
    <div className="grid grid-cols-3">
        <Label variant="muted">Align self</Label>
        <div className="col-span-2">
            <Tabs
              value={alignSelf}
              onValueChange={handleAlignSelfChange}
              className="w-full"
            >
                <TabsList className="w-full">
                    <TabsTrigger value="auto">Auto</TabsTrigger>
                    <TabsTrigger value="start">
                        <Icon name="alignStart" className={iconClassName} />
                    </TabsTrigger>
                    <TabsTrigger value="center">
                        <Icon name="alignCenter" className={iconClassName} />
                    </TabsTrigger>
                    <TabsTrigger value="end">
                        <Icon name="alignEnd" className={iconClassName} />
                    </TabsTrigger>
                    <TabsTrigger value="stretch">
                        <Icon name="alignStretch" className={iconClassName} />
                    </TabsTrigger>
                </TabsList>
            </Tabs>
        </div>
    </div>
  );
});

/**
 * Standalone "Layout" section holding only the Align self row. Used for
 * layers without their own Layout panel (text, images) so they can still
 * override alignment inside a flex/grid parent. Layers with a Layout panel
 * embed the same row there (see LayoutControls).
 */
const SelfLayoutControls = memo(function SelfLayoutControls({ layer, parentLayer = null, onLayerUpdate }: AlignSelfRowProps) {
  const { isFlexOrGrid } = useParentLayout(parentLayer);

  if (!layer || !isFlexOrGrid) return null;

  return (
    <div className="py-5">
      <header className="py-4 -mt-4">
        <Label>Layout</Label>
      </header>
      <AlignSelfRow
        layer={layer}
        parentLayer={parentLayer}
        onLayerUpdate={onLayerUpdate}
      />
    </div>
  );
});

export default SelfLayoutControls;
