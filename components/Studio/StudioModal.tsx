'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useColorVariablesStore } from '@/stores/useColorVariablesStore';
import { StudioNav, type StudioSection } from './StudioNav';
import { useStudioVariables } from './hooks/useStudioVariables';
import { GeneralSection }    from './sections/GeneralSection';
import { TypographySection } from './sections/TypographySection';
import { TextStyleSection }  from './sections/TextStyleSection';
import { ColorsSection }     from './sections/ColorsSection';
import { ThemeSection }      from './sections/ThemeSection';
import { SpacingSection }    from './sections/SpacingSection';
import { LayoutSection }     from './sections/LayoutSection';
import { THEME_TOKENS_MAP, labelToUuidKey, generateSpacingBridgeCSS, generateTypographyBridgeCSS } from './utils/bridge-generators';
import { resolveVarToHex }   from './utils/color-utils';

// ── Zustand store for open/close (shared with trigger) ───────────────────────
import { create } from 'zustand';

interface StudioStore { isOpen: boolean; open: () => void; close: () => void; toggle: () => void; }
export const useStudioStore = create<StudioStore>(set => ({
  isOpen:  false,
  open:    () => set({ isOpen: true  }),
  close:   () => set({ isOpen: false }),
  toggle:  () => set(s => ({ isOpen: !s.isOpen })),
}));

// ── Sync palette to Ycode helper ──────────────────────────────────────────────

async function syncToYcodePalette(
  variables: Record<string, string>,
  loadColorVariables: () => Promise<void>,
  triggerIframeCSSReload: () => Promise<void>,
  saveUpdates: (u: Record<string, string>) => Promise<void>,
) {
  const existing = await fetch('/ycode/api/color-variables').then(r => r.json());
  const byName: Record<string, string> = {};
  for (const v of (existing.data || [])) byName[v.name] = v.id;

  const upsert = (label: string, hex: string) => {
    if (byName[label]) return fetch(`/ycode/api/color-variables/${byName[label]}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: hex }) });
    return fetch('/ycode/api/color-variables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: label, value: hex }) });
  };

  // Color scale
  const colorTokens = Object.keys(variables).filter(k => k.startsWith('color--') && variables[k]?.startsWith('#'));
  await Promise.all(colorTokens.map(key => {
    const slug  = key.replace(/^color--custom--/, '').replace(/^color--/, '').replace(/-/g, ' ');
    const label = `Studio / ${slug.charAt(0).toUpperCase()}${slug.slice(1)}`;
    const lumosLabel = label.replace(/^Studio \/ /, 'Lumos / ');
    if (byName[lumosLabel]) return fetch(`/ycode/api/color-variables/${byName[lumosLabel]}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: label, value: variables[key] }) });
    return upsert(label, variables[key]);
  }));

  // Theme tokens
  for (const { label, lightKey } of THEME_TOKENS_MAP) {
    const hex = resolveVarToHex(variables[lightKey] || '', variables);
    if (hex) await upsert(label, hex);
  }

  // Fetch back UUIDs for dark bridge
  const refreshed = await fetch('/ycode/api/color-variables').then(r => r.json());
  const uuidUpdates: Record<string, string> = {};
  for (const entry of (refreshed.data || [])) {
    if (entry.name?.startsWith('Theme / ') && entry.id) uuidUpdates[labelToUuidKey(entry.name)] = entry.id;
  }
  if (Object.keys(uuidUpdates).length > 0) {
    await saveUpdates({ ...Object.fromEntries(Object.entries(variables).filter(([k]) => k.startsWith('color--'))), ...uuidUpdates });
  }

  await loadColorVariables();
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function StudioModal() {
  const { isOpen, close } = useStudioStore();
  const [section, setSection] = useState<StudioSection>('general');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const hook = useStudioVariables();
  const loadColorVariables = useColorVariablesStore(s => s.loadColorVariables);

  // Keyboard shortcuts: Escape close, Shift+Option+S toggle
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'S' && e.shiftKey && e.altKey) useStudioStore.getState().toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  if (!isOpen) return null;

  const handleSync = async () => {
    setSyncStatus('syncing');
    try {
      await syncToYcodePalette(hook.variables, loadColorVariables, hook.triggerIframeCSSReload, hook.saveUpdates);
      setSyncStatus('done');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch {
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    }
  };

  const renderSection = () => {
    switch (section) {
      case 'general':    return <GeneralSection    hook={hook} />;
      case 'typography': return <TypographySection hook={hook} />;
      case 'textstyle':  return <TextStyleSection  hook={hook} />;
      case 'colors':     return <ColorsSection     hook={hook} />;
      case 'theme':      return <ThemeSection      hook={hook} />;
      case 'spacing':    return <SpacingSection    hook={hook} />;
      case 'layout':     return <LayoutSection     hook={hook} />;
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-auto"
      onClick={close}
    >
      <div
        className="w-[90vw] h-[80vh] bg-[#111] border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden text-[12px] text-white"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
        onKeyUp={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-semibold text-[13px] text-white">Studio</span>
            {hook.status === 'saving' && <span className="text-[10px] text-white/50 animate-pulse">Saving…</span>}
            {hook.status === 'done'   && <span className="text-[10px] text-green-400">✓ Saved</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync} disabled={syncStatus === 'syncing'}
              className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {syncStatus === 'idle'    && '⇄ Sync → Ycode'}
              {syncStatus === 'syncing' && 'Syncing…'}
              {syncStatus === 'done'    && '✓ Synced'}
              {syncStatus === 'error'   && '✗ Erreur'}
            </button>
            <button
              onClick={close}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-white/50 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0">
          <StudioNav active={section} onChange={setSection} />
          <div className="flex-1 min-w-0 overflow-hidden">
            {renderSection()}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
