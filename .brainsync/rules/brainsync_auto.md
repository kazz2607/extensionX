

# Project Memory — extensionX
> 532 notes | Score threshold: >40

## Safety — Never Run Destructive Commands

> Dangerous commands are actively monitored.
> Critical/high risk commands trigger error notifications in real-time.

- **NEVER** run `rm -rf`, `del /s`, `rmdir`, `format`, or any command that deletes files/directories without EXPLICIT user approval.
- **NEVER** run `DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or any destructive database operation.
- **NEVER** run `git push --force`, `git reset --hard`, or any command that rewrites history.
- **NEVER** run `npm publish`, `docker rm`, `terraform destroy`, or any irreversible deployment/infrastructure command.
- **NEVER** pipe remote scripts to shell (`curl | bash`, `wget | sh`).
- **ALWAYS** ask the user before running commands that modify system state, install packages, or make network requests.
- When in doubt, **show the command first** and wait for approval.

**Stack:** TypeScript

## 📝 NOTE: 1 uncommitted file(s) in working tree.\n\n## Important Warnings

- **⚠️ GOTCHA: Fixed null crash in HTMLElement — parallelizes async operations for speed** — - // UI-06: Cập nhật progress bar live của queue item đang downloading
- **⚠️ GOTCHA: Fixed null crash in File — parallelizes async operations for speed** — -     return `<li class="queue-item status-${item.status}" data-id="${
- **⚠️ GOTCHA: Fixed null crash in Stop — parallelizes async operations for speed** — - }
+ 
- 
+   // Bug 2: Stop button cho item đang downloading trong qu
- **⚠️ GOTCHA: Fixed null crash in Restore — parallelizes async operations for speed** — -       ${canRemove ? `<button class="btn-queue-remove" data-id="${ite
- **⚠️ GOTCHA: Fixed null crash in downloader — offloads heavy computation off the main thread** — - export { startDownload, handleDownloadTweet, activeErrors, buildCSV,
- **gotcha in service-worker.ts** — - const KEEPALIVE_ALARM = 'sw-keepalive';
- chrome.alarms.onAlarm.addL

## Active: `src/options`

- **Replaced dependency Logic — confirmed 3x**
- **Patched security issue Reset — prevents XSS injection attacks — confirmed 3x**
- **decision in options.ts**
- **Strengthened types Bookmarks**
- **Patched security issue Reset — prevents XSS injection attacks**

## Project Standards

- Replaced dependency Logic — confirmed 3x
- Patched security issue Reset — prevents XSS injection attacks — confirmed 3x
- Strengthened types Bookmarks
- Fixed null crash in Queue — prevents null/undefined runtime crashes — confirmed 6x
- Strengthened types QueueExportData — formalizes the data contract with explic...
- Fixed null crash in Stop — prevents null/undefined runtime crashes — confirmed 5x
- Fixed null crash in Queue — prevents null/undefined runtime crashes — confirmed 8x
- Fixed null crash in Realtime — prevents null/undefined runtime crashes — confirmed 9x

## Known Fixes

- ❌ - - Fixed null crash in Error — prevents null/undefined runtime crashes → ✅ problem-fix in agent-rules.md
- ❌ - - Fixed null crash in PERF — prevents null/undefined runtime crashes → ✅ problem-fix in agent-rules.md
- ❌ - - Fixed null crash in Queue — prevents null/undefined runtime crashes → ✅ Patched security issue GOTCHA
- ❌ - - Fixed null crash in Profile — parallelizes async operations for speed → ✅ Patched security issue Patched
- ❌ - - Fixed null crash in Export — adds runtime type validation before use → ✅ problem-fix in agent-rules.md

## Recent Decisions

- decision in options.ts
- Optimized Score — evolves the database schema to support new requirements
- Optimized Queue — prevents XSS injection attacks
- Optimized Settings — hardens HTTP security headers

## Learned Patterns

- When encountering this, fix by: Patched security issue GOTCHA (seen 2x)
- Decision: Optimized GOTCHA (seen 2x)
- Avoid: ⚠️ GOTCHA: Patched security issue GOTCHA (seen 2x)
- Agent generates new migration for every change (squash related changes)
- Agent installs packages without checking if already installed

### 📚 Core Framework Rules: [tinybirdco/tinybird-typescript-sdk-guidelines]
# Tinybird TypeScript SDK Guidelines

Guidance for using the `@tinybirdco/sdk` package to define Tinybird resources in TypeScript with complete type inference.

## When to Apply

- Installing or configuring @tinybirdco/sdk
- Defining datasources or pipes in TypeScript
- Creating typed Tinybird clients
- Using type-safe ingestion or queries
- Running tinybird dev/build/deploy commands for TypeScript projects
- Migrating from legacy .datasource/.pipe files to TypeScript
- Defining connections (Kafka, S3, GCS)
- Creating materialized views, copy pipes, or sink pipes

## Rule Files

- `rules/getting-started.md`
- `rules/configuration.md`
- `rules/defining-datasources.md`
- `rules/defining-endpoints.md`
- `rules/typed-client.md`
- `rules/low-level-api.md`
- `rules/cli-commands.md`
- `rules/connections.md`
- `rules/materialized-views.md`
- `rules/copy-sink-pipes.md`
- `rules/tokens.md`

## Quick Reference

- Install: `npm install @tinybirdco/sdk`
- Initialize: `npx tinybird init`
- Dev mode: `tinybird dev` (uses configured `devMode`, typically branch)
- Build: `tinybird build` (builds against configured dev target)
- Deploy: `tinybird deploy` (deploys to main/production)
- Preview in CI: `tinybird preview`
- Server-side only; never expose tokens in browsers

- [JavaScript/TypeScript] Use === not == (strict equality prevents type coercion bugs)
- [JavaScript/TypeScript] Use const by default, let when reassignment needed, never var

## Available Tools (ON-DEMAND only)
- `sys_core_01(q)` — Deep search when stuck
- `sys_core_05(query)` — Full-text lookup
> Context above IS your context. Do NOT call sys_core_14() at startup.
