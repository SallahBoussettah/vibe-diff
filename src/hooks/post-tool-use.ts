#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { addChange } from "../core/collector";
import { FileChange } from "../types";

/**
 * Claude Code PostToolUse hook for VibeDiff.
 *
 * Receives JSON on stdin with this schema:
 * {
 *   session_id, cwd, hook_event_name, tool_name,
 *   tool_input: { file_path, content | original_text + new_text },
 *   tool_response: { filePath, success }
 * }
 *
 * Exit 0 = success (stdout sent as context to Claude)
 * Exit 2 = blocking error
 * Any other = non-blocking error (silent)
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

  process.stdin.on("data", (chunk: string) => {
    input += chunk;
  });

  process.stdin.on("end", () => {
    try {
      const data: HookPayload = JSON.parse(input);
      handleToolUse(data);
    } catch (err) {
      // Silent fail. Hooks must never break Claude Code.
      // Exit 1 = non-blocking error, Claude continues normally.
      process.exit(1);
    }
  });

  // If stdin closes immediately with no data, just exit
  process.stdin.on("error", () => process.exit(1));
}

function handleToolUse(data: HookPayload): void {
  // Use cwd from the hook payload as the project root
  const projectRoot = data.cwd || findProjectRoot();
  if (!projectRoot) return;

  const toolName = data.tool_name;
  const toolInput = data.tool_input;

  try {
    if (toolName === "Edit") {
      handleEdit(projectRoot, toolInput);
    } else if (toolName === "Write") {
      handleWrite(projectRoot, toolInput);
    }
  } catch {
    // Silent fail. Never crash.
    process.exit(1);
  }
}

function handleEdit(projectRoot: string, input: Record<string, unknown>): void {
  const filePath = input.file_path as string;
  if (!filePath) return;

  const relativePath = path.isAbsolute(filePath)
    ? path.relative(projectRoot, filePath)
    : filePath;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);

  // Read the current file (already edited by Claude at this point)
  let currentContent = "";
  try {
    currentContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return;
  }

  // Claude Code Edit tool uses "original_text" and "new_text"
  // (also handle old_string/new_string as fallback)
  const oldString = (input.original_text as string) || (input.old_string as string) || "";
  const newString = (input.new_text as string) || (input.new_string as string) || "";

  // Reconstruct old content by reversing the edit
  const oldContent = oldString && newString
    ? currentContent.replace(newString, oldString)
    : currentContent;

  const change: FileChange = {
    filePath: relativePath,
    oldContent,
    newContent: currentContent,
    editType: "edit",
    timestamp: Date.now(),
  };

  addChange(projectRoot, change);
}

function handleWrite(projectRoot: string, input: Record<string, unknown>): void {
  const filePath = input.file_path as string;
  if (!filePath) return;

  const relativePath = path.isAbsolute(filePath)
    ? path.relative(projectRoot, filePath)
    : filePath;

  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);

  // For Write, content is the new file content.
  // The file is already written by Claude at this point.
  // Read it from disk (more reliable than the input in case of encoding).
  let newContent = "";
  try {
    newContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    newContent = (input.content as string) || "";
  }

  // Try to get old content from our session (if we tracked it before)
  let oldContent = "";
  let editType: FileChange["editType"] = "create";
  try {
    const { getSessionChanges } = require("../core/collector");
    const existing = getSessionChanges(projectRoot).find(
      (c: FileChange) => c.filePath === relativePath
    );
    if (existing) {
      // File was tracked before, so this is an overwrite
      oldContent = existing.oldContent;
      editType = "write";
    }
  } catch {
    // First time seeing this file
  }

  // If we don't have old content from session, try git
  if (!oldContent && editType === "create") {
    try {
      const { execSync } = require("child_process");
      const gitContent = execSync(
        `git show HEAD:${relativePath.replace(/\\/g, "/")}`,
        { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
      );
      if (gitContent) {
        oldContent = gitContent;
        editType = "write";
      }
    } catch {
      // File doesn't exist in git, so it's a new file
    }
  }

  const change: FileChange = {
    filePath: relativePath,
    oldContent,
    newContent,
    editType,
    timestamp: Date.now(),
  };

  addChange(projectRoot, change);
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
