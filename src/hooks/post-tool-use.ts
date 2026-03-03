#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { addChange } from "../core/collector";
import { HookInput, FileChange } from "../types";

function main(): void {
  let input = "";
  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (chunk: string) => {
    input += chunk;
  });

  process.stdin.on("end", () => {
    try {
      const hookData: HookInput = JSON.parse(input);
      handleToolUse(hookData);
    } catch {
      // Silent fail — hooks should never break the session
    }
  });
}

function handleToolUse(data: HookInput): void {
  const projectRoot = findProjectRoot();
  if (!projectRoot) return;

  const toolName = data.tool_name;
  const toolInput = data.tool_input;

  if (toolName === "Edit" || toolName === "edit") {
    handleEdit(projectRoot, toolInput);
  } else if (toolName === "Write" || toolName === "write") {
    handleWrite(projectRoot, toolInput);
  }
}

function handleEdit(projectRoot: string, input: Record<string, unknown>): void {
  const filePath = input.file_path as string;
  if (!filePath) return;

  const relativePath = path.isAbsolute(filePath)
    ? path.relative(projectRoot, filePath)
    : filePath;

  // Read current file to get full content
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);

  let currentContent = "";
  try {
    currentContent = fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return;
  }

  // Reconstruct old content from edit operation
  const oldString = (input.old_string as string) || "";
  const newString = (input.new_string as string) || "";
  const oldContent = currentContent.replace(newString, oldString);

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

  const newContent = (input.content as string) || "";

  // Try to get old content (might not exist if new file)
  let oldContent = "";
  let editType: FileChange["editType"] = "create";
  try {
    // At this point the file has already been written, so we can't get the old content
    // from the file itself. We check if we already have it tracked.
    const { getSessionChanges } = require("../core/collector");
    const existing = getSessionChanges(projectRoot).find(
      (c: FileChange) => c.filePath === relativePath
    );
    if (existing) {
      oldContent = existing.oldContent;
      editType = "write";
    }
  } catch {
    // New file
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

function findProjectRoot(): string | null {
  let dir = process.cwd();
  const root = path.parse(dir).root;

  while (dir !== root) {
    if (
      fs.existsSync(path.join(dir, ".git")) ||
      fs.existsSync(path.join(dir, "package.json")) ||
      fs.existsSync(path.join(dir, "pyproject.toml")) ||
      fs.existsSync(path.join(dir, "Cargo.toml"))
    ) {
      return dir;
    }
    dir = path.dirname(dir);
  }

  return process.cwd();
}

main();
