# Vibe Diff

AI code safety net for Claude Code. Detects breaking changes, blocks Claude on critical risk, and generates semantic diffs in plain English.

VibeDiff runs silently in the background. When Claude introduces breaking changes, it gets blocked and forced to fix them before continuing. No second terminal. No commands to remember. Just install and forget.

```
Stop hook feedback:
VibeDiff detected CRITICAL risk (score: 15).

Breaking changes:
  - REMOVED export: PaymentResult from payments.ts
  - REMOVED export: getPaymentHistory from payments.ts
  - REMOVED function: getPaymentHistory() from payments.ts
  - BREAKING: processPayment() return type changed in payments.ts
  - BREAKING: processPayment() parameters changed in payments.ts

Please review these breaking changes and fix affected files before finishing.
```

Claude gets blocked. Claude fixes the code. Claude continues. You didn't have to do anything.

## How it works

Three hooks run automatically during every Claude Code session:

**PreToolUse** -- Captures file content before Claude edits it.

**PostToolUse** -- Records the change after edit. If exports were removed, injects a short warning into Claude's context so Claude becomes aware of the risk.

**Stop (Quality Gate)** -- When Claude finishes responding, runs full semantic analysis on all accumulated changes. If risk is CRITICAL, blocks Claude and forces a self-review. If risk is HIGH, warns. If LOW/MEDIUM, stays silent.

```
PreToolUse          PostToolUse              Stop
(before edit)       (after edit)             (Claude done)
     |                   |                       |
  capture old       record diff             full analysis
  content           warn on removed         CRITICAL? block Claude
                    exports                 HIGH? warn
                                            LOW? silent
```

## Quick start

```bash
git clone https://github.com/SallahBoussettah/vibe-diff.git
cd vibe-diff
npm install
npm run build
```

Then run the init command to auto-configure Claude Code hooks:

```bash
# Project-level (recommended)
node dist/cli.js init

# Or global (all projects)
node dist/cli.js init --global
```

Restart Claude Code. Done.

## What it detects

**Behavior changes** -- async/await patterns, error handling, API calls, route changes, security issues (innerHTML, eval, SQL injection)

**API changes** -- added/removed/modified exported functions, return type changes, parameter changes, async/sync conversion, type/interface/enum changes

**Breaking changes** -- removed exports, function signature changes, deleted files with dependents

**Side effects** -- files that import changed modules but were not updated

**Test impact** -- test files related to changed source that were not updated

**Dependencies** -- new, removed, upgraded, or downgraded npm packages

**Risk scoring** -- LOW / MEDIUM / HIGH / CRITICAL with clear reasoning

## CLI commands

```bash
vibe-diff init            # Auto-configure hooks in Claude Code settings
vibe-diff init --global   # Configure in global ~/.claude/settings.json
vibe-diff report          # Show semantic diff of current session
vibe-diff report --md     # Output as markdown
vibe-diff commit-msg      # Generate a commit message from changes
vibe-diff pr-desc         # Generate a PR description from changes
vibe-diff status          # Show how many changes are tracked
vibe-diff clear           # Clear session data
vibe-diff setup           # Print hook configuration for manual setup
```

## Report output

```
  Vibe Diff
  ----------------------------------------------------------------
  Session: 3 file(s), +36 -10 lines

  Files Changed
    * src/auth/login.ts
    + src/auth/oauth.ts
    * package.json

  Behavior Changes
    > [login.ts] login() return type changed -- callers may break
    > [login.ts] login() parameters changed -- callers need updating
    > [oauth.ts] New file created

  API Changes
    > removed export: User (interface) in login.ts
    > added export: Session (interface) in login.ts
    > Modified: login(): return type changed, parameters changed

  Breaking Changes
    ! REMOVED export: User from login.ts
    ! BREAKING: login() return type changed in login.ts
    ! BREAKING: login() parameters changed in login.ts

  Dependencies
    + jsonwebtoken ^9.0.0

  ----------------------------------------------------------------
  Risk: CRITICAL (score: 12)
    - 4 breaking API change(s)
    - Removed export: User (login.ts)
    - Return type changed: login() (login.ts)
```

## How the Stop hook works

When Claude finishes its response:

1. Stop hook loads all changes accumulated during the turn
2. Runs full semantic analysis (functions, exports, types, imports, dependencies)
3. Computes a risk score based on breaking changes, unupdated dependents, and security issues
4. **CRITICAL (score 12+)**: outputs `decision: "block"` -- Claude must continue and fix the issues
5. **HIGH (score 7-11)**: outputs a warning in Claude's context
6. **LOW/MEDIUM (score 0-6)**: silent, report available via `vibe-diff report`

Loop prevention: if Claude already continued because of a block, the Stop hook checks `stop_hook_active` and does not re-block for the same issues.

## Technical details

- **Language**: TypeScript, compiled to JavaScript
- **Dependencies**: zero (only Node.js built-ins)
- **Hook protocol**: reads JSON from stdin, outputs JSON to stdout
- **Storage**: append-only `.jsonl` for race-condition-safe concurrent writes
- **Analysis**: rule-based regex with multi-line signature support via paren collapsing
- **File limits**: skips deep analysis on files over 10,000 lines, caps file walking at 500 files
- **Supported languages**: TypeScript/JavaScript (full analysis), other languages (basic diff tracking)
- **44 unit tests** across diff-parser, categorizer, risk-scorer, and collector

## Project structure

```
vibe-diff/
  src/
    cli.ts                    CLI entry point, init/report/clear commands
    types.ts                  TypeScript type definitions
    hooks/
      pre-tool-use.ts         PreToolUse hook: captures old content
      post-tool-use.ts        PostToolUse hook: records diffs, warns Claude
      stop.ts                 Stop hook: quality gate, blocks on CRITICAL
    core/
      collector.ts            Append-only session storage (.jsonl)
      analyzer.ts             Main analysis orchestrator
      diff-parser.ts          Function/export/type/import extraction
      categorizer.ts          Change categorization engine
      import-scanner.ts       Dependency and test file scanning
      risk-scorer.ts          Risk assessment scoring
    output/
      terminal.ts             Colored terminal output
      markdown.ts             Markdown, commit msg, PR desc generation
    test/
      run.ts                  Test runner (zero dependencies)
      diff-parser.test.ts     20 tests
      categorizer.test.ts     11 tests
      risk-scorer.test.ts     6 tests
      collector.test.ts       7 tests
```

## License

MIT
