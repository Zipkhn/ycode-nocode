# Project Context — Ycode

## Purpose
Ycode is a **visual website builder and CMS** (open-source fork of the Ycode Cloud product). It lets users build and manage websites visually without writing code. The repo is self-hostable (Supabase + Vercel).

## Tech Stack
| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4, Radix UI, shadcn/ui |
| State | Zustand 5 (19 stores in `/stores/`) |
| Backend / DB | Supabase (auth + database) |
| Rich text | TipTap 3 |
| Animation | @react-spring/web |
| Forms | react-hook-form |
| Language | TypeScript 5 |
| Linting | ESLint + pre-commit Husky hook |

## Architecture
```
app/
  (builder)/ycode/     → Builder UI (editor, settings, integrations)
  (site)/              → Published site renderer
  api/studio/          → API for reading/writing global-theme.css
components/            → Shared components (Canvas, LayerRenderer, StudioThemeEditor…)
stores/                → Zustand stores (pages, editor, components, fonts, colors…)
public/global-theme.css → Live theme file (read by iframe canvas)
app/global-theme.css   → Mirrored theme file (same content)
```

## Custom Plugin: Studio (Lumos)
A design-system panel injected into the builder's left sidebar. Key responsibilities:
- **Token management**: colors, typography (fluid font sizes), spacing (ratio scale), radius, border-width, theme light/dark
- **CSS generation**: writes `global-theme.css` via `/api/studio` + injects a runtime bridge into canvas iframes
- **Figma sync**: export as multi-file ZIP (W3C Design Tokens, 6 collections), import single-file JSON per collection
- **Ycode palette sync**: pushes Studio tokens to Ycode's `color-variables` store

### Studio Files
| File | Role |
|---|---|
| `components/StudioThemeEditor.tsx` | Main Studio panel UI + all logic |
| `app/api/studio/route.ts` | GET/POST for `global-theme.css` |
| `app/global-theme.css` | Theme source (STUDIO_CORE + STUDIO_THEME + STUDIO_RUNTIME_BRIDGES sections) |
| `app/(builder)/ycode/components/ElementLibrary.tsx` | Hosts the Clean Slate toggle |
| `stores/useEditorStore.ts` | `cleanSlate` state |
| `stores/usePagesStore.ts` | `addLayerFromTemplate` — applies Clean Slate stripping |

## Integrations
- **N8N**: webhook-based automation (settings at `integrations/apps/n8n-settings.tsx`)
- **Airtable**: CMS sync (`integrations/apps/airtable-settings.tsx`)
- **MCP**: AI tooling integration (`integrations/mcp/`)

## Current Version & State
- **Version**: v11 (as of 2026-04-24)
- **Recent work**: Studio token system refactored — added radius/border-width tokens, background-2 theme slots, Figma ZIP export (6 W3C collections), Figma single-file import with mode detection, N8N integration, Clean Slate feature
- **Known conventions**:
  - Studio stores radius/border-width in **rem** (except `radius--round: 9999px`)
  - Studio stores font-sizes as **unitless rem numbers** (e.g. `2` = 2rem)
  - Figma export converts rem → px (unitless numbers); import converts back
  - New CSS variables are inserted inside the `/* STUDIO_THEME_END */` block, never as standalone `:root {}` blocks
  - `STUDIO_RUNTIME_BRIDGES_START/END` block is always exactly 1 blank line after `STUDIO_CORE_END`
