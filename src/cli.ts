#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { generateReport } from "./core/analyzer";
import { clearSession, loadSession } from "./core/collector";
import { formatTerminal } from "./output/terminal";
import { formatMarkdown, formatCommitMessage, formatPRDescription } from "./output/markdown";

const HELP = `
  vibe-diff — Semantic diffs in plain English

  Usage:
    vibe-diff report          Show semantic diff of current session
    vibe-diff report --md     Output as markdown
    vibe-diff commit-msg      Generate a commit message from changes
    vibe-diff pr-desc         Generate a PR description from changes
    vibe-diff status          Show session status (how many changes tracked)
    vibe-diff clear           Clear the current session data
    vibe-diff setup           Print Claude Code hook configuration
    vibe-diff help            Show this help message

  How it works:
    1. Configure the PostToolUse hook (run 'vibe-diff setup')
    2. Use Claude Code normally — VibeDiff tracks changes in the background
    3. Run 'vibe-diff report' to see a semantic summary of all changes
`;

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0] || "help";

  const projectRoot = findProjectRoot();

  switch (command) {
    case "report":
      cmdReport(projectRoot, args.includes("--md"));
      break;
    case "commit-msg":
      cmdCommitMsg(projectRoot);
      break;
    case "pr-desc":
      cmdPRDesc(projectRoot);
      break;
    case "status":
      cmdStatus(projectRoot);
      break;
    case "clear":
      cmdClear(projectRoot);
      break;
    case "setup":
      cmdSetup();
      break;
    case "help":
    case "--help":
    case "-h":
      console.log(HELP);
      break;
    default:
      console.log(`Unknown command: ${command}`);
      console.log(HELP);
      process.exit(1);
  }
}

function cmdReport(projectRoot: string, markdown: boolean): void {
  const report = generateReport(projectRoot);

  if (markdown) {
    const md = formatMarkdown(report);
    console.log(md);

    // Also save to disk
    const outDir = path.join(projectRoot, ".vibe-diff");
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `report-${Date.now()}.md`);
    fs.writeFileSync(outFile, md);
    console.error(`\nSaved to ${outFile}`);
  } else {
    console.log(formatTerminal(report));
  }
}

function cmdCommitMsg(projectRoot: string): void {
  const report = generateReport(projectRoot);
  const msg = formatCommitMessage(report);

  if (msg) {
    console.log(msg);
  } else {
    console.log("No changes to generate a commit message from.");
  }
}

function cmdPRDesc(projectRoot: string): void {
  const report = generateReport(projectRoot);
  const desc = formatPRDescription(report);
  console.log(desc);
}

function cmdStatus(projectRoot: string): void {
  const session = loadSession(projectRoot);
  const count = session.changes.length;

  if (count === 0) {
    console.log("VibeDiff: No changes tracked in current session.");
  } else {
    console.log(`VibeDiff: Tracking ${count} file change(s)`);
    for (const change of session.changes) {
      const icon = change.editType === "create" ? "+" :
                   change.editType === "delete" ? "-" : "*";
      console.log(`  ${icon} ${change.filePath}`);
    }
  }
}

function cmdClear(projectRoot: string): void {
  clearSession(projectRoot);
  console.log("VibeDiff: Session cleared.");
}

function cmdSetup(): void {
  const hooksDir = path.resolve(__dirname, "hooks").replace(/\\/g, "/");

  console.log(`
  VibeDiff Setup
  ${"─".repeat(50)}

  Add this to your Claude Code settings:

  Option 1: Global (~/.claude/settings.json)
  Option 2: Project (.claude/settings.json)

  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Edit|Write",
          "hooks": [
            {
              "type": "command",
              "command": "node ${hooksDir}/pre-tool-use.js",
              "timeout": 5
            }
          ]
        }
      ],
      "PostToolUse": [
        {
          "matcher": "Edit|Write",
          "hooks": [
            {
              "type": "command",
              "command": "node ${hooksDir}/post-tool-use.js",
              "timeout": 10
            }
          ]
        }
      ],
      "Stop": [
        {
          "hooks": [
            {
              "type": "command",
              "command": "node ${hooksDir}/stop.js",
              "timeout": 30
            }
          ]
        }
      ]
    }
  }

  How it works:
    - PreToolUse:  Captures file content BEFORE Claude edits it
    - PostToolUse: Records the change after edit, tracks session
    - Stop:        Runs full analysis when Claude finishes responding
                   Blocks Claude on CRITICAL risk, warns on HIGH

  Run 'vibe-diff report' anytime for the full semantic diff.
  Run 'vibe-diff clear' to start a fresh session.
`);
}

function findProjectRoot(): string {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (
      fs.existsSync(path.join(dir, ".git")) ||
      fs.existsSync(path.join(dir, "package.json")) ||
      fs.existsSync(path.join(dir, "pyproject.toml"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return process.cwd();
}

main();
