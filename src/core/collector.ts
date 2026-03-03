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
  const session = loadSession(projectRoot);

  const existingIdx = session.changes.findIndex(
    (c) => c.filePath === change.filePath
  );

  if (existingIdx >= 0) {
    // Keep the original oldContent, update newContent
    session.changes[existingIdx].newContent = change.newContent;
    session.changes[existingIdx].timestamp = change.timestamp;
  } else {
    session.changes.push(change);
  }

  saveSession(projectRoot, session);
}

export function clearSession(projectRoot: string): void {
  const sessionPath = getSessionPath(projectRoot);
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

export function getSessionChanges(projectRoot: string): FileChange[] {
  return loadSession(projectRoot).changes;
}

function generateSessionId(): string {
  return `vd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
