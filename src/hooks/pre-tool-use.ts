#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";

/**
 * PreToolUse hook for VibeDiff.
 * Fires BEFORE Claude edits/writes a file.
 * Captures the file's current content so PostToolUse can compute a perfect diff.
 *
 * Stores pre-capture data in .vibe-diff/pre-capture.json keyed by absolute path.
 */

interface HookPayload {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
}

function main(): void {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk: string) => { input += chunk; });
  process.stdin.on("error", () => process.exit(1));

  process.stdin.on("end", () => {
    try {
      const data: HookPayload = JSON.parse(input);
      handle(data);
    } catch {
      process.exit(1);
    }
  });
}

function handle(data: HookPayload): void {
  try {
    const filePath = data.tool_input.file_path as string;
    if (!filePath) return;

    const projectRoot = data.cwd || process.cwd();
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(projectRoot, filePath);

    // Read the file BEFORE Claude edits it
    let oldContent = "";
    try {
      oldContent = fs.readFileSync(absolutePath, "utf-8");
    } catch {
      // File doesn't exist yet (new file). That's fine, old content is empty.
    }

    // Store in pre-capture.json
    const storageDir = path.join(projectRoot, ".vibe-diff");
    if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

    const preCapturePath = path.join(storageDir, "pre-capture.json");
    let preCapture: Record<string, { content: string; timestamp: number }> = {};
    try {
      preCapture = JSON.parse(fs.readFileSync(preCapturePath, "utf-8"));
    } catch {
      // First capture
    }

    // Normalize the key to forward slashes for consistency
    const key = absolutePath.replace(/\\/g, "/");
    preCapture[key] = { content: oldContent, timestamp: Date.now() };

    fs.writeFileSync(preCapturePath, JSON.stringify(preCapture));
  } catch {
    // Silent fail. Never break Claude Code.
    process.exit(1);
  }
}

main();
