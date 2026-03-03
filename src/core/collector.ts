import * as fs from "fs";
import * as path from "path";
import { FileChange, SessionData } from "../types";

const VIBE_DIR = ".vibe-diff";
const SESSION_FILE = "session.json";

function getStorageDir(projectRoot: string): string {
  return path.join(projectRoot, VIBE_DIR);
}

function getSessionPath(projectRoot: string): string {
  return path.join(getStorageDir(projectRoot), SESSION_FILE);
}

function ensureStorageDir(projectRoot: string): void {
  const dir = getStorageDir(projectRoot);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSession(projectRoot: string): SessionData {
  const sessionPath = getSessionPath(projectRoot);
  if (fs.existsSync(sessionPath)) {
    const raw = fs.readFileSync(sessionPath, "utf-8");
    return JSON.parse(raw);
  }
  return {
    sessionId: generateSessionId(),
    startTime: Date.now(),
    changes: [],
  };
}

export function saveSession(projectRoot: string, session: SessionData): void {
  ensureStorageDir(projectRoot);
  fs.writeFileSync(getSessionPath(projectRoot), JSON.stringify(session, null, 2));
}

export function addChange(projectRoot: string, change: FileChange): void {
  // Normalize path to forward slashes
  change.filePath = change.filePath.replace(/\\/g, "/");

  const session = loadSession(projectRoot);

  const existingIdx = session.changes.findIndex(
    (c) => c.filePath === change.filePath
  );

  if (existingIdx >= 0) {
    // Always update newContent to latest
    session.changes[existingIdx].newContent = change.newContent;
    session.changes[existingIdx].timestamp = change.timestamp;
    // Update oldContent ONLY if the incoming change has real old content
    // and the existing entry has empty old content (was a create)
    if (change.oldContent && !session.changes[existingIdx].oldContent) {
      session.changes[existingIdx].oldContent = change.oldContent;
      session.changes[existingIdx].editType = change.editType;
    }
  } else {
    session.changes.push(change);
  }

  saveSession(projectRoot, session);
}

export function clearSession(projectRoot: string): void {
  const dir = getStorageDir(projectRoot);
  const filesToClear = ["session.json", "pre-capture.json", "reported-issues.json", "last-report.json"];
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
