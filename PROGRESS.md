# VibeDiff Progress Tracker

## Status: Working v0.2.0 - ~65% complete

All three hook layers are live and tested with real Claude Code sessions.

---

## Done

### Three-Layer Hook Architecture (THE CORE FEATURE)
- [x] **PreToolUse hook** - Captures file content BEFORE Claude edits. Stores to pre-capture.json. Fixes the old content reconstruction problem.
- [x] **PostToolUse hook** - Reads file AFTER edit, pairs with pre-captured old content for perfect diffs. Injects terse warning into Claude's context when removed exports are detected.
- [x] **Stop hook (Quality Gate)** - Runs full semantic analysis when Claude finishes responding. Blocks Claude on CRITICAL risk, forces self-review. Warns on HIGH. Silent on LOW/MEDIUM. Loop prevention via stop_hook_active check and reported-issues tracking.
- [x] **Tested live with real Claude Code** - All three hooks fire correctly. Stop hook blocked Claude at CRITICAL (score 15), let through at HIGH (score 9) after fixes applied.

### Core Architecture
- [x] Project structure (TypeScript, compiled to dist/)
- [x] Type definitions for all data structures
- [x] CLI with 6 commands (report, commit-msg, pr-desc, status, clear, setup)
- [x] Session storage system (.vibe-diff/session.json)
- [x] Pre-capture storage (.vibe-diff/pre-capture.json)
- [x] Path normalization (all forward slashes in storage)
- [x] Error isolation (hooks exit 1 on error, never crash Claude Code)
- [x] Git diff fallback for old content when pre-capture misses

### Analysis Engine
- [x] Diff computation (line-level added/removed)
- [x] Function extraction (regex-based: function declarations, arrow functions, class methods)
- [x] Export extraction (named exports, re-exports, default exports)
- [x] Type/interface/enum extraction
- [x] Return type change detection
- [x] Parameter change detection
- [x] Async/sync change detection
- [x] Reserved word filtering (no false positives on if/for/while etc.)

### Categorization
- [x] Behavior change detection (try/catch, logging, async, fetch, routes, security)
- [x] API change detection (exports, function signatures, types)
- [x] Breaking change detection (removed exports, return type changes, param changes)
- [x] Config change detection (package.json version, scripts, general config files)
- [x] Dependency change detection (added/removed/upgraded/downgraded packages)
- [x] Security pattern detection (innerHTML, eval, SQL injection)

### Import and Dependency Scanning
- [x] Basic import pattern matching (ES modules, CommonJS require)
- [x] Find files that import changed modules
- [x] Detect broken symbols (uses removed export)
- [x] Convention-based test file mapping (*.test.ts, *.spec.ts, __tests__/)

### Risk Scoring
- [x] Score computation based on breaking changes, dependents, tests, security
- [x] LOW/MEDIUM/HIGH/CRITICAL thresholds with distinct behavior per level
- [x] Human-readable risk reasons

### Output
- [x] Colored terminal output with sections (files, behavior, API, breaking, side effects, tests, deps, risk)
- [x] Markdown report generation
- [x] Commit message generation from changes
- [x] PR description generation

### Testing
- [x] Manual integration test with fake auth/login scenario (passed)
- [x] Live test with real Claude Code session (passed)
- [x] PreToolUse captures old content correctly (confirmed)
- [x] PostToolUse pairs with pre-capture and records diffs (confirmed)
- [x] PostToolUse injects context warning on removed exports (confirmed)
- [x] Stop hook blocks at CRITICAL risk (confirmed, score 15)
- [x] Stop hook allows at HIGH risk (confirmed, score 9)
- [x] Stop hook loop prevention works (confirmed, does not re-block on same issues)

---

## Not Done

### Important (needed for v1.0 release quality)

- [ ] **Race condition on concurrent edits** - Multiple PostToolUse hooks fire in parallel on rapid edits. Session.json read-modify-write can lose data. Fix: switch to append-only .jsonl or file locking.
- [ ] **Multi-line function signatures** - Current regex fails on functions with params spanning multiple lines, generics, decorators.
- [ ] **Barrel export handling** - `export * from './module'` and `export { default as Name } from './module'` not handled.
- [ ] **Path alias resolution** - tsconfig `paths` (like `@/components/...`) not resolved. Import scanner won't find dependents using aliases.
- [ ] **Unit test suite** - Tests for diff-parser, categorizer, import-scanner, risk-scorer.
- [ ] **Large file handling** - Cap analysis on files over N lines to avoid slowdowns in Stop hook.
- [ ] **JSX/TSX handling** - Component return types, props interfaces, hook patterns.
- [ ] **npm global install** - `npm i -g vibe-diff` with proper bin shebang and postinstall.
- [ ] **One-command setup** - `npx vibe-diff init` to auto-configure hooks in settings.json.
- [ ] **Context bloat prevention** - PostToolUse injects context on every edit with removed exports. On 40+ edits this could bloat context. Fix: only inject on first detection or on risk level change.

### Nice to Have (v1.1+)

- [ ] Python support (def/class extraction, import analysis)
- [ ] Go support (func extraction, import analysis)
- [ ] Rust support (fn/impl extraction, use analysis)
- [ ] LLM-powered summaries (optional, via Claude Agent SDK) for richer descriptions
- [ ] Watch mode (`vibe-diff watch` with live terminal updates via fs.watch on session.json)
- [ ] Claude Code Skill (`.claude/skills/vibediff.md`) for `/vibediff` command
- [ ] Session history (compare across sessions)
- [ ] VS Code extension wrapper
- [ ] CI/CD pipeline (GitHub Actions: lint, test, build)
- [ ] npm publish pipeline
- [ ] Git-based adapter for Cursor/Windsurf/any editor (polls `git diff`, no hooks needed)
- [ ] Monorepo support (multiple package.json files, workspace awareness)
- [ ] HTTP hook mode (background server instead of process-per-hook, sub-10ms response)

---

## Known Issues

1. Regex-based function extraction misses multi-line signatures
2. Import scanner does not resolve tsconfig path aliases
3. No automated test suite
4. Concurrent PostToolUse hooks can create race conditions on session.json
5. PostToolUse context injection fires on every edit with removed exports (could bloat context on many edits)

---

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| src/types.ts | 130 | All TypeScript type definitions |
| src/cli.ts | 190 | CLI entry point, 6 commands, setup instructions |
| src/hooks/pre-tool-use.ts | 70 | PreToolUse hook: captures old content before edits |
| src/hooks/post-tool-use.ts | 170 | PostToolUse hook: records diffs, injects context warnings |
| src/hooks/stop.ts | 150 | Stop hook: quality gate, blocks on CRITICAL risk |
| src/core/collector.ts | 85 | Session change storage with path normalization |
| src/core/diff-parser.ts | 180 | Function/export/type/import extraction |
| src/core/categorizer.ts | 280 | Change categorization engine |
| src/core/import-scanner.ts | 190 | Dependency and test file scanning |
| src/core/risk-scorer.ts | 85 | Risk assessment scoring |
| src/core/analyzer.ts | 160 | Main analysis orchestrator |
| src/output/terminal.ts | 150 | Colored terminal output |
| src/output/markdown.ts | 190 | Markdown, commit msg, PR desc generation |
| **Total** | **~2,030** | |
