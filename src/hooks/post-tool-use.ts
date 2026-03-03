#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { addChange } from "../core/collector";
import { FileChange } from "../types";

/**
 * PostToolUse hook for VibeDiff.
 * Fires AFTER Claude edits/writes a file.
 * Reads the new content from disk, pairs it with old content from pre-capture.json,
 * and stores the diff in the session.
 *
 * Outputs terse additionalContext on MEDIUM+ risk for Claude awareness.
 */

interface HookPayload {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response?: Record<string, unknown>;
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
    const projectRoot = data.cwd || process.cwd();
    const toolName = data.tool_name;
    const toolInput = data.tool_input;

    if (toolName === "Edit") {
      handleEdit(projectRoot, toolInput);
    } else if (toolName === "Write") {
      handleWrite(projectRoot, toolInput);
    }
  } catch {
    process.exit(1);
  }
}

function handleEdit(projectRoot: string, input: Record<string, unknown>): void {
  const filePath = input.file_path as string;
  if (!filePath) return;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const relativePath = normalizePath(
    path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath
  );

  // Read NEW content from disk (file already edited by Claude)
  let newContent = "";
  try {
    newContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return;
  }

  // Read OLD content from pre-capture (written by PreToolUse hook)
  let oldContent = getPreCapturedContent(projectRoot, normalizedAbsolute);

  // Fallback: try git if pre-capture missed it
  if (oldContent === null) {
    oldContent = getGitContent(projectRoot, relativePath) || "";
  }

  const change: FileChange = {
    filePath: relativePath,
    oldContent,
    newContent,
    editType: oldContent ? "edit" : "create",
    timestamp: Date.now(),
  };

  addChange(projectRoot, change);
  outputContext(projectRoot);
}

function handleWrite(projectRoot: string, input: Record<string, unknown>): void {
  const filePath = input.file_path as string;
  if (!filePath) return;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const relativePath = normalizePath(
    path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath
  );

  // Read NEW content from disk
  let newContent = "";
  try {
    newContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    newContent = (input.content as string) || "";
  }

  // Read OLD content from pre-capture
  let oldContent = getPreCapturedContent(projectRoot, normalizedAbsolute);

  // Fallback: try git
  if (oldContent === null) {
    oldContent = getGitContent(projectRoot, relativePath) || "";
  }

  const change: FileChange = {
    filePath: relativePath,
    oldContent,
    newContent,
    editType: oldContent ? "write" : "create",
    timestamp: Date.now(),
  };

  addChange(projectRoot, change);
  outputContext(projectRoot);
}

function getPreCapturedContent(projectRoot: string, normalizedAbsolutePath: string): string | null {
  try {
    const preCapturePath = path.join(projectRoot, ".vibe-diff", "pre-capture.json");
    const preCapture = JSON.parse(fs.readFileSync(preCapturePath, "utf-8"));
    const entry = preCapture[normalizedAbsolutePath];
    if (entry && entry.content !== undefined) {
      return entry.content;
    }
  } catch {
    // No pre-capture data
  }
  return null;
}

function getGitContent(projectRoot: string, relativePath: string): string | null {
  try {
    const { execSync } = require("child_process");
    const gitPath = relativePath.replace(/\\/g, "/");
    return execSync(`git show HEAD:${gitPath}`, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function outputContext(projectRoot: string): void {
  // Output a terse summary as additionalContext for Claude
  // Only when there are meaningful changes
  try {
    const { getSessionChanges } = require("../core/collector");
    const changes = getSessionChanges(projectRoot);
    const count = changes.length;
    if (count > 0) {
      // Quick risk check: any removed exports or breaking patterns?
      let hasBreaking = false;
      for (const change of changes) {
        if (change.oldContent && change.newContent !== change.oldContent) {
          // Check for removed exports (quick regex, not full analysis)
          const oldExports = (change.oldContent.match(/export\s+(?:function|const|class|interface|type|enum)\s+\w+/g) || []);
          const newExports = (change.newContent.match(/export\s+(?:function|const|class|interface|type|enum)\s+\w+/g) || []);
          if (oldExports.length > newExports.length) {
            hasBreaking = true;
            break;
          }
        }
      }

      if (hasBreaking) {
        // Output additionalContext so Claude sees the warning
        const output = JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PostToolUse",
            additionalContext: `VibeDiff: ${count} file(s) tracked. Possible removed exports detected. Run 'vibe-diff report' for details.`,
          },
        });
        process.stdout.write(output);
      }
    }
  } catch {
    // Silent fail
  }
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

main();
