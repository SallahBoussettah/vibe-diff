import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { execFileSync } from "child_process";

type TestFn = (name: string, fn: () => void) => void;

/**
 * End-to-end tests for the PreToolUse -> PostToolUse -> Stop hook chain.
 *
 * The unit tests cover each module in isolation, which is why a regression that
 * made the Stop hook delete every session's changes before analysing them went
 * unnoticed. These tests drive the compiled hooks the way Claude Code does:
 * a JSON payload on stdin, output read from stdout.
 */

// dist/test/hooks.test.js -> dist/hooks
const HOOKS_DIR = path.resolve(__dirname, "..", "hooks");

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-diff-hooks-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  return dir;
}

function cleanUp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

function runHook(hook: string, payload: Record<string, unknown>): string {
  return execFileSync(process.execPath, [path.join(HOOKS_DIR, hook)], {
    input: JSON.stringify(payload),
    encoding: "utf-8",
  });
}

function preToolUse(projectRoot: string, sessionId: string, file: string): void {
  runHook("pre-tool-use.js", {
    session_id: sessionId,
    cwd: projectRoot,
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: { file_path: path.join(projectRoot, file) },
  });
}

function postToolUse(projectRoot: string, sessionId: string, file: string): string {
  return runHook("post-tool-use.js", {
    session_id: sessionId,
    cwd: projectRoot,
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: path.join(projectRoot, file) },
    tool_response: {},
  });
}

function stop(projectRoot: string, sessionId: string, stopHookActive = false): string {
  return runHook("stop.js", {
    session_id: sessionId,
    cwd: projectRoot,
    hook_event_name: "Stop",
    stop_hook_active: stopHookActive,
  });
}

/** Remove two of three exports, which scores CRITICAL. */
function makeBreakingChange(dir: string, sessionId: string): void {
  fs.writeFileSync(
    path.join(dir, "src", "api.ts"),
    "export function getUser(id: string): string { return id; }\n" +
    "export function saveUser(u: string): void { void u; }\n" +
    "export function deleteUser(id: string): void { void id; }\n"
  );
  fs.writeFileSync(
    path.join(dir, "src", "consumer.ts"),
    'import { getUser, saveUser, deleteUser } from "./api";\n' +
    'getUser("1"); saveUser("2"); deleteUser("3");\n'
  );

  preToolUse(dir, sessionId, "src/api.ts");
  fs.writeFileSync(
    path.join(dir, "src", "api.ts"),
    "export function getUser(id: string): string { return id; }\n"
  );
  postToolUse(dir, sessionId, "src/api.ts");
}

export function testHooks(test: TestFn): void {
  test("Stop hook blocks on CRITICAL risk", () => {
    const dir = makeTempProject();
    try {
      makeBreakingChange(dir, "session-1");
      const out = stop(dir, "session-1");

      assert.ok(out.trim().length > 0, "Stop hook produced no output");
      const parsed = JSON.parse(out);
      assert.strictEqual(parsed.decision, "block");
      assert.ok(
        parsed.reason.includes("saveUser"),
        `reason should name the removed export, got: ${parsed.reason}`
      );
    } finally {
      cleanUp(dir);
    }
  });

  test("Stop hook does not delete the session it is analysing", () => {
    const dir = makeTempProject();
    try {
      makeBreakingChange(dir, "session-1");
      const changesPath = path.join(dir, ".vibe-diff", "changes.jsonl");
      assert.ok(fs.existsSync(changesPath), "changes.jsonl missing before Stop");

      stop(dir, "session-1");

      assert.ok(
        fs.existsSync(changesPath),
        "Stop hook deleted changes.jsonl for the current session"
      );
    } finally {
      cleanUp(dir);
    }
  });

  test("PostToolUse stores Claude's real session id, not a generated one", () => {
    const dir = makeTempProject();
    try {
      makeBreakingChange(dir, "claude-session-xyz");
      const meta = JSON.parse(
        fs.readFileSync(path.join(dir, ".vibe-diff", "session-meta.json"), "utf-8")
      );
      assert.strictEqual(meta.sessionId, "claude-session-xyz");
    } finally {
      cleanUp(dir);
    }
  });

  test("Stop hook stays silent when nothing changed", () => {
    const dir = makeTempProject();
    try {
      const out = stop(dir, "session-1");
      assert.strictEqual(out.trim(), "");
    } finally {
      cleanUp(dir);
    }
  });

  test("Stop hook does not block twice for the same issues", () => {
    const dir = makeTempProject();
    try {
      makeBreakingChange(dir, "session-1");
      const first = stop(dir, "session-1");
      assert.strictEqual(JSON.parse(first).decision, "block");

      // Claude continues after being blocked: stop_hook_active is set.
      const second = stop(dir, "session-1", true);
      if (second.trim().length > 0) {
        assert.notStrictEqual(
          JSON.parse(second).decision,
          "block",
          "Stop hook blocked twice, which would loop"
        );
      }
    } finally {
      cleanUp(dir);
    }
  });

  test("a new session drops the previous session's changes", () => {
    const dir = makeTempProject();
    try {
      makeBreakingChange(dir, "session-1");

      // A different session edits an unrelated file.
      fs.writeFileSync(path.join(dir, "src", "other.ts"), "export function other(): void {}\n");
      preToolUse(dir, "session-2", "src/other.ts");
      fs.writeFileSync(path.join(dir, "src", "other.ts"), "export function other(): number { return 1; }\n");
      postToolUse(dir, "session-2", "src/other.ts");

      const lines = fs
        .readFileSync(path.join(dir, ".vibe-diff", "changes.jsonl"), "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l));

      assert.ok(
        lines.every((c) => c.filePath !== "src/api.ts"),
        "stale changes from the previous session were kept"
      );
    } finally {
      cleanUp(dir);
    }
  });

  test("hooks report paths with forward slashes on every platform", () => {
    const dir = makeTempProject();
    try {
      makeBreakingChange(dir, "session-1");
      const parsed = JSON.parse(stop(dir, "session-1"));
      assert.ok(
        !parsed.reason.includes("\\"),
        `reported paths should not contain backslashes, got: ${parsed.reason}`
      );
    } finally {
      cleanUp(dir);
    }
  });
}
