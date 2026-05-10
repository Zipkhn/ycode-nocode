# Memory — Preferences & Decisions

## Post-Merge Upstream
- **Toujours suivre `.claude/memory/PostMergeChecklist.md`** après chaque `git pull upstream` ou merge upstream/main.
- Le tsc + build ne détectent PAS les régressions de rendu (Lottie, dimensions Studio, etc.). Tester en navigateur.

## Terminology
- **Studio** = the custom left-panel plugin (design system manager)
- **Sidebar** = the native Ycode right panel (style/properties panel)
- Never confuse the two.

## Coding Preferences
- **No comments** unless the WHY is non-obvious (hidden constraint, workaround, subtle invariant)
- **No extra abstractions** — solve only what was asked, nothing speculative
- **Surgical edits** — touch only what is needed, never "clean up" adjacent code
- **Short responses** — no trailing summaries, no recap of what was done
- Prefer editing existing files over creating new ones

## Studio — Key Decisions
- Radius and border-width tokens are stored in **rem** in the CSS (`0.5rem`, `1rem`, `0.094rem`). `radius--round` stays `9999px` (symbolic value).
- Font-sizes are stored as **unitless rem numbers** (e.g. `2` = 2rem). Figma export multiplies ×16 → px.
- Spacing tokens are **not imported** from Figma — Studio keeps its ratio-based fluid scale.
- Figma export = ZIP with 6 W3C Design Tokens files (one per collection/mode).
- Figma import = one file at a time; mode detected from `$extensions.com.figma.modeName`.

## Studio — CSS Architecture Rules
- New variables always inserted **inside** the `/* STUDIO_THEME_END */` block (never standalone `:root {}`).
- The `STUDIO_RUNTIME_BRIDGES` block is always replaced in-place (never appended) — exactly 1 blank line after `STUDIO_CORE_END`.
- Both `app/global-theme.css` and `public/global-theme.css` must stay in sync (the API writes both).

## Components
- `StudioThemeEditor.tsx` is large (~1200+ lines). Always read in offset chunks.
- Pre-commit Husky hook lints staged files only — after fixing ESLint errors, always `git add` before committing.
- French text in JSX requires HTML entities: `'` → `&apos;`, `"` → `&ldquo;`/`&rdquo;`.

## What to Avoid
- Do not create standalone `:root {}` blocks in `global-theme.css` for new variables.
- Do not accumulate blank lines between CSS sections (use `.trimEnd()` before appending).
- Do not use `num()` / `parseFloat()` directly on rem values for Figma export — use a `cssValToPx()` helper.
