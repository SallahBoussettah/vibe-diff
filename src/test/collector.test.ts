import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { addChange, loadSession, clearSession, getSessionChanges } from "../core/collector";

type TestFn = (name: string, fn: () => void) => void;

function makeTempDir(): string {
  const dir = path.join(os.tmpdir(), `vibe-diff-test-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function cleanUp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

export function testCollector(test: TestFn): void {
  test("addChange: creates session on first change", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, {
        filePath: "src/test.ts",
        oldContent: "old",
        newContent: "new",
        editType: "edit",
        timestamp: Date.now(),
      });
      const session = loadSession(dir);
      assert.strictEqual(session.changes.length, 1);
      assert.strictEqual(session.changes[0].filePath, "src/test.ts");
      assert.strictEqual(session.changes[0].oldContent, "old");
      assert.strictEqual(session.changes[0].newContent, "new");
    } finally {
      cleanUp(dir);
    }
  });

  test("addChange: deduplicates same file, keeps first oldContent", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, { filePath: "src/a.ts", oldContent: "v1", newContent: "v2", editType: "edit", timestamp: 1 });
      addChange(dir, { filePath: "src/a.ts", oldContent: "v2", newContent: "v3", editType: "edit", timestamp: 2 });
      const session = loadSession(dir);
      assert.strictEqual(session.changes.length, 1);
      assert.strictEqual(session.changes[0].oldContent, "v1");
      assert.strictEqual(session.changes[0].newContent, "v3");
    } finally {
      cleanUp(dir);
    }
  });

  test("addChange: preserves create editType when file is created then edited", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, { filePath: "src/b.ts", oldContent: "", newContent: "created", editType: "create", timestamp: 1 });
      addChange(dir, { filePath: "src/b.ts", oldContent: "created", newContent: "edited", editType: "edit", timestamp: 2 });
      const session = loadSession(dir);
      assert.strictEqual(session.changes.length, 1);
      // File was created this session — oldContent stays empty, editType stays "create"
      assert.strictEqual(session.changes[0].oldContent, "");
      assert.strictEqual(session.changes[0].newContent, "edited");
      assert.strictEqual(session.changes[0].editType, "create");
    } finally {
      cleanUp(dir);
    }
  });

  test("addChange: normalizes backslash paths", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, { filePath: "src\\auth\\login.ts", oldContent: "", newContent: "x", editType: "create", timestamp: 1 });
      const session = loadSession(dir);
      assert.strictEqual(session.changes[0].filePath, "src/auth/login.ts");
    } finally {
      cleanUp(dir);
    }
  });

  test("addChange: handles multiple different files", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, { filePath: "a.ts", oldContent: "", newContent: "a", editType: "create", timestamp: 1 });
      addChange(dir, { filePath: "b.ts", oldContent: "", newContent: "b", editType: "create", timestamp: 2 });
      addChange(dir, { filePath: "c.ts", oldContent: "", newContent: "c", editType: "create", timestamp: 3 });
      const session = loadSession(dir);
      assert.strictEqual(session.changes.length, 3);
    } finally {
      cleanUp(dir);
    }
  });

  test("clearSession: removes all session files", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, { filePath: "x.ts", oldContent: "", newContent: "x", editType: "create", timestamp: 1 });
      clearSession(dir);
      const session = loadSession(dir);
      assert.strictEqual(session.changes.length, 0);
    } finally {
      cleanUp(dir);
    }
  });

  test("getSessionChanges: returns deduplicated changes", () => {
    const dir = makeTempDir();
    try {
      addChange(dir, { filePath: "f.ts", oldContent: "1", newContent: "2", editType: "edit", timestamp: 1 });
      addChange(dir, { filePath: "f.ts", oldContent: "2", newContent: "3", editType: "edit", timestamp: 2 });
      const changes = getSessionChanges(dir);
      assert.strictEqual(changes.length, 1);
      assert.strictEqual(changes[0].newContent, "3");
    } finally {
      cleanUp(dir);
    }
  });
}
