import { DiffHunk } from "../types";

export function computeDiff(oldContent: string, newContent: string): {
  hunks: DiffHunk[];
  added: string[];
  removed: string[];
  linesAdded: number;
  linesRemoved: number;
} {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  const added: string[] = [];
  const removed: string[] = [];

  const oldSet = new Set(oldLines.map((l) => l.trim()).filter(Boolean));
  const newSet = new Set(newLines.map((l) => l.trim()).filter(Boolean));

  for (const line of newLines) {
    const trimmed = line.trim();
    if (trimmed && !oldSet.has(trimmed)) {
      added.push(trimmed);
    }
  }

  for (const line of oldLines) {
    const trimmed = line.trim();
    if (trimmed && !newSet.has(trimmed)) {
      removed.push(trimmed);
    }
  }

  return {
    hunks: [],
    added,
    removed,
    linesAdded: added.length,
    linesRemoved: removed.length,
  };
}

const RESERVED_WORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "break", "continue",
  "return", "try", "catch", "finally", "throw", "new", "delete", "typeof",
  "instanceof", "void", "in", "of", "with", "class", "extends", "super",
  "import", "export", "default", "from", "as", "await", "yield",
]);

export function extractFunctions(content: string): Map<string, string> {
  const functions = new Map<string, string>();
  const patterns = [
    // function name(...) { or async function name(...)
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)[^{]*\{/g,
    // const name = (...) => or const name = async (...) =>
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]*?)?\s*=>/g,
    // name(...) { inside class
    /^\s+(?:async\s+)?(\w+)\s*\([^)]*\)[^{]*\{/gm,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (RESERVED_WORDS.has(name)) continue;
      // Capture the full signature line
      const lineStart = content.lastIndexOf("\n", match.index) + 1;
      const lineEnd = content.indexOf("\n", match.index);
      const signatureLine = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();
      functions.set(name, signatureLine);
    }
  }

  return functions;
}

export function extractExports(content: string): Map<string, string> {
  const exports = new Map<string, string>();
  const patterns = [
    // export function/const/class/interface/type/enum name
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g,
    // export { name1, name2 }
    /export\s*\{([^}]+)\}/g,
    // export default
    /export\s+default\s+(\w+)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern.source.includes("\\{")) {
        // Handle export { name1, name2 }
        const names = match[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim());
        for (const name of names) {
          if (name) exports.set(name, "re-export");
        }
      } else {
        exports.set(match[1], match[0].trim());
      }
    }
  }

  return exports;
}

export function extractTypes(content: string): Map<string, string> {
  const types = new Map<string, string>();
  const patterns = [
    /(?:export\s+)?interface\s+(\w+)/g,
    /(?:export\s+)?type\s+(\w+)\s*=/g,
    /(?:export\s+)?enum\s+(\w+)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const lineEnd = content.indexOf("\n", match.index);
      types.set(match[1], content.slice(match.index, lineEnd === -1 ? undefined : lineEnd).trim());
    }
  }

  return types;
}

export function extractImports(content: string): Array<{ source: string; names: string[] }> {
  const imports: Array<{ source: string; names: string[] }> = [];
  const patterns = [
    // import { a, b } from './module'
    /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g,
    // import name from './module'
    /import\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g,
    // import * as name from './module'
    /import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g,
    // const { a } = require('./module')
    /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    // const name = require('./module')
    /(?:const|let|var)\s+(\w+)\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const names = match[1].includes(",")
        ? match[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
        : [match[1].trim()];
      imports.push({ source: match[2], names });
    }
  }

  return imports;
}

export function detectReturnTypeChange(oldSig: string, newSig: string): boolean {
  const returnPattern = /\)\s*:\s*([^{=]+)/;
  const oldReturn = oldSig.match(returnPattern)?.[1]?.trim();
  const newReturn = newSig.match(returnPattern)?.[1]?.trim();
  if (!oldReturn && !newReturn) return false;
  if (!oldReturn || !newReturn) return true;
  return oldReturn !== newReturn;
}

export function detectParamChange(oldSig: string, newSig: string): boolean {
  const paramPattern = /\(([^)]*)\)/;
  const oldParams = oldSig.match(paramPattern)?.[1]?.trim() || "";
  const newParams = newSig.match(paramPattern)?.[1]?.trim() || "";
  return oldParams !== newParams;
}

export function detectAsyncChange(oldSig: string, newSig: string): boolean {
  const oldAsync = /\basync\b/.test(oldSig);
  const newAsync = /\basync\b/.test(newSig);
  return oldAsync !== newAsync;
}
