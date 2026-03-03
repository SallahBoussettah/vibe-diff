import * as fs from "fs";
import * as path from "path";
import { FileChange, SessionData } from "../types";

const VIBE_DIR = ".vibe-diff";
const CHANGES_FILE = "changes.jsonl";
const SESSION_META = "session-meta.json";

function getStorageDir(projectRoot: string): string {
  return path.join(projectRoot, VIBE_DIR);
}

function ensureStorageDir(projectRoot: string): void {
  const dir = getStorageDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Append a change to the .jsonl file. Append-only to avoid race conditions
 * when multiple hooks fire in parallel.
 */
export function addChange(projectRoot: string, change: FileChange): void {
  ensureStorageDir(projectRoot);

  // Normalize path to forward slashes
  change.filePath = change.filePath.replace(/\\/g, "/");

  const changesPath = path.join(getStorageDir(projectRoot), CHANGES_FILE);
  const line = JSON.stringify(change) + "\n";
  fs.appendFileSync(changesPath, line);

  // Ensure session meta exists
  const metaPath = path.join(getStorageDir(projectRoot), SESSION_META);
  if (!fs.existsSync(metaPath)) {
    fs.writeFileSync(metaPath, JSON.stringify({
      sessionId: generateSessionId(),
      startTime: Date.now(),
    }));
  }
}

/**
 * Load the full session by reading all appended changes and deduplicating.
 * For each file, keeps the first oldContent and the latest newContent.
 */
export function loadSession(projectRoot: string): SessionData {
  const dir = getStorageDir(projectRoot);
  const metaPath = path.join(dir, SESSION_META);
  const changesPath = path.join(dir, CHANGES_FILE);

  let sessionId = generateSessionId();
  let startTime = Date.now();

  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      sessionId = meta.sessionId;
      startTime = meta.startTime;
    } catch { /* use defaults */ }
  }

  const changes: FileChange[] = [];

  if (fs.existsSync(changesPath)) {
    const lines = fs.readFileSync(changesPath, "utf-8").split("\n").filter(Boolean);
    const seen = new Map<string, number>();

    for (const line of lines) {
      try {
        const change: FileChange = JSON.parse(line);
        const idx = seen.get(change.filePath);

        if (idx !== undefined) {
          // Same file seen before: keep first oldContent, update newContent
          changes[idx].newContent = change.newContent;
          changes[idx].timestamp = change.timestamp;
          // Update oldContent only if incoming has content and existing is empty
          if (change.oldContent && !changes[idx].oldContent) {
            changes[idx].oldContent = change.oldContent;
            changes[idx].editType = change.editType;
          }
        } else {
          seen.set(change.filePath, changes.length);
          changes.push({ ...change });
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Also support legacy session.json for backwards compatibility
  const legacyPath = path.join(dir, "session.json");
  if (changes.length === 0 && fs.existsSync(legacyPath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
      return legacy;
    } catch { /* ignore */ }
  }

  return { sessionId, startTime, changes };
}

export function saveSession(projectRoot: string, session: SessionData): void {
  // For backwards compatibility with code that calls saveSession directly.
  // Writes the deduplicated session as a legacy session.json.
  ensureStorageDir(projectRoot);
  const legacyPath = path.join(getStorageDir(projectRoot), "session.json");
  fs.writeFileSync(legacyPath, JSON.stringify(session, null, 2));
}

export function clearSession(projectRoot: string): void {
  const dir = getStorageDir(projectRoot);
  const filesToClear = [
    "changes.jsonl", "session.json", "session-meta.json",
    "pre-capture.json", "reported-issues.json", "last-report.json",
    "last-warning-state.json",
  ];
  for (const file of filesToClear) {
    const filePath = path.join(dir, file);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export function getSessionChanges(projectRoot: string): FileChange[] {
  return loadSession(projectRoot).changes;
}

function generateSessionId(): string {
  return `vd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
