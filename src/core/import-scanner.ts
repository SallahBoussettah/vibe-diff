import * as fs from "fs";
import * as path from "path";
import { AffectedDependent, ExportChange, ImportInfo } from "../types";

const CODE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".py", ".go", ".rs", ".java", ".cs",
];

const IGNORE_DIRS = [
  "node_modules", ".git", "dist", "build", ".next",
  "__pycache__", ".venv", "venv", "target", ".vibe-diff",
];

export function findDependents(
  changedFile: string,
  projectRoot: string,
  changedExports: ExportChange[]
): AffectedDependent[] {
  const dependents: AffectedDependent[] = [];
  const changedRelative = path.relative(projectRoot, changedFile);
  const changedBaseName = path.basename(changedFile, path.extname(changedFile));
  const changedDir = path.dirname(changedFile);

  // Build patterns to search for
  const importPatterns = buildImportPatterns(changedFile, projectRoot);

  // Walk project files
  const files = walkFiles(projectRoot);

  for (const file of files) {
    if (file === changedFile) continue;

    const content = readFileSafe(file);
    if (!content) continue;

    const matchedPattern = importPatterns.find((p) => content.includes(p));
    if (!matchedPattern) continue;

    // This file imports from the changed file
    const importedNames = extractImportedNames(content, matchedPattern);
    const removedExports = changedExports
      .filter((e) => e.changeType === "removed")
      .map((e) => e.name);
    const modifiedExports = changedExports
      .filter((e) => e.changeType === "modified")
      .map((e) => e.name);

    const brokenSymbols = importedNames.filter((n) => removedExports.includes(n));
    const reviewSymbols = importedNames.filter((n) => modifiedExports.includes(n));

    let status: AffectedDependent["status"] = "ok";
    let reason = "";

    if (brokenSymbols.length > 0) {
      status = "likely-broken";
      reason = `Uses removed export(s): ${brokenSymbols.join(", ")}`;
    } else if (reviewSymbols.length > 0) {
      status = "needs-review";
      reason = `Uses modified export(s): ${reviewSymbols.join(", ")}`;
    } else if (changedExports.some((e) => e.changeType === "removed" || e.changeType === "modified")) {
      status = "needs-review";
      reason = "Imports from changed file";
    }

    if (status !== "ok") {
      dependents.push({
        filePath: path.relative(projectRoot, file),
        usesSymbols: importedNames,
        brokenSymbols,
        status,
        reason,
      });
    }
  }

  return dependents;
}

function buildImportPatterns(changedFile: string, projectRoot: string): string[] {
  const patterns: string[] = [];
  const ext = path.extname(changedFile);
  const baseName = path.basename(changedFile, ext);
  const relFromRoot = path.relative(projectRoot, changedFile).replace(/\\/g, "/");
  const relNoExt = relFromRoot.replace(/\.[^.]+$/, "");

  // Common import patterns for the changed file
  // ./filename, ../dir/filename, @/dir/filename
  patterns.push(`/${baseName}'`);
  patterns.push(`/${baseName}"`);
  patterns.push(`/${baseName}\``);

  // Handle index files
  if (baseName === "index") {
    const dirName = path.basename(path.dirname(changedFile));
    patterns.push(`/${dirName}'`);
    patterns.push(`/${dirName}"`);
  }

  return patterns;
}

function extractImportedNames(content: string, importPattern: string): string[] {
  const names: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (!line.includes(importPattern.slice(1, -1))) continue;

    // Extract { name1, name2 } from import statement
    const braceMatch = line.match(/\{([^}]+)\}/);
    if (braceMatch) {
      const extracted = braceMatch[1]
        .split(",")
        .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean);
      names.push(...extracted);
    }

    // Extract default import
    const defaultMatch = line.match(/import\s+(\w+)\s+from/);
    if (defaultMatch) {
      names.push(defaultMatch[1]);
    }

    // Extract * as name
    const starMatch = line.match(/\*\s+as\s+(\w+)/);
    if (starMatch) {
      names.push(starMatch[1]);
    }
  }

  return [...new Set(names)];
}

export function findRelatedTests(
  changedFile: string,
  projectRoot: string
): string[] {
  const tests: string[] = [];
  const ext = path.extname(changedFile);
  const baseName = path.basename(changedFile, ext);
  const dir = path.dirname(changedFile);

  // Convention-based test file patterns
  const testPatterns = [
    path.join(dir, `${baseName}.test${ext}`),
    path.join(dir, `${baseName}.spec${ext}`),
    path.join(dir, "__tests__", `${baseName}${ext}`),
    path.join(dir, "__tests__", `${baseName}.test${ext}`),
    path.join(projectRoot, "tests", path.relative(projectRoot, changedFile)),
    path.join(projectRoot, "test", path.relative(projectRoot, changedFile)),
  ];

  for (const testPath of testPatterns) {
    if (fs.existsSync(testPath)) {
      tests.push(path.relative(projectRoot, testPath));
    }
  }

  // Also search for test files that import the changed file
  const testDirs = ["__tests__", "tests", "test", "spec"];
  for (const testDir of testDirs) {
    const fullTestDir = path.join(projectRoot, testDir);
    if (!fs.existsSync(fullTestDir)) continue;

    const testFiles = walkFiles(fullTestDir);
    for (const testFile of testFiles) {
      if (tests.includes(path.relative(projectRoot, testFile))) continue;

      const content = readFileSafe(testFile);
      if (!content) continue;

      if (content.includes(baseName)) {
        tests.push(path.relative(projectRoot, testFile));
      }
    }
  }

  return [...new Set(tests)];
}

const MAX_FILES = 500;

function walkFiles(dir: string, maxDepth = 5, _count = { n: 0 }): string[] {
  const files: string[] = [];
  if (maxDepth <= 0 || _count.n >= MAX_FILES) return files;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (_count.n >= MAX_FILES) break;
    if (IGNORE_DIRS.includes(entry.name)) continue;
    if (entry.name.startsWith(".")) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, maxDepth - 1, _count));
    } else if (entry.isFile() && CODE_EXTENSIONS.includes(path.extname(entry.name))) {
      files.push(fullPath);
      _count.n++;
    }
  }

  return files;
}

function readFileSafe(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
