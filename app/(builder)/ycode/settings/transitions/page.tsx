'use client';

import { useState, useCallback } from 'react';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
} from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { toast } from 'sonner';
import {
  DEFAULT_PAGE_TRANSITION,
  normalizePageTransition,
  type PageTransitionConfig,
  type PageTransitionType,
} from '@/lib/page-transitions';

const TYPE_LABELS: Record<PageTransitionType, string> = {
  fade: 'Fade',
  rgb_split: 'RGB split',
  slide: 'Slide',
  zoom: 'Zoom',
  reveal: 'Reveal',
  shader_dither: 'Dithering (shader)',
  shader_warp: 'Warp (shader)',
  shader_smoke: 'Smoke ring (shader)',
};

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <Field orientation="horizontal" className="flex-row-reverse justify-end gap-3">
      <FieldLabel className="font-normal">{label}</FieldLabel>
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="size-7 rounded-md border cursor-pointer bg-transparent disabled:opacity-40 disabled:cursor-not-allowed"
      />
    </Field>
  );
}

const EASINGS: { value: string; label: string }[] = [
  { value: 'cubic-bezier(.4,0,.2,1)', label: 'Smooth' },
  { value: 'ease', label: 'Ease' },
  { value: 'linear', label: 'Linear' },
  { value: 'ease-in', label: 'Ease in' },
  { value: 'ease-out', label: 'Ease out' },
  { value: 'ease-in-out', label: 'Ease in-out' },
];

export default function TransitionsSettingsPage() {
  const { getSettingByKey, saveSettings } = useSettingsStore();
  const [config, setConfig] = useState<PageTransitionConfig>(() =>
    normalizePageTransition(getSettingByKey('page_transitions') ?? DEFAULT_PAGE_TRANSITION)
  );
  const [isSaving, setIsSaving] = useState(false);

  const patch = (over: Partial<PageTransitionConfig>) => setConfig((c) => ({ ...c, ...over }));

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    const success = await saveSettings({ page_transitions: config });
    if (success) toast.success('Page transitions saved');
    else toast.error(useSettingsStore.getState().error || 'Could not save. Please try again.');
    setIsSaving(false);
  }, [saveSettings, config]);

  const intensityUsed = config.type !== 'fade' && config.type !== 'reveal';
  const isShader = config.type.startsWith('shader_');

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <header className="pt-8 pb-3">
          <span className="text-base font-medium">Transitions</span>
        </header>

        <div className="flex flex-col gap-6 bg-secondary/20 p-8 rounded-lg">
          <div>
            <FieldLegend>Page transitions</FieldLegend>
            <FieldDescription>
              Animate navigation between pages with a full-screen curtain that covers
              the leaving page and reveals the next one. Works in all modern browsers
              (Chrome, Firefox, Safari). Shader presets add a WebGL effect, loaded only
              when selected.
            </FieldDescription>
          </div>

          <FieldSeparator />

          <Field orientation="horizontal" className="flex-row-reverse">
            <FieldContent>
              <FieldLabel htmlFor="pt-enabled">Enable page transitions</FieldLabel>
              <FieldDescription>Turn transitions on for the published site and preview.</FieldDescription>
            </FieldContent>
            <Switch
              id="pt-enabled"
              checked={config.enabled}
              onCheckedChange={(v) => patch({ enabled: v })}
            />
          </Field>

          <Field>
            <FieldLabel>Type</FieldLabel>
            <Select
              value={config.type}
              onValueChange={(v) => patch({ type: v as PageTransitionType })}
              disabled={!config.enabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as PageTransitionType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Duration — {config.duration} ms</FieldLabel>
            <Slider
              value={[config.duration]}
              onValueChange={([v]) => patch({ duration: v })}
              min={100}
              max={2000}
              step={50}
              disabled={!config.enabled}
            />
          </Field>

          <Field>
            <FieldLabel>Easing</FieldLabel>
            <Select
              value={config.easing}
              onValueChange={(v) => patch({ easing: v })}
              disabled={!config.enabled}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EASINGS.map((e) => (
                  <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel>Intensity — {config.intensity}</FieldLabel>
            <FieldDescription>
              {intensityUsed
                ? 'Displacement / chromatic offset for the selected effect.'
                : 'Not used by this effect.'}
            </FieldDescription>
            <Slider
              value={[config.intensity]}
              onValueChange={([v]) => patch({ intensity: v })}
              min={0}
              max={100}
              step={1}
              disabled={!config.enabled || !intensityUsed}
            />
          </Field>

          {isShader && (
            <Field>
              <FieldLabel>Colors</FieldLabel>
              <FieldDescription>
                Colors for the shader surface. CSS presets (fade, RGB split, slide…)
                animate the page itself and use no colors.
              </FieldDescription>
              <div className="flex flex-col gap-2 pt-1">
                <ColorField
                  label="Primary"
                  value={config.colorPrimary}
                  onChange={(v) => patch({ colorPrimary: v })}
                  disabled={!config.enabled}
                />
                <ColorField
                  label="Background"
                  value={config.colorBack}
                  onChange={(v) => patch({ colorBack: v })}
                  disabled={!config.enabled}
                />
              </div>
            </Field>
          )}

          <FieldSeparator />

          <div className="flex justify-end">
            <Button
              size="sm" onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
