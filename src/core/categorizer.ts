import {
  FileChange,
  FileAnalysis,
  FunctionChange,
  ExportChange,
  TypeChange,
  DependencyChange,
} from "../types";
import {
  extractFunctions,
  extractExports,
  extractTypes,
  detectReturnTypeChange,
  detectParamChange,
  detectAsyncChange,
  computeDiff,
} from "./diff-parser";
import * as path from "path";

const MAX_FILE_LINES = 10000;

export function analyzeFile(change: FileChange): FileAnalysis {
  const ext = path.extname(change.filePath);
  const isCode = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"].includes(ext);
  const isConfig = [".json", ".yaml", ".yml", ".toml", ".env", ".ini"].includes(ext);
  const isPackageJson = path.basename(change.filePath) === "package.json";

  // Skip deep analysis on very large files to avoid timeout
  const lineCount = Math.max(
    change.oldContent.split("\n").length,
    change.newContent.split("\n").length
  );
  const isTooLarge = lineCount > MAX_FILE_LINES;

  const analysis: FileAnalysis = {
    filePath: change.filePath,
    editType: change.editType,
    functions: [],
    exports: [],
    types: [],
    behaviorChanges: [],
    configChanges: [],
  };

  if (change.editType === "create") {
    analysis.behaviorChanges.push("New file created");
    if (isCode) {
      const newFns = extractFunctions(change.newContent);
      for (const [name, sig] of newFns) {
        analysis.functions.push({
          name,
          changeType: "added",
          newSignature: sig,
          returnTypeChanged: false,
          paramsChanged: false,
          asyncChanged: false,
          details: `New function: ${name}`,
        });
      }
      const newExports = extractExports(change.newContent);
      for (const [name, decl] of newExports) {
        analysis.exports.push({ name, changeType: "added", kind: inferExportKind(decl) });
      }
    }
    return analysis;
  }

  if (change.editType === "delete") {
    analysis.behaviorChanges.push("File deleted");
    if (isCode) {
      const oldExports = extractExports(change.oldContent);
      for (const [name, decl] of oldExports) {
        analysis.exports.push({ name, changeType: "removed", kind: inferExportKind(decl) });
      }
    }
    return analysis;
  }

  // For edits and writes — compare old vs new
  if (isCode && !isTooLarge) {
    analysis.functions = analyzeFunctions(change.oldContent, change.newContent);
    analysis.exports = analyzeExports(change.oldContent, change.newContent);
    analysis.types = analyzeTypes(change.oldContent, change.newContent);
    analysis.behaviorChanges = detectBehaviorChanges(change.oldContent, change.newContent, analysis);
  } else if (isCode && isTooLarge) {
    analysis.behaviorChanges.push(`File too large (${lineCount} lines), deep analysis skipped`);
    // Still check exports (cheap operation even on large files)
    analysis.exports = analyzeExports(change.oldContent, change.newContent);
  }

  if (isConfig || isPackageJson) {
    analysis.configChanges = detectConfigChanges(change.oldContent, change.newContent, change.filePath);
  }

  return analysis;
}

function analyzeFunctions(oldContent: string, newContent: string): FunctionChange[] {
  const changes: FunctionChange[] = [];
  const oldFns = extractFunctions(oldContent);
  const newFns = extractFunctions(newContent);

  // Removed functions
  for (const [name, sig] of oldFns) {
    if (!newFns.has(name)) {
      changes.push({
        name,
        changeType: "removed",
        oldSignature: sig,
        returnTypeChanged: false,
        paramsChanged: false,
        asyncChanged: false,
        details: `Removed function: ${name}`,
      });
    }
  }

  // Added functions
  for (const [name, sig] of newFns) {
    if (!oldFns.has(name)) {
      changes.push({
        name,
        changeType: "added",
        newSignature: sig,
        returnTypeChanged: false,
        paramsChanged: false,
        asyncChanged: false,
        details: `Added function: ${name}`,
      });
    }
  }

  // Modified functions
  for (const [name, oldSig] of oldFns) {
    const newSig = newFns.get(name);
    if (!newSig) continue;

    if (oldSig !== newSig) {
      const returnChanged = detectReturnTypeChange(oldSig, newSig);
      const paramsChanged = detectParamChange(oldSig, newSig);
      const asyncChanged = detectAsyncChange(oldSig, newSig);

      const details: string[] = [];
      if (returnChanged) details.push("return type changed");
      if (paramsChanged) details.push("parameters changed");
      if (asyncChanged) details.push(newSig.includes("async") ? "now async" : "no longer async");
      if (details.length === 0) details.push("signature modified");

      changes.push({
        name,
        changeType: "modified",
        oldSignature: oldSig,
        newSignature: newSig,
        returnTypeChanged: returnChanged,
        paramsChanged: paramsChanged,
        asyncChanged: asyncChanged,
        details: `${name}(): ${details.join(", ")}`,
      });
    }
  }

  return changes;
}

function analyzeExports(oldContent: string, newContent: string): ExportChange[] {
  const changes: ExportChange[] = [];
  const oldExports = extractExports(oldContent);
  const newExports = extractExports(newContent);

  for (const [name, decl] of oldExports) {
    if (!newExports.has(name)) {
      changes.push({ name, changeType: "removed", kind: inferExportKind(decl) });
    } else if (newExports.get(name) !== decl) {
      changes.push({ name, changeType: "modified", kind: inferExportKind(decl) });
    }
  }

  for (const [name, decl] of newExports) {
    if (!oldExports.has(name)) {
      changes.push({ name, changeType: "added", kind: inferExportKind(decl) });
    }
  }

  return changes;
}

function analyzeTypes(oldContent: string, newContent: string): TypeChange[] {
  const changes: TypeChange[] = [];
  const oldTypes = extractTypes(oldContent);
  const newTypes = extractTypes(newContent);

  for (const [name, decl] of oldTypes) {
    if (!newTypes.has(name)) {
      changes.push({ name, changeType: "removed", kind: inferTypeKind(decl), details: `Removed: ${name}` });
    } else if (newTypes.get(name) !== decl) {
      changes.push({ name, changeType: "modified", kind: inferTypeKind(decl), details: `Modified: ${name}` });
    }
  }

  for (const [name, decl] of newTypes) {
    if (!oldTypes.has(name)) {
      changes.push({ name, changeType: "added", kind: inferTypeKind(decl), details: `Added: ${name}` });
    }
  }

  return changes;
}

function detectBehaviorChanges(
  oldContent: string,
  newContent: string,
  analysis: FileAnalysis
): string[] {
  const changes: string[] = [];
  const diff = computeDiff(oldContent, newContent);

  // Error handling changes
  const oldTryCatch = (oldContent.match(/try\s*\{/g) || []).length;
  const newTryCatch = (newContent.match(/try\s*\{/g) || []).length;
  if (newTryCatch > oldTryCatch) changes.push("Added error handling (try/catch)");
  if (newTryCatch < oldTryCatch) changes.push("Removed error handling (try/catch)");

  // Validation changes
  const oldValidation = (oldContent.match(/if\s*\(!?\w+\)/g) || []).length;
  const newValidation = (newContent.match(/if\s*\(!?\w+\)/g) || []).length;
  if (newValidation > oldValidation + 2) changes.push("Added input validation checks");

  // Logging changes
  const oldLogs = (oldContent.match(/console\.\w+|logger\.\w+/g) || []).length;
  const newLogs = (newContent.match(/console\.\w+|logger\.\w+/g) || []).length;
  if (newLogs > oldLogs + 1) changes.push("Added logging");
  if (newLogs < oldLogs - 1) changes.push("Removed logging");

  // Async pattern changes
  const oldAwaits = (oldContent.match(/\bawait\b/g) || []).length;
  const newAwaits = (newContent.match(/\bawait\b/g) || []).length;
  if (newAwaits > 0 && oldAwaits === 0) changes.push("Introduced async/await patterns");

  // API call changes
  const oldFetch = (oldContent.match(/fetch\(|axios\.|http\.\w+/g) || []).length;
  const newFetch = (newContent.match(/fetch\(|axios\.|http\.\w+/g) || []).length;
  if (newFetch > oldFetch) changes.push("Added API/HTTP calls");
  if (newFetch < oldFetch) changes.push("Removed API/HTTP calls");

  // Security-sensitive changes
  for (const line of diff.added) {
    if (/innerHTML\s*=/.test(line)) changes.push("WARNING: Uses innerHTML (potential XSS)");
    if (/eval\s*\(/.test(line)) changes.push("WARNING: Uses eval() (security risk)");
    if (/\$\{.*\}.*(?:query|sql|exec)/i.test(line)) changes.push("WARNING: Possible SQL injection");
  }

  // Route/endpoint changes
  const routePattern = /\.(get|post|put|delete|patch)\s*\(\s*['"]/g;
  const oldRoutes = [...oldContent.matchAll(routePattern)].map((m) => m[0]);
  const newRoutes = [...newContent.matchAll(routePattern)].map((m) => m[0]);
  if (newRoutes.length > oldRoutes.length) changes.push("Added new API route(s)");
  if (newRoutes.length < oldRoutes.length) changes.push("Removed API route(s)");

  // React/JSX-specific changes
  const oldHooks = (oldContent.match(/\buse[A-Z]\w*\s*\(/g) || []).map((h) => h.replace(/\s*\($/, ""));
  const newHooks = (newContent.match(/\buse[A-Z]\w*\s*\(/g) || []).map((h) => h.replace(/\s*\($/, ""));
  const addedHooks = newHooks.filter((h) => !oldHooks.includes(h));
  const removedHooks = oldHooks.filter((h) => !newHooks.includes(h));
  if (addedHooks.length > 0) changes.push(`Added React hooks: ${[...new Set(addedHooks)].join(", ")}`);
  if (removedHooks.length > 0) changes.push(`Removed React hooks: ${[...new Set(removedHooks)].join(", ")}`);

  // Props interface changes (detect renamed/removed Props types)
  const propsPattern = /interface\s+(\w*Props\w*)/g;
  const oldProps = [...oldContent.matchAll(propsPattern)].map((m) => m[1]);
  const newProps = [...newContent.matchAll(propsPattern)].map((m) => m[1]);
  const removedProps = oldProps.filter((p) => !newProps.includes(p));
  if (removedProps.length > 0) changes.push(`Removed props interface(s): ${removedProps.join(", ")}`);

  // Summarize function changes as behavior
  for (const fn of analysis.functions) {
    if (fn.changeType === "modified" && fn.returnTypeChanged) {
      changes.push(`${fn.name}() return type changed — callers may break`);
    }
    if (fn.changeType === "modified" && fn.paramsChanged) {
      changes.push(`${fn.name}() parameters changed — callers need updating`);
    }
    if (fn.changeType === "modified" && fn.asyncChanged) {
      changes.push(`${fn.name}() async/sync changed — callers may need await/removal`);
    }
  }

  return changes;
}

function detectConfigChanges(oldContent: string, newContent: string, filePath: string): string[] {
  const changes: string[] = [];
  const fileName = path.basename(filePath);

  if (fileName === "package.json") {
    try {
      const oldPkg = JSON.parse(oldContent);
      const newPkg = JSON.parse(newContent);

      // Scripts
      if (JSON.stringify(oldPkg.scripts) !== JSON.stringify(newPkg.scripts)) {
        changes.push("npm scripts modified");
      }

      // Name/version
      if (oldPkg.version !== newPkg.version) {
        changes.push(`Version changed: ${oldPkg.version} → ${newPkg.version}`);
      }
    } catch {
      changes.push("package.json modified (could not parse)");
    }
  } else {
    changes.push(`Configuration file modified: ${fileName}`);
  }

  return changes;
}

export function analyzeDependencies(oldContent: string, newContent: string): DependencyChange[] {
  const changes: DependencyChange[] = [];

  try {
    const oldPkg = JSON.parse(oldContent);
    const newPkg = JSON.parse(newContent);

    const allDeps = (pkg: Record<string, unknown>) => ({
      ...((pkg.dependencies as Record<string, string>) || {}),
      ...((pkg.devDependencies as Record<string, string>) || {}),
    });

    const oldDeps = allDeps(oldPkg);
    const newDeps = allDeps(newPkg);

    for (const [name, version] of Object.entries(newDeps)) {
      if (!(name in oldDeps)) {
        changes.push({ name, changeType: "added", newVersion: version });
      } else if (oldDeps[name] !== version) {
        const oldVer = oldDeps[name].replace(/[\^~>=<]/g, "");
        const newVer = version.replace(/[\^~>=<]/g, "");
        changes.push({
          name,
          changeType: oldVer < newVer ? "upgraded" : "downgraded",
          oldVersion: oldDeps[name],
          newVersion: version,
        });
      }
    }

    for (const name of Object.keys(oldDeps)) {
      if (!(name in newDeps)) {
        changes.push({ name, changeType: "removed", oldVersion: oldDeps[name] });
      }
    }
  } catch {
    // Not valid JSON
  }

  return changes;
}

function inferExportKind(decl: string): ExportChange["kind"] {
  if (/\bfunction\b/.test(decl)) return "function";
  if (/\bclass\b/.test(decl)) return "class";
  if (/\binterface\b/.test(decl)) return "interface";
  if (/\btype\b/.test(decl)) return "type";
  if (/\benum\b/.test(decl)) return "enum";
  if (/\bdefault\b/.test(decl)) return "default";
  if (/\b(?:const|let|var)\b/.test(decl)) return "variable";
  return "unknown";
}

function inferTypeKind(decl: string): TypeChange["kind"] {
  if (/\binterface\b/.test(decl)) return "interface";
  if (/\benum\b/.test(decl)) return "enum";
  if (/\bclass\b/.test(decl)) return "class";
  return "type";
}
