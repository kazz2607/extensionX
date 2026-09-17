# extensionX — Project Memory

> Auto-synced | 1196 observations

**Stack:** TypeScript

## 🏛️ CORE ARCHITECTURE

> **CRITICAL:** The following rules represent strict architectural boundaries defined by the user. NEVER violate them in your generated code or explanations.

# Intellectual Property & Architecture Rules
Write your strict architectural boundaries here. 
BrainSync will automatically enforce these rules across all agents (Cursor, Windsurf, Cline) 
and inject them into the memory context.

Example:
- NEVER use TailwindCSS. Only use vanilla CSS.
- NEVER write class components. Only use functional React components.

## 🛡️ GLOBAL SAFETY RULES

- **NEVER** run `git clean -fd` or `git reset --hard` without checking `git log` and verifying commits exist.
- **NEVER** delete untracked files or folders blindly. Always backup or stash before bulk edits.

## 🧭 ACTIVE CONTEXT

> Always read `.cursor/active-context.md` for exact instructions on the specific file you are currently editing. It updates dynamically.

## 🔴 STOP — READ THESE FIRST

- **Agent: follow existing project patterns — don't introduce a different style** — Agent: follow existing project patterns — don't introduce a different style
- **Agent: don't generate code with "any" type — define proper TypeScript types** — Agent: don't generate code with "any" type — define proper TypeScript types
- **Agent: always handle loading/error states — don't just render data** — Agent: always handle loading/error states — don't just render data
- **Agent: don't use deprecated APIs — check library version, use current API** — Agent: don't use deprecated APIs — check library version, use current API
- **Agent: check existing code before creating utility functions — avoid duplicates** — Agent: check existing code before creating utility functions — avoid duplicates

## 📐 Conventions

- Git Commit: feat: bump version 5.3.0 — UI Polish — confirmed 3x
- Use .dockerignore to exclude unnecessary files
- Use multi-stage builds to reduce image size
- Enable strict mode in tsconfig.json
- Prefer Array methods (map, filter, reduce) over manual loops
- Use template literals for string interpolation, not concatenation
- Use optional chaining (?.) and nullish coalescing (??) for safe access
- Use const by default, let when reassignment needed, never var

## ⚡ Available Tools (ON-DEMAND only)
- `sys_core_02(title, content, category)` — Save a note + auto-detect conflicts
- `sys_core_03(items[])` — Save multiple notes in 1 call
- `sys_core_01(text)` — Search memory for architecture, past fixes, decisions
- `sys_core_05(text)` — Full-text search for details
- `sys_core_16()` — Check compiler errors after edits

> ℹ️ DO NOT call sys_core_14() or sys_core_08() at startup — context above IS your context.

---
*Auto-synced | 2026-06-05*
