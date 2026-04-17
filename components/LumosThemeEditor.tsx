'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';

// Debounce helper
function useDebounce<T extends (...args: any[]) => void>(callback: T, delay: number) {
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  return useCallback((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    const newTimer = setTimeout(() => {
      callback(...args);
    }, delay);
    setTimer(newTimer);
  }, [callback, delay, timer]);
}

export default function LumosThemeEditor() {
  const pathname = usePathname() || '';
  const isBuilder = pathname.includes('/ycode') || pathname.includes('/builder');
  
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/lumos')
      .then(res => res.json())
      .then(data => {
        if (data.variables) {
          setVariables(data.variables);
        }
        setLoading(false);
      });
  }, []);

  const triggerIframeCSSReload = () => {
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      try {
        const link = iframe.contentDocument?.querySelector('link[href^="/global-theme.css"]');
        if (link) {
          const baseUrl = '/global-theme.css';
          link.setAttribute('href', `${baseUrl}?v=${new Date().getTime()}`);
        }
      } catch (e) {
        // Ignore cross-origin iframe errors if any
      }
    });
  };

  const saveUpdates = useCallback(async (updates: Record<string, string>) => {
    try {
      await fetch('/api/lumos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      triggerIframeCSSReload();
    } catch (e) {
      console.error('Failed to save Lumos variables', e);
    }
  }, []);

  const debouncedSave = useDebounce(saveUpdates, 300);

  const handleChange = (key: string, value: string) => {
    setVariables(prev => ({ ...prev, [key]: value }));
    debouncedSave({ [key]: value });
  };

  const [openSection, setOpenSection] = useState<string>('general');

  if (!isBuilder) return null;
  if (loading) return null;

  const renderNumberInput = (label: string, key: string, step = '0.1') => (
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-xs text-muted-foreground w-1/2">{label}</label>
      <input
        type="number"
        step={step}
        className="w-1/2 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
        value={variables[key] || ''}
        onChange={(e) => handleChange(key, e.target.value)}
      />
    </div>
  );

  const renderTextInput = (label: string, key: string) => (
    <div className="flex items-center justify-between gap-2 mb-2">
      <label className="text-xs text-muted-foreground w-1/2">{label}</label>
      <input
        type="text"
        className="w-1/2 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
        value={variables[key] || ''}
        onChange={(e) => handleChange(key, e.target.value)}
      />
    </div>
  );

  const renderColorInput = (label: string, key: string) => {
    // Basic fix to extract hex from potential var() fallback or raw string 
    // Usually <input type="color"> requires 6-digit hex
    const rawVal = variables[key] || '#000000';
    const hexVal = rawVal.startsWith('#') && rawVal.length >= 7 ? rawVal.substring(0, 7) : '#000000';

    return (
      <div className="flex items-center justify-between gap-2 mb-2">
        <label className="text-xs text-muted-foreground w-1/3 truncate">{label}</label>
        <div className="flex items-center gap-2 w-2/3">
          <input
            type="color"
            className="w-6 h-6 p-0 border-border rounded cursor-pointer shrink-0"
            value={hexVal}
            onChange={(e) => handleChange(key, e.target.value)}
          />
          <input
            type="text"
            className="flex-1 min-w-0 bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
            value={rawVal}
            onChange={(e) => handleChange(key, e.target.value)}
          />
        </div>
      </div>
    );
  };

  const renderAccordion = (title: string, id: string, children: React.ReactNode) => (
    <div className="border border-border rounded-md mb-2 relative">
      <button 
        className="w-full flex items-center justify-between p-3 bg-muted/95 backdrop-blur-sm shadow-sm hover:bg-muted text-sm font-medium transition-colors sticky top-0 z-10 rounded-t-md"
        onClick={() => setOpenSection(openSection === id ? '' : id)}
      >
        {title}
        <svg
          xmlns="http://www.w3.org/2000/svg" width="16"
          height="16" viewBox="0 0 24 24"
          fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" className={`transition-transform text-muted-foreground ${openSection === id ? 'rotate-180' : ''}`}
        ><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {openSection === id && (
        <div className="p-3 bg-background rounded-b-md">
          {children}
        </div>
      )}
    </div>
  );

  const renderPairGroups = (pairs: {label: string, minKey: string, maxKey: string}[]) => (
    <div>
      {pairs.map(pair => (
        <div key={pair.label} className="mb-4 last:mb-0">
          <div className="text-xs font-semibold mb-2">{pair.label}</div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Min</label>
              <input
                type="number"
                step="0.1"
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={variables[pair.minKey] || ''}
                onChange={(e) => handleChange(pair.minKey, e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-[10px] text-muted-foreground mb-1">Max</label>
              <input
                type="number"
                step="0.1"
                className="w-full bg-background border border-border rounded px-2 py-1 text-xs outline-none focus:border-ring"
                value={variables[pair.maxKey] || ''}
                onChange={(e) => handleChange(pair.maxKey, e.target.value)}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const typographyPairs = [
    { label: 'Display', minKey: '_typography---font-size--display-min', maxKey: '_typography---font-size--display-max' },
    { label: 'Heading 1', minKey: '_typography---font-size--h1-min', maxKey: '_typography---font-size--h1-max' },
    { label: 'Heading 2', minKey: '_typography---font-size--h2-min', maxKey: '_typography---font-size--h2-max' },
    { label: 'Heading 3', minKey: '_typography---font-size--h3-min', maxKey: '_typography---font-size--h3-max' },
    { label: 'Heading 4', minKey: '_typography---font-size--h4-min', maxKey: '_typography---font-size--h4-max' },
    { label: 'Heading 5', minKey: '_typography---font-size--h5-min', maxKey: '_typography---font-size--h5-max' },
    { label: 'Heading 6', minKey: '_typography---font-size--h6-min', maxKey: '_typography---font-size--h6-max' },
    { label: 'Text Large', minKey: '_typography---font-size--text-large-min', maxKey: '_typography---font-size--text-large-max' },
    { label: 'Paragraph (Main)', minKey: '_typography---font-size--text-main-min', maxKey: '_typography---font-size--text-main-max' },
    { label: 'Text Small', minKey: '_typography---font-size--text-small-min', maxKey: '_typography---font-size--text-small-max' },
  ];

  const spacingPairs = [
    { label: 'Section Space', minKey: '_spacing---section-space--main-min', maxKey: '_spacing---section-space--main-max' },
    { label: 'Space 1', minKey: '_spacing---space--1-min', maxKey: '_spacing---space--1-max' },
    { label: 'Space 2', minKey: '_spacing---space--2-min', maxKey: '_spacing---space--2-max' },
    { label: 'Space 3', minKey: '_spacing---space--3-min', maxKey: '_spacing---space--3-max' },
    { label: 'Space 4', minKey: '_spacing---space--4-min', maxKey: '_spacing---space--4-max' },
    { label: 'Space 5', minKey: '_spacing---space--5-min', maxKey: '_spacing---space--5-max' },
    { label: 'Space 6', minKey: '_spacing---space--6-min', maxKey: '_spacing---space--6-max' },
    { label: 'Space 7', minKey: '_spacing---space--7-min', maxKey: '_spacing---space--7-max' },
    { label: 'Space 8', minKey: '_spacing---space--8-min', maxKey: '_spacing---space--8-max' },
  ];

  return (
    <div className="flex flex-col w-full pb-8 pr-1">
      {renderAccordion('General', 'general', (
        <>
          <div className="mb-4">
            <h4 className="text-xs font-semibold mb-2">Viewport (Unitless)</h4>
            {renderNumberInput('Max Width', 'site--viewport-max', '1')}
            {renderNumberInput('Min Width', 'site--viewport-min', '1')}
          </div>
          <div className="mb-4">
            <h4 className="text-xs font-semibold mb-2">Grid & Layout</h4>
            {renderNumberInput('Columns', 'site--column-count', '1')}
            {renderTextInput('Gutter', 'site--gutter')}
          </div>
          <div>
            {renderPairGroups([{ label: 'Site Margin (REM)', minKey: 'site--margin-min', maxKey: 'site--margin-max' }])}
          </div>
        </>
      ))}

      {renderAccordion('Spacing', 'spacing', renderPairGroups(spacingPairs))}

      {renderAccordion('Type Size', 'typesize', renderPairGroups(typographyPairs))}

      {renderAccordion('Typography', 'typography', (
        <>
          {renderTextInput('Font Family', '_text-style---font-family')}
          {renderTextInput('Font Weight', '_text-style---font-weight')}
          {renderNumberInput('Line Height', '_text-style---line-height', '0.1')}
          {renderTextInput('Margin Bottom', '_text-style---margin-bottom')}
          
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold mb-2">Text Trim (Capsize)</h4>
            {renderTextInput('Trim Top (em)', '_text-style---trim-top')}
            {renderTextInput('Trim Bottom (em)', '_text-style---trim-bottom')}
            {renderTextInput('Optical Offset (em)', '_text-style---optical-offset')}
          </div>
        </>
      ))}

      {renderAccordion('Colors', 'colors', (
        <>
          {renderColorInput('Primary', 'color--primary')}
          {renderColorInput('Primary Dark', 'color--primary-dark')}
          {renderColorInput('Secondary', 'color--secondary')}
          
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="text-xs font-semibold mb-2 flex justify-between">Grey Scale <span className="text-muted-foreground font-normal">900-50</span></h4>
            {renderColorInput('900', 'color--grey-900')}
            {renderColorInput('800', 'color--grey-800')}
            {renderColorInput('700', 'color--grey-700')}
            {renderColorInput('600', 'color--grey-600')}
            {renderColorInput('500', 'color--grey-500')}
            {renderColorInput('400', 'color--grey-400')}
            {renderColorInput('300', 'color--grey-300')}
            {renderColorInput('200', 'color--grey-200')}
            {renderColorInput('100', 'color--grey-100')}
            {renderColorInput('50', 'color--grey-50')}
          </div>
        </>
      ))}

      {renderAccordion('Theme', 'theme', (
        <>
          <div className="mb-4">
            <h4 className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-100 text-zinc-800 mb-2 border border-zinc-200">LIGHT</h4>
            {renderColorInput('Background', 'theme-light--background')}
            {renderColorInput('Text Main', 'theme-light--text-main')}
            {renderColorInput('Text Muted', 'theme-light--text-muted')}
            {renderColorInput('Border', 'theme-light--border')}
            {renderColorInput('Accent', 'theme-light--accent')}
          </div>
          <div className="mt-4 pt-4 border-t border-border">
            <h4 className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-zinc-900 text-zinc-100 mb-2 border border-zinc-700">DARK</h4>
            {renderColorInput('Background', 'theme-dark--background')}
            {renderColorInput('Text Main', 'theme-dark--text-main')}
            {renderColorInput('Text Muted', 'theme-dark--text-muted')}
            {renderColorInput('Border', 'theme-dark--border')}
            {renderColorInput('Accent', 'theme-dark--accent')}
          </div>
        </>
      ))}
    </div>
  );
}
