'use client';

import { useState, useEffect, memo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { InputGroup, InputGroupAddon } from '@/components/ui/input-group';
import { Slider } from '@/components/ui/slider';
import Icon from '@/components/ui/icon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDesignSync } from '@/hooks/use-design-sync';
import { useEditorStore } from '@/stores/useEditorStore';
import { MeasurementInput } from './MeasurementInput';
import type { Layer } from '@/types';

interface PositionControlsProps {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

const PositionControls = memo(function PositionControls({ layer, onLayerUpdate }: PositionControlsProps) {
  const activeBreakpoint = useEditorStore((s) => s.activeBreakpoint);
  const activeUIState = useEditorStore((s) => s.activeUIState);
  const { updateDesignProperty, debouncedUpdateDesignProperty, getDesignProperty } = useDesignSync({
    layer,
    onLayerUpdate,
    activeBreakpoint,
    activeUIState,
  });

  // Get current values from layer (with inheritance)
  const position = getDesignProperty('positioning', 'position') || 'static';
  const top = getDesignProperty('positioning', 'top') || '';
  const right = getDesignProperty('positioning', 'right') || '';
  const bottom = getDesignProperty('positioning', 'bottom') || '';
  const left = getDesignProperty('positioning', 'left') || '';
  const zIndex = getDesignProperty('positioning', 'zIndex') || '';

  // Only show position inputs for fixed, absolute, or sticky
  const showPositionInputs = position === 'fixed' || position === 'absolute' || position === 'sticky';

  const [zIndexLocal, setZIndexLocal] = useState(zIndex);

  useEffect(() => {
    setZIndexLocal(zIndex);
  }, [zIndex]);

  const handlePositionChange = (value: string) => {
    updateDesignProperty('positioning', 'position', value);
  };

  const handleTopChange = (value: string) => {
    debouncedUpdateDesignProperty('positioning', 'top', value || null);
  };

  const handleRightChange = (value: string) => {
    debouncedUpdateDesignProperty('positioning', 'right', value || null);
  };

  const handleBottomChange = (value: string) => {
    debouncedUpdateDesignProperty('positioning', 'bottom', value || null);
  };

  const handleLeftChange = (value: string) => {
    debouncedUpdateDesignProperty('positioning', 'left', value || null);
  };

  const handleZIndexChange = (value: string) => {
    setZIndexLocal(value);
    debouncedUpdateDesignProperty('positioning', 'zIndex', value || null);
  };

  const handleZIndexSliderChange = (values: number[]) => {
    const value = values[0].toString();
    setZIndexLocal(value);
    updateDesignProperty('positioning', 'zIndex', value);
  };

  return (
    <div className="py-5">
      <header className="py-4 -mt-4">
        <Label>Position</Label>
      </header>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-3">
          <Label variant="muted">Type</Label>
          <div className="col-span-2 *:w-full">
            <Select value={position} onValueChange={handlePositionChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="static">Static</SelectItem>
                  <SelectItem value="relative">Relative</SelectItem>
                  <SelectItem value="absolute">Absolute</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                  <SelectItem value="sticky">Sticky</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {showPositionInputs && (
          <>
            <div className="grid grid-cols-3 items-start">
              <Label variant="muted" className="h-8">Offset</Label>
              <div className="col-span-2 flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
                  <InputGroup>
                    <InputGroupAddon>
                      <div className="flex">
                        <Tooltip>
                          <TooltipTrigger>
                            <Icon name="paddingSide" className="size-3" />
                          </TooltipTrigger>
                          <TooltipContent><p>Left</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </InputGroupAddon>
                    <MeasurementInput
                      value={left} onChange={handleLeftChange}
                      className="flex-1"
                    />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon>
                      <div className="flex">
                        <Tooltip>
                          <TooltipTrigger>
                            <Icon name="paddingSide" className="size-3 rotate-90" />
                          </TooltipTrigger>
                          <TooltipContent><p>Top</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </InputGroupAddon>
                    <MeasurementInput
                      value={top} onChange={handleTopChange}
                      className="flex-1"
                    />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon>
                      <div className="flex">
                        <Tooltip>
                          <TooltipTrigger>
                            <Icon name="paddingSide" className="size-3 rotate-180" />
                          </TooltipTrigger>
                          <TooltipContent><p>Right</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </InputGroupAddon>
                    <MeasurementInput
                      value={right} onChange={handleRightChange}
                      className="flex-1"
                    />
                  </InputGroup>
                  <InputGroup>
                    <InputGroupAddon>
                      <div className="flex">
                        <Tooltip>
                          <TooltipTrigger>
                            <Icon name="paddingSide" className="size-3 -rotate-90" />
                          </TooltipTrigger>
                          <TooltipContent><p>Bottom</p></TooltipContent>
                        </Tooltip>
                      </div>
                    </InputGroupAddon>
                    <MeasurementInput
                      value={bottom} onChange={handleBottomChange}
                      className="flex-1"
                    />
                  </InputGroup>
                </div>
              </div>
            </div>
          </>
        )}

        {position !== 'static' && (
          <div className="grid grid-cols-3">
            <Label variant="muted">Z Index</Label>
            <div className="col-span-2 grid grid-cols-2 items-center gap-2">
              <Input
                type="text"
                value={zIndexLocal}
                onChange={(e) => handleZIndexChange(e.target.value)}
              />
              <Slider
                value={[parseInt(zIndexLocal) || 0]}
                onValueChange={handleZIndexSliderChange}
                min={0}
                max={100}
                step={1}
                className="flex-1"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
export default PositionControls;
