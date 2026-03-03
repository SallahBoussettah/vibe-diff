#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { generateReport } from "./core/analyzer";
import { clearSession, loadSession } from "./core/collector";
import { formatTerminal } from "./output/terminal";
import { formatMarkdown, formatCommitMessage, formatPRDescription } from "./output/markdown";

const HELP = `
  vibe-diff -- Semantic diffs in plain English

  Usage:
    vibe-diff init            Auto-configure hooks in Claude Code settings
    vibe-diff init --global   Configure in global ~/.claude/settings.json
    vibe-diff report          Show semantic diff of current session
    vibe-diff report --md     Output as markdown
    vibe-diff commit-msg      Generate a commit message from changes
    vibe-diff pr-desc         Generate a PR description from changes
    vibe-diff status          Show session status (how many changes tracked)
    vibe-diff clear           Clear the current session data
    vibe-diff setup           Print hook configuration (manual setup)
    vibe-diff help            Show this help message

  Quick start:
    1. Run 'vibe-diff init' (or 'npx vibe-diff init')
    2. Restart Claude Code
    3. Done. VibeDiff tracks changes and blocks on critical breaking changes.
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
    case "init":
      cmdInit(args.includes("--global"));
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

function cmdInit(global: boolean): void {
  const hooksDir = path.resolve(__dirname, "hooks").replace(/\\/g, "/");

  const hookConfig = {
    PreToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [
          { type: "command", command: `node ${hooksDir}/pre-tool-use.js`, timeout: 5 },
        ],
      },
    ],
    PostToolUse: [
      {
        matcher: "Edit|Write",
        hooks: [
          { type: "command", command: `node ${hooksDir}/post-tool-use.js`, timeout: 10 },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          { type: "command", command: `node ${hooksDir}/stop.js`, timeout: 30 },
        ],
      },
    ],
  };

  // Determine target settings file
  let settingsPath: string;
  if (global) {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    settingsPath = path.join(home, ".claude", "settings.json");
  } else {
    settingsPath = path.join(process.cwd(), ".claude", "settings.json");
  }

  // Read existing settings or create new
  let settings: Record<string, unknown> = {};
  try {
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
  } catch {
    // Start fresh
  }

  // Merge hooks (don't overwrite existing non-VibeDiff hooks)
  const existingHooks = (settings.hooks || {}) as Record<string, unknown[]>;

  for (const [event, config] of Object.entries(hookConfig)) {
    const existing = existingHooks[event] as Array<Record<string, unknown>> || [];
    // Remove any previous VibeDiff hooks
    const filtered = existing.filter((entry) => {
      const hooks = (entry.hooks || []) as Array<Record<string, unknown>>;
      return !hooks.some((h) => typeof h.command === "string" && (h.command as string).includes("vibe-diff"));
    });
    // Add new VibeDiff hooks
    filtered.push(...(config as Record<string, unknown>[]));
    existingHooks[event] = filtered;
  }

  settings.hooks = existingHooks;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  const location = global ? "global (~/.claude/settings.json)" : `project (${settingsPath})`;
  console.log(`
  VibeDiff initialized.

  Hooks written to ${location}

  Three hooks configured:
    PreToolUse   - Captures file content before edits
    PostToolUse  - Records changes, warns on removed exports
    Stop         - Quality gate: blocks Claude on CRITICAL risk

  Restart Claude Code to activate.
`);
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
