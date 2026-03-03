# Vibe Diff

Semantic diffs in plain English. See what changed in **meaning**, not just what lines moved.

A Claude Code plugin that analyzes code changes and generates human-readable summaries — behavior changes, breaking API changes, affected dependents, test impact, dependency updates, and risk assessment. All without leaving the terminal.

```
  Vibe Diff
  ────────────────────────────────────────────────────────────────
  Session: 3 file(s), +36 -10 lines

  Files Changed
    * src/auth/login.ts
    + src/auth/oauth.ts
    * package.json

  Behavior Changes
    > [src/auth/login.ts] login() return type changed — callers may break
    > [src/auth/login.ts] login() parameters changed — callers need updating
    > [src/auth/oauth.ts] New file created

  API Changes
    > removed export: User (interface) in src/auth/login.ts
    > added export: Session (interface) in src/auth/login.ts
    > Modified: login(): return type changed, parameters changed

  Breaking Changes
    ! REMOVED export: User from src/auth/login.ts
    ! BREAKING: login() return type changed in src/auth/login.ts
    ! BREAKING: login() parameters changed in src/auth/login.ts

  Dependencies
    + jsonwebtoken ^9.0.0

  ────────────────────────────────────────────────────────────────
  Risk: CRITICAL (score: 12)
    - 4 breaking API change(s)
    - Removed export: User (src/auth/login.ts)
    - Return type changed: login() (src/auth/login.ts)
```

## Why?

Git diffs show you **what lines changed**. They don't tell you **what it means**.

A 500-line diff across 8 files takes 20+ minutes to review because you have to mentally reconstruct: What was the intent? What behavior changed? What could break?

This is 10x worse with AI-generated code. Claude can change hundreds of lines in seconds, and the changes might be subtly wrong in ways that line-by-line review won't catch.

VibeDiff translates code diffs into impact summaries.

## Install

```bash
git clone https://github.com/SallahBoussettah/vibe-diff.git
cd vibe-diff
npm install
```

## Setup

Run `vibe-diff setup` to get the hook configuration, then add it to your Claude Code settings:

**Global** (`~/.claude/settings.json`) or **Project** (`.claude/settings.json`):

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "node /path/to/vibe-diff/dist/hooks/post-tool-use.js"
      }
    ]
  }
}
```

## Usage

Use Claude Code normally. VibeDiff tracks changes in the background via the PostToolUse hook.

```bash
# See the semantic diff of your current session
vibe-diff report

# Output as markdown
vibe-diff report --md

# Generate a commit message from changes
vibe-diff commit-msg

# Generate a PR description
vibe-diff pr-desc

# Check how many changes are tracked
vibe-diff status

# Clear session data
vibe-diff clear
```

## What It Detects

**Behavior Changes**
- Error handling additions/removals (try/catch)
- Async/await pattern changes
- API/HTTP call additions/removals
- Route/endpoint changes
- Security issues (innerHTML, eval, SQL injection patterns)

**API Changes**
- Added/removed/modified exported functions
- Return type changes
- Parameter signature changes
- Async/sync conversion
- Added/removed types, interfaces, enums

**Breaking Changes**
- Removed exports that other files depend on
- Function return type changes
- Parameter changes on public functions
- Deleted files with dependents

**Side Effects**
- Files that import changed modules but weren't updated
- Symbols used by dependents that were removed or modified

**Test Impact**
- Test files related to changed source (convention + import based)
- Tests that weren't updated alongside source changes

**Dependency Changes**
- New, removed, upgraded, or downgraded npm packages

**Risk Assessment**
- LOW / MEDIUM / HIGH / CRITICAL scoring
- Clear reasoning for the risk level
- Based on breaking changes, unupdated dependents, security issues

## Output Formats

| Command | Format | Use Case |
|---------|--------|----------|
| `vibe-diff report` | Colored terminal | Quick review during coding |
| `vibe-diff report --md` | Markdown file | Documentation, sharing |
| `vibe-diff commit-msg` | Commit message | Copy into git commit |
| `vibe-diff pr-desc` | PR description | Copy into pull request body |

## How It Works

1. **PostToolUse hook** captures every Edit/Write operation Claude makes
2. Stores before/after file content in `.vibe-diff/session.json`
3. On `report`, the analyzer:
   - Extracts functions, exports, types, imports from old and new content
   - Compares signatures to detect API changes
   - Scans project for files that import changed modules
   - Maps source files to test files
   - Computes a risk score based on all findings
4. Outputs a structured, human-readable report

No LLM calls needed. Analysis is rule-based and runs instantly.

## Supported Languages

- TypeScript / JavaScript (primary — full function, export, type, import analysis)
- Other languages get basic diff analysis (line-level changes, file tracking)

## Project Structure

```
vibe-diff/
  src/
    cli.ts                  # CLI entry point
    types.ts                # TypeScript types
    hooks/
      post-tool-use.ts      # Claude Code PostToolUse hook
    core/
      collector.ts          # Session change tracking
      analyzer.ts           # Main analysis orchestrator
      diff-parser.ts        # Function/export/type/import extraction
      categorizer.ts        # Change categorization engine
      import-scanner.ts     # Dependency and test file scanning
      risk-scorer.ts        # Risk assessment scoring
    output/
      terminal.ts           # Colored terminal output
      markdown.ts           # Markdown, commit msg, PR desc generation
```

## License

MIT
