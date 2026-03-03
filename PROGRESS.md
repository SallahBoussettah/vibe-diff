# VibeDiff Progress Tracker

## Status: Prototype (v0.1.0) - ~30% complete

## Done

### Core Architecture
- [x] Project structure (TypeScript, compiled to dist/)
- [x] Type definitions for all data structures
- [x] CLI with 6 commands (report, commit-msg, pr-desc, status, clear, setup)
- [x] PostToolUse hook skeleton for Edit/Write tracking
- [x] Session storage system (.vibe-diff/session.json)

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

### Import & Dependency Scanning
- [x] Basic import pattern matching (ES modules, CommonJS require)
- [x] Find files that import changed modules
- [x] Detect broken symbols (uses removed export)
- [x] Convention-based test file mapping (*.test.ts, *.spec.ts, __tests__/)

### Risk Scoring
- [x] Score computation based on breaking changes, dependents, tests, security
- [x] LOW/MEDIUM/HIGH/CRITICAL thresholds
- [x] Human-readable risk reasons

### Output
- [x] Colored terminal output with sections (files, behavior, API, breaking, side effects, tests, deps, risk)
- [x] Markdown report generation
- [x] Commit message generation from changes
- [x] PR description generation

### Testing
- [x] Manual integration test with fake auth/login scenario (passed)
- [x] Verified: detects breaking changes, new files, new deps, risk scoring works

---

## Not Done

### Critical (must fix before v1.0)

- [ ] **Test with real Claude Code sessions** - Hook input format is assumed, not verified. Need to confirm the JSON schema Claude Code sends to PostToolUse hooks.
- [ ] **Hook error isolation** - If the hook throws, does it break Claude Code? Need try/catch wrapping, silent failure, stderr logging.
- [ ] **Handle Write tool properly** - For Write (full file overwrite), the old content is gone by the time PostToolUse fires. Need a PreToolUse hook to capture old content, or use git diff as fallback.
- [ ] **Git diff fallback** - When session tracking misses something, fall back to `git diff` to get actual changes. More reliable for edge cases.
- [ ] **Multi-line function signatures** - Current regex fails on functions with params spanning multiple lines, generics, decorators.
- [ ] **Barrel export handling** - `export * from './module'` and `export { default as Name } from './module'` not handled.
- [ ] **Path alias resolution** - tsconfig `paths` (like `@/components/...`) not resolved. Import scanner won't find dependents using aliases.

### Important (needed for quality)

- [ ] **Unit test suite** - Tests for diff-parser, categorizer, import-scanner, risk-scorer
- [ ] **Integration tests** - End-to-end tests with realistic codebases
- [ ] **JSX/TSX handling** - Component return types, props interfaces, hook patterns
- [ ] **Class method analysis** - Constructor changes, static methods, getters/setters
- [ ] **Destructured export handling** - `export const { a, b } = obj`
- [ ] **Binary file detection** - Skip binary files (images, compiled assets)
- [ ] **Large file handling** - Cap analysis on files over N lines to avoid slowdowns
- [ ] **Config file support** - Read .vibediffrc or vibe-diff.config.json for user preferences
- [ ] **Proper npm bin setup** - Shebang lines, postinstall build verification

### Nice to Have (v1.1+)

- [ ] Python support (def/class extraction, import analysis)
- [ ] Go support (func extraction, import analysis)
- [ ] Rust support (fn/impl extraction, use analysis)
- [ ] LLM-powered summaries (optional, via Claude Agent SDK) for richer descriptions
- [ ] Clipboard copy command (`vibe-diff report --copy`)
- [ ] Watch mode (live updating report as Claude works)
- [ ] Session history (compare across sessions)
- [ ] Interactive terminal UI (scrollable, collapsible sections)
- [ ] VS Code extension wrapper
- [ ] CI/CD pipeline (GitHub Actions: lint, test, build)
- [ ] npm publish pipeline
- [ ] Monorepo support (multiple package.json files, workspace awareness)

---

## Known Issues

1. Regex-based function extraction misses multi-line signatures
2. Import scanner does not resolve tsconfig path aliases
3. Write hook cannot capture old file content (PostToolUse fires after write)
4. No test suite exists
5. Hook JSON schema from Claude Code is assumed, not verified
6. No error boundary in hook (crash could affect Claude Code session)

---

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| src/types.ts | 120 | All TypeScript type definitions |
| src/cli.ts | 130 | CLI entry point, 6 commands |
| src/hooks/post-tool-use.ts | 110 | PostToolUse hook for Claude Code |
| src/core/collector.ts | 70 | Session change storage |
| src/core/diff-parser.ts | 170 | Function/export/type/import extraction |
| src/core/categorizer.ts | 280 | Change categorization engine |
| src/core/import-scanner.ts | 190 | Dependency and test file scanning |
| src/core/risk-scorer.ts | 85 | Risk assessment scoring |
| src/core/analyzer.ts | 160 | Main analysis orchestrator |
| src/output/terminal.ts | 150 | Colored terminal output |
| src/output/markdown.ts | 190 | Markdown, commit msg, PR desc |
| **Total** | **~1,655** | |
