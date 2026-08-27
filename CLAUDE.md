# CLAUDE.md

> **ALWAYS refer to files in `.claude/memory/` for preferences and project context before starting a task. Update these files when significant decisions are made.**

## 0. Context & Memory (PRIORITY)
- **Consult first:** Read `.claude/memory/Context.md` (state/stack) and `.claude/memory/Memory.md` (style/decisions).
- **Self-Evolution:** Update `.claude/memory/Memory.md` after any major change or new preference.
- **Laconic Mode:** Be extremely brief. No pleasantries. No "Certainly!", "I understand", or "Here is the code". Provide the solution directly.

## 1. Token Efficiency (Cost Optimization)
- **No Repetition:** Never restate my instructions.
- **Dry Output:** If code is self-explanatory, provide **zero** commentary.
- **Brief Planning:** Use ultra-short bullet points for plans (max 5 words per step).
- **Minimal Diffs:** Use surgical line edits. Avoid reprinting large blocks of unchanged code.
- **Caveman Logic:** If a one-sentence explanation suffices, do not write a paragraph.

## 2. Think Before Coding
- **Don't assume.** Surface tradeoffs and ask clarifying questions *before* writing code.
- If multiple interpretations exist, present them briefly.
- If a simpler approach exists, push back.

## 3. Simplicity First
- **Minimum code** that solves the problem. No speculative features or abstractions.
- No "flexibility" that wasn't requested.
- If you can do it in 50 lines instead of 200, rewrite it.

## 4. Surgical Changes
- **Touch only what you must.** Match existing style perfectly.
- Do not "improve" or "refactor" adjacent code unless explicitly asked.
- Remove orphans (imports/vars) created by YOUR changes only.

## 5. Goal-Driven Execution
- Define success criteria and verify (tests or manual checks).
- For multi-step tasks, follow this format:
  1. [Task] -> [Check]
  2. [Task] -> [Check]

---
**Status:** Efficiency-focused. Fewer tokens, fewer mistakes, surgical precision.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
