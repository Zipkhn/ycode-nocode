'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import Icon from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlignSelfRow } from './SelfLayoutControls';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useControlledInputs } from '@/hooks/use-controlled-input';
import { useModeToggle } from '@/hooks/use-mode-toggle';
import { useEditorStore } from '@/stores/useEditorStore';
import { extractMeasurementValue } from '@/lib/measurement-utils';
import { removeSpaces } from '@/lib/utils';
import type { Layer } from '@/types';

interface LayoutControlsProps {
  layer: Layer | null;
  parentLayer?: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

/** Display mode of the layer itself (maps to CSS `display`) */
type LayoutType = 'block' | 'flex' | 'grid' | 'hidden';
/** Flex main axis (maps to CSS `flex-direction`) */
type FlexDirection = 'horizontal' | 'vertical';

interface IconOption<T extends string> {
  value: T;
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
}

const LAYOUT_TYPE_OPTIONS: IconOption<LayoutType>[] = [
  { value: 'block', icon: 'block', label: 'Block' },
  { value: 'flex', icon: 'columns', label: 'Flex' },
  { value: 'grid', icon: 'grid', label: 'Grid' },
  { value: 'hidden', icon: 'square-dashed', label: 'None' },
];

const FLEX_DIRECTION_OPTIONS: IconOption<FlexDirection>[] = [
  { value: 'horizontal', icon: 'arrow-horizontal', label: 'Horizontal' },
  { value: 'vertical', icon: 'arrow-vertical', label: 'Vertical' },
];

/** Icon-only tab group with a tooltip per option */
function IconTabs<T extends string>({ value, options, onChange }: {
  value: T;
  options: IconOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className="w-full"
    >
        <TabsList className="w-full">
            {options.map((option) => (
              <Tooltip key={option.value}>
                  {/* Wrap in a span: Tooltip and Tabs both write `data-state`, so
                      sharing one element via asChild would drop the active tab style */}
                  <TooltipTrigger asChild>
                      <span className="flex flex-1 h-full">
                          <TabsTrigger
                            value={option.value}
                            aria-label={option.label}
                          >
                              <Icon name={option.icon} />
                          </TabsTrigger>
                      </span>
                  </TooltipTrigger>
                  <TooltipContent>
                      <p>{option.label}</p>
                  </TooltipContent>
              </Tooltip>
            ))}
        </TabsList>
    </Tabs>
  );
}

const LayoutControls = memo(function LayoutControls({ layer, parentLayer = null, onLayerUpdate }: LayoutControlsProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { updateDesignProperty, updateDesignProperties, debouncedUpdateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
  });

  // Get current values from layer (with inheritance)
  const display = getDesignProperty('layout', 'display') || '';
  const flexDirection = getDesignProperty('layout', 'flexDirection') || 'row';
  const alignItems = getDesignProperty('layout', 'alignItems') || '';
  const justifyContent = getDesignProperty('layout', 'justifyContent') || 'start';
  const flexWrap = getDesignProperty('layout', 'flexWrap') || 'nowrap';
  const gap = getDesignProperty('layout', 'gap') || '';
  const columnGap = getDesignProperty('layout', 'columnGap') || '';
  const rowGap = getDesignProperty('layout', 'rowGap') || '';
  const gridCols = getDesignProperty('layout', 'gridTemplateColumns') || '';
  const gridRows = getDesignProperty('layout', 'gridTemplateRows') || '';

  // Extract number from grid template: "repeat(2, 1fr)" → "2"
  const extractGridNumber = (value: string): string => {
    if (!value) return '';
    // Match repeat(N, 1fr) pattern (with space or underscore)
    const match = value.match(/^repeat\((\d+),[\s_]*1fr\)$/);
    return match ? match[1] : '';
  };

  // Convert number to grid template: "2" → "repeat(2, 1fr)"
  const numberToGridTemplate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    // Only accept numbers
    if (!/^\d+$/.test(trimmed)) return null;
    return `repeat(${trimmed}, 1fr)`;
  };

  // Local state for grid inputs (number only)
  const [gridColsInput, setGridColsInput] = useState(extractGridNumber(gridCols));
  const [gridRowsInput, setGridRowsInput] = useState(extractGridNumber(gridRows));

  // Sync local state when layer values change
  useEffect(() => {
    setGridColsInput(extractGridNumber(gridCols));
  }, [gridCols]);

  useEffect(() => {
    setGridRowsInput(extractGridNumber(gridRows));
  }, [gridRows]);

  // Local controlled inputs (prevents repopulation bug)
  const inputs = useControlledInputs({
    gap,
    columnGap,
    rowGap,
  }, extractMeasurementValue);

  const [gapInput, setGapInput] = inputs.gap;
  const [columnGapInput, setColumnGapInput] = inputs.columnGap;
  const [rowGapInput, setRowGapInput] = inputs.rowGap;

  // Use mode toggle hook for gap
  const gapModeToggle = useModeToggle({
    category: 'layout',
    unifiedProperty: 'gap',
    individualProperties: ['columnGap', 'rowGap'],
    modeProperty: 'gapMode', // Store the mode preference in layer JSON
    updateDesignProperty,
    updateDesignProperties,
    // Don't wrap in useCallback - let it recreate on every render to avoid stale closures
    getCurrentValue: (prop: string) => getDesignProperty('layout', prop) || '',
  });

  // Determine layout type from current values. Anything that is not flex,
  // grid or hidden (including the unset default) behaves as block.
  const layoutType: LayoutType =
      display === 'hidden' ? 'hidden' :
        display === 'grid' || display === 'inline-grid' ? 'grid' :
          display === 'flex' || display === 'inline-flex' ? 'flex' :
            'block';

  const isFlex = layoutType === 'flex';
  const isGrid = layoutType === 'grid';
  const isColumnAxis = isFlex && (flexDirection === 'column' || flexDirection === 'column-reverse');
  const isReverse = flexDirection === 'row-reverse' || flexDirection === 'column-reverse';
  const direction: FlexDirection = isColumnAxis ? 'vertical' : 'horizontal';

  const wrapMode = flexWrap === 'wrap' ? 'yes' : 'no';

  // Handle layout type change
  const handleLayoutTypeChange = (type: LayoutType) => {
    if (type === 'flex') {
      // Keep an existing direction; default to a horizontal row otherwise
      const hasDirection = ['row', 'row-reverse', 'column', 'column-reverse'].includes(flexDirection);
      updateDesignProperties([
        { category: 'layout', property: 'display', value: 'flex' },
        ...(hasDirection ? [] : [{ category: 'layout' as const, property: 'flexDirection', value: 'row' }]),
      ]);
      return;
    }

    // block / grid / hidden: direction only applies to flex
    updateDesignProperties([
      { category: 'layout', property: 'display', value: type },
      { category: 'layout', property: 'flexDirection', value: null },
    ]);
  };

  // Handle flex direction change (keeps the current reverse state)
  const handleDirectionChange = (value: FlexDirection) => {
    const axis = value === 'vertical' ? 'column' : 'row';
    updateDesignProperty('layout', 'flexDirection', isReverse ? `${axis}-reverse` : axis);
  };

  // Toggle reverse on the current axis (row ↔ row-reverse, column ↔ column-reverse)
  const handleReverseToggle = () => {
    const axis = isColumnAxis ? 'column' : 'row';
    updateDesignProperty('layout', 'flexDirection', isReverse ? axis : `${axis}-reverse`);
  };

  // Handle align items change
  const handleAlignChange = (value: string) => {
    updateDesignProperty('layout', 'alignItems', value);
  };

  // Handle justify content change
  const handleJustifyChange = (value: string) => {
    updateDesignProperty('layout', 'justifyContent', value);
  };

  // Handle wrap mode change
  const handleWrapChange = (value: 'yes' | 'no') => {
    updateDesignProperty('layout', 'flexWrap', value === 'yes' ? 'wrap' : 'nowrap');
  };

  // Handle gap changes (debounced for text input)
  const handleGapChange = (value: string) => {
    setGapInput(value);
    if (gapModeToggle.mode === 'all') {
      const sanitized = removeSpaces(value);
      debouncedUpdateDesignProperty('layout', 'gap', sanitized || null);
    }
  };

  const handleColumnGapChange = (value: string) => {
    setColumnGapInput(value);
    const sanitized = removeSpaces(value);
    debouncedUpdateDesignProperty('layout', 'columnGap', sanitized || null);
  };

  const handleRowGapChange = (value: string) => {
    setRowGapInput(value);
    const sanitized = removeSpaces(value);
    debouncedUpdateDesignProperty('layout', 'rowGap', sanitized || null);
  };

  // Handle grid columns change (number input only)
  const handleGridColsChange = (value: string) => {
    // Only allow numbers and empty string
    if (value !== '' && !/^\d+$/.test(value)) return;

    setGridColsInput(value);
    const converted = numberToGridTemplate(value);
    debouncedUpdateDesignProperty('layout', 'gridTemplateColumns', converted);
  };

  // Handle grid rows change (number input only)
  const handleGridRowsChange = (value: string) => {
    // Only allow numbers and empty string
    if (value !== '' && !/^\d+$/.test(value)) return;

    setGridRowsInput(value);
    const converted = numberToGridTemplate(value);
    debouncedUpdateDesignProperty('layout', 'gridTemplateRows', converted);
  };

  // Extract numeric value from design property
  return (
    <div className="py-5">
      <header className="py-4 -mt-4">
        <Label>Layout</Label>
      </header>

      <div className="flex flex-col gap-2">

          <div className="grid grid-cols-3">
              <Label variant="muted">Type</Label>
              <div className="col-span-2">
                  <IconTabs
                    value={layoutType}
                    options={LAYOUT_TYPE_OPTIONS}
                    onChange={handleLayoutTypeChange}
                  />
              </div>
          </div>

          {isFlex && (
              <div className="grid grid-cols-3">
                  <Label variant="muted">Direction</Label>
                  <div className="col-span-2 flex items-center gap-2">
                      <div className="flex-1">
                          <IconTabs
                            value={direction}
                            options={FLEX_DIRECTION_OPTIONS}
                            onChange={handleDirectionChange}
                          />
                      </div>
                      <Tooltip>
                          <TooltipTrigger asChild>
                              <Button
                                variant={isReverse ? 'secondary' : 'ghost'}
                                size="sm"
                                aria-pressed={isReverse}
                                aria-label="Reverse direction"
                                onClick={handleReverseToggle}
                              >
                                  <Icon name="reverse-arrows" />
                              </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                              <p>Reverse</p>
                          </TooltipContent>
                      </Tooltip>
                  </div>
              </div>
          )}

          {(isFlex || isGrid) && (
              <>
                  <div className="grid grid-cols-3">
                      <Label variant="muted">Align</Label>
                      <div className="col-span-2">
                          <Tabs
                            value={alignItems || 'start'}
                            onValueChange={handleAlignChange}
                            className="w-full"
                          >
                              <TabsList className="w-full">
                                  <TabsTrigger value="start">
                                      <Icon name="alignStart" className={isColumnAxis ? '-rotate-90' : ''} />
                                  </TabsTrigger>
                                  <TabsTrigger value="center">
                                      <Icon name="alignCenter" className={isColumnAxis ? '-rotate-90' : ''} />
                                  </TabsTrigger>
                                  <TabsTrigger value="end">
                                      <Icon name="alignEnd" className={isColumnAxis ? '-rotate-90' : ''} />
                                  </TabsTrigger>
                                  <TabsTrigger value="stretch">
                                      <Icon name="alignStretch" className={isColumnAxis ? '-rotate-90' : ''} />
                                  </TabsTrigger>
                              </TabsList>
                          </Tabs>
                      </div>
                  </div>

                  <div className="grid grid-cols-3">
                      <Label variant="muted">Justify</Label>
                      <div className="col-span-2 *:w-full">
                          <Select value={justifyContent} onValueChange={handleJustifyChange}>
                              <SelectTrigger>
                                  <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                  <SelectGroup>
                                      <SelectItem value="start">Start</SelectItem>
                                      <SelectItem value="center">Center</SelectItem>
                                      <SelectItem value="end">End</SelectItem>
                                      <SelectItem value="between">Between</SelectItem>
                                      <SelectItem value="around">Around</SelectItem>
                                      <SelectItem value="evenly">Evenly</SelectItem>
                                  </SelectGroup>
                              </SelectContent>
                          </Select>
                      </div>
                  </div>
              </>
          )}

          {isGrid && (
              <div className="grid grid-cols-3">
                  <Label variant="muted">Grid</Label>
                  <div className="col-span-2 grid grid-cols-2 gap-2">
                      <InputGroup>
                          <InputGroupAddon>
                              <div className="flex">
                                  <Tooltip>
                                      <TooltipTrigger tabIndex={-1}>
                                          <Icon name="columns" className="size-3" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                          <p>Columns</p>
                                      </TooltipContent>
                                  </Tooltip>
                              </div>
                          </InputGroupAddon>
                          <InputGroupInput
                            stepper
                            min="1"
                            step="1"
                            value={gridColsInput}
                            onChange={(e) => handleGridColsChange(e.target.value)}
                          />
                      </InputGroup>
                      <InputGroup>
                          <InputGroupAddon>
                              <div className="flex">
                                  <Tooltip>
                                      <TooltipTrigger tabIndex={-1}>
                                          <Icon name="columns" className="size-3 rotate-90" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                          <p>Rows</p>
                                      </TooltipContent>
                                  </Tooltip>
                              </div>
                          </InputGroupAddon>
                          <InputGroupInput
                            stepper
                            min="1"
                            step="1"
                            value={gridRowsInput}
                            onChange={(e) => handleGridRowsChange(e.target.value)}
                          />
                      </InputGroup>
                  </div>
              </div>
          )}

          {isFlex && (
              <div className="grid grid-cols-3">
                  <Label variant="muted">Wrap</Label>
                  <div className="col-span-2">
                      <Tabs
                        value={wrapMode}
                        onValueChange={(value) => handleWrapChange(value as 'yes' | 'no')}
                        className="w-full"
                      >
                          <TabsList className="w-full">
                              <TabsTrigger value="yes">Yes</TabsTrigger>
                              <TabsTrigger value="no">No</TabsTrigger>
                          </TabsList>
                      </Tabs>
                  </div>
              </div>
          )}

          {(isFlex || isGrid) && (
              <div className="grid grid-cols-3 items-start">
                  <Label variant="muted" className="h-8">Gap</Label>
                  <div className="col-span-2 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                          <InputGroup className="flex-1">
                              <InputGroupInput
                                stepper
                                min="0"
                                step="1"
                                disabled={gapModeToggle.mode === 'individual'}
                                value={gapInput}
                                onChange={(e) => handleGapChange(e.target.value)}
                              />
                          </InputGroup>
                          <Button
                            variant={gapModeToggle.mode === 'individual' ? 'secondary' : 'ghost'}
                            size="sm"
                            onClick={gapModeToggle.handleToggle}
                          >
                              <Icon name="link" />
                          </Button>
                      </div>
                      {gapModeToggle.mode === 'individual' && (
                           <div className="col-span-2 grid grid-cols-2 gap-2">
                           <InputGroup>
                               <InputGroupAddon>
                                   <div className="flex">
                                       <Tooltip>
                                           <TooltipTrigger tabIndex={-1}>
                                               <Icon name="horizontalGap" className="size-3" />
                                           </TooltipTrigger>
                                           <TooltipContent>
                                               <p>Horizontal gap</p>
                                           </TooltipContent>
                                       </Tooltip>
                                   </div>
                               </InputGroupAddon>
                               <InputGroupInput
                                 stepper
                                 min="0"
                                 step="1"
                                 value={columnGapInput}
                                 onChange={(e) => handleColumnGapChange(e.target.value)}
                               />
                           </InputGroup>
                           <InputGroup>
                               <InputGroupAddon>
                                   <div className="flex">
                                       <Tooltip>
                                           <TooltipTrigger tabIndex={-1}>
                                               <Icon name="verticalGap" className="size-3" />
                                           </TooltipTrigger>
                                           <TooltipContent>
                                               <p>Vertical gap</p>
                                           </TooltipContent>
                                       </Tooltip>
                                   </div>
                               </InputGroupAddon>
                               <InputGroupInput
                                 stepper
                                 min="0"
                                 step="1"
                                 value={rowGapInput}
                                 onChange={(e) => handleRowGapChange(e.target.value)}
                               />
                           </InputGroup>
                       </div>
                      )}
                  </div>
              </div>
          )}

          {/* How this layer sits inside its flex/grid parent (renders nothing otherwise) */}
          <AlignSelfRow
            layer={layer}
            parentLayer={parentLayer}
            onLayerUpdate={onLayerUpdate}
          />

      </div>
    </div>
  );
});
export default LayoutControls;
