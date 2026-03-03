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

/**
 * Extract function names and signatures from source code.
 * Handles multi-line signatures by collapsing whitespace before matching.
 */
export function extractFunctions(content: string): Map<string, string> {
  const functions = new Map<string, string>();

  // Collapse multi-line signatures: replace newlines inside parens with spaces.
  // This lets single-line regex patterns match multi-line function signatures.
  const collapsed = collapseParens(content);

  const patterns = [
    // function name(...) { or async function name(...) or function name<T>(...)
    /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{/g,
    // const name = (...) => or const name = async (...) =>
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*[^=]*?)?\s*=>/g,
    // const Name: React.FC<Props> = (...) => (React functional component with FC type)
    /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*:\s*(?:React\.)?(?:FC|FunctionComponent)(?:<[^>]*>)?\s*=\s*\([^)]*\)\s*=>/g,
    // name(...) { inside class (methods)
    /(?:^|\n)\s+(?:(?:public|private|protected|static|readonly|abstract|override)\s+)*(?:async\s+)?(\w+)\s*(?:<[^>]*>)?\s*\([^)]*\)[^{]*\{/g,
    // React hooks: const [state, setState] = useState -- extract as hook usage pattern
    // (not extracted as functions, but we detect custom hooks below)
    // Custom hooks: export function useXxx(...)
    // Already covered by the first pattern since hooks are just functions starting with "use"
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(collapsed)) !== null) {
      const name = match[1];
      if (RESERVED_WORDS.has(name)) continue;
      // Capture the full match as the signature (already collapsed to single line)
      const sig = match[0].trim().replace(/\s*\{$/, "").trim();
      functions.set(name, sig);
    }
  }

  return functions;
}

/**
 * Collapse multi-line parenthesized expressions into single lines.
 * Replaces newlines inside matched parens with spaces.
 * Handles nested parens and generic angle brackets.
 */
function collapseParens(content: string): string {
  const chars = content.split("");
  let depth = 0;
  let angleDepth = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "<") angleDepth++;
    else if (ch === ">") angleDepth = Math.max(0, angleDepth - 1);

    // Inside parens or angle brackets, replace newlines with space
    if ((depth > 0 || angleDepth > 0) && (ch === "\n" || ch === "\r")) {
      chars[i] = " ";
    }
  }

  // Normalize multiple spaces
  return chars.join("").replace(/  +/g, " ");
}

export function extractExports(content: string): Map<string, string> {
  const exports = new Map<string, string>();
  const patterns = [
    // export function/const/class/interface/type/enum name
    /export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/g,
    // export { name1, name2 } or export { name1, name2 } from './module'
    /export\s*\{([^}]+)\}(?:\s*from\s*['"][^'"]+['"])?/g,
    // export default name
    /export\s+default\s+(\w+)/g,
    // export * from './module' (barrel re-export)
    /export\s*\*\s*from\s*['"]([^'"]+)['"]/g,
    // export * as name from './module' (namespace re-export)
    /export\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern.source.includes("\\*\\s*from")) {
        // export * from './module' -- barrel export, track the source
        exports.set(`*:${match[1]}`, `barrel:${match[1]}`);
      } else if (pattern.source.includes("\\*\\s*as")) {
        // export * as Name from './module'
        exports.set(match[1], `namespace:${match[2]}`);
      } else if (pattern.source.includes("\\{")) {
        // export { name1, name2 }
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
  // Normalize whitespace before comparing
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const oldParams = normalize(oldSig.match(paramPattern)?.[1] || "");
  const newParams = normalize(newSig.match(paramPattern)?.[1] || "");
  return oldParams !== newParams;
}

export function detectAsyncChange(oldSig: string, newSig: string): boolean {
  const oldAsync = /\basync\b/.test(oldSig);
  const newAsync = /\basync\b/.test(newSig);
  return oldAsync !== newAsync;
}
