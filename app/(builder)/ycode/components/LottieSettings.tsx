'use client';

import { useState, useCallback, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SettingsPanel from './SettingsPanel';
import Icon from '@/components/ui/icon';
import { useEditorStore } from '@/stores/useEditorStore';
import { useAssetsStore } from '@/stores/useAssetsStore';
import { createAssetVariable, createDynamicTextVariable, getDynamicTextContent, isAssetVariable, getAssetId, isDynamicTextVariable } from '@/lib/variable-utils';
import { ASSET_CATEGORIES } from '@/lib/asset-utils';
import { toast } from 'sonner';
import type { Layer } from '@/types';

interface LottieSettingsProps {
  layer: Layer | null;
  onLayerUpdate: (layerId: string, updates: Partial<Layer>) => void;
}

export default function LottieSettings({ layer, onLayerUpdate }: LottieSettingsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const openFileManager = useEditorStore((s) => s.openFileManager);
  const getAsset = useAssetsStore((s) => s.getAsset);

  const lottieSrc = layer?.variables?.lottie?.src;

  const sourceType = useMemo((): 'upload' | 'url' => {
    if (!lottieSrc) return 'upload';
    if (isDynamicTextVariable(lottieSrc)) return 'url';
    return 'upload';
  }, [lottieSrc]);

  const currentAssetId = useMemo(() => isAssetVariable(lottieSrc) ? getAssetId(lottieSrc) : null, [lottieSrc]);
  const currentAsset = useMemo(() => currentAssetId ? getAsset(currentAssetId) : null, [currentAssetId, getAsset]);
  const customUrl = useMemo(() => isDynamicTextVariable(lottieSrc) ? getDynamicTextContent(lottieSrc) : '', [lottieSrc]);

  const loop = layer?.attributes?.lottieLoop !== false;
  const autoplay = layer?.attributes?.lottieAutoplay !== false;
  const reverse = !!layer?.attributes?.lottieReverse;
  const speed = typeof layer?.attributes?.lottieSpeed === 'number' ? layer.attributes.lottieSpeed : 1;
  const renderer = (layer?.attributes?.lottieRenderer as 'svg' | 'canvas') || 'svg';
  const useCustomDuration = !!layer?.attributes?.lottieUseCustomDuration;
  const duration = typeof layer?.attributes?.lottieDuration === 'number' ? layer.attributes.lottieDuration : 1000;

  const setSrc = useCallback((src: typeof lottieSrc) => {
    if (!layer) return;
    onLayerUpdate(layer.id, { variables: { ...layer.variables, lottie: { src: src! } } });
  }, [layer, onLayerUpdate]);

  const setAttr = useCallback((key: string, value: unknown) => {
    if (!layer) return;
    onLayerUpdate(layer.id, { attributes: { ...layer.attributes, [key]: value } });
  }, [layer, onLayerUpdate]);

  const handleTypeChange = (type: 'upload' | 'url') => {
    if (type === 'url') setSrc(createDynamicTextVariable(''));
    else setSrc({ type: 'asset', data: { asset_id: null } });
  };

  if (!layer || layer.name !== 'lottie') return null;

  return (
    <SettingsPanel
      title="Lottie" isOpen={isOpen}
      onToggle={() => setIsOpen(!isOpen)}
    >
      <div className="flex flex-col gap-3">

        {/* Source type */}
        <div className="grid grid-cols-3 items-center">
          <Label variant="muted">Source</Label>
          <div className="col-span-2 flex gap-1">
            <Button
              size="sm" variant={sourceType === 'upload' ? 'secondary' : 'ghost'}
              onClick={() => handleTypeChange('upload')}
            >
              <Icon name="folder" /> File
            </Button>
            <Button
              size="sm" variant={sourceType === 'url' ? 'secondary' : 'ghost'}
              onClick={() => handleTypeChange('url')}
            >
              <Icon name="link" /> URL
            </Button>
          </div>
        </div>

        {/* File picker */}
        {sourceType === 'upload' && (
          <div className="grid grid-cols-3 items-center">
            <Label variant="muted">File</Label>
            <div className="col-span-2">
              <Button
                type="button" variant="secondary"
                size="sm"
                className="w-full justify-start min-w-0"
                onClick={() => {
                  openFileManager((asset) => {
                    if (asset.mime_type !== 'application/json') {
                      toast.error('Invalid file', { description: 'Please select a Lottie .json file.' });
                      return false;
                    }
                    setSrc(createAssetVariable(asset.id));
                  }, currentAssetId, ASSET_CATEGORIES.DOCUMENTS);
                }}
              >
                <span className="truncate">{currentAsset?.filename || 'Choose .json file'}</span>
                {currentAsset && (
                  <span
                    role="button"
                    className="ml-auto shrink-0 -mr-1 p-1 rounded hover:bg-background/60"
                    onClick={(e) => { e.stopPropagation(); setSrc({ type: 'asset', data: { asset_id: null } }); }}
                  >
                    <Icon name="x" className="size-3" />
                  </span>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* Custom URL */}
        {sourceType === 'url' && (
          <div className="grid grid-cols-3 items-center">
            <Label variant="muted">URL</Label>
            <div className="col-span-2">
              <Input
                value={customUrl}
                onChange={(e) => setSrc(createDynamicTextVariable(e.target.value))}
                placeholder="https://example.com/anim.json"
              />
            </div>
          </div>
        )}

        {/* Renderer */}
        <div className="grid grid-cols-3 items-center">
          <Label variant="muted">Render</Label>
          <div className="col-span-2 *:w-full">
            <Select value={renderer} onValueChange={(v) => setAttr('lottieRenderer', v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="svg">SVG</SelectItem>
                  <SelectItem value="canvas">Canvas</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Behavior */}
        <div className="grid grid-cols-3 items-start">
          <Label variant="muted">Behavior</Label>
          <div className="col-span-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="lottie-loop" checked={loop}
                onCheckedChange={(v) => setAttr('lottieLoop', !!v)}
              />
              <Label
                variant="muted" htmlFor="lottie-loop"
                className="cursor-pointer"
              >Loop</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="lottie-autoplay" checked={autoplay}
                onCheckedChange={(v) => setAttr('lottieAutoplay', !!v)}
              />
              <Label
                variant="muted" htmlFor="lottie-autoplay"
                className="cursor-pointer"
              >Autoplay</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="lottie-reverse" checked={reverse}
                onCheckedChange={(v) => setAttr('lottieReverse', !!v)}
              />
              <Label
                variant="muted" htmlFor="lottie-reverse"
                className="cursor-pointer"
              >Play in reverse</Label>
            </div>
          </div>
        </div>

        {/* Speed */}
        <div className="grid grid-cols-3 items-center">
          <Label variant="muted">Speed</Label>
          <div className="col-span-2">
            <Input
              type="number" min={0.1}
              max={5} step={0.1}
              value={speed}
              onChange={(e) => setAttr('lottieSpeed', parseFloat(e.target.value) || 1)}
            />
          </div>
        </div>

        {/* Duration */}
        <div className="grid grid-cols-3 items-start">
          <Label variant="muted">Duration</Label>
          <div className="col-span-2 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="lottie-custom-duration"
                checked={useCustomDuration}
                onCheckedChange={(v) => setAttr('lottieUseCustomDuration', !!v)}
              />
              <Label
                variant="muted" htmlFor="lottie-custom-duration"
                className="cursor-pointer"
              >Custom duration</Label>
            </div>
            {useCustomDuration && (
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={100}
                  step={100}
                  value={duration}
                  onChange={(e) => setAttr('lottieDuration', parseInt(e.target.value) || 1000)}
                />
                <span className="text-xs text-muted-foreground shrink-0">ms</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </SettingsPanel>
  );
}
