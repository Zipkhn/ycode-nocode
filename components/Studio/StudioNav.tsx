'use client';

import React from 'react';

export type StudioSection =
  | 'general'
  | 'typography'
  | 'textstyle'
  | 'colors'
  | 'theme'
  | 'spacing'
  | 'layout';

const NAV_ITEMS: { id: StudioSection; label: string; icon: string }[] = [
  { id: 'general',    label: 'General',     icon: '⚙' },
  { id: 'typography', label: 'Typography',  icon: 'T' },
  { id: 'textstyle',  label: 'Text Style',  icon: '¶' },
  { id: 'colors',     label: 'Colors',      icon: '◉' },
  { id: 'theme',      label: 'Theme',       icon: '◑' },
  { id: 'spacing',    label: 'Spacing',     icon: '↕' },
  { id: 'layout',     label: 'Layout',      icon: '⊟' },
];

interface Props {
  active: StudioSection;
  onChange: (s: StudioSection) => void;
}

export function StudioNav({ active, onChange }: Props) {
  return (
    <nav className="flex flex-col w-[180px] shrink-0 border-r border-white/10 py-3 gap-0.5">
      {NAV_ITEMS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={[
            'flex items-center gap-2.5 px-4 py-2 text-[12px] text-left rounded-none transition-colors w-full',
            active === id
              ? 'bg-white/10 text-white font-medium'
              : 'text-white/50 hover:bg-white/5 hover:text-white',
          ].join(' ')}
        >
          <span className="w-4 text-center text-[13px] shrink-0 opacity-70">{icon}</span>
          {label}
        </button>
      ))}
    </nav>
  );
}
