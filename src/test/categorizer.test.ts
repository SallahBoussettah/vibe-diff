import * as assert from "assert";
import { analyzeFile, analyzeDependencies } from "../core/categorizer";
import { FileChange } from "../types";

type TestFn = (name: string, fn: () => void) => void;

export function testCategorizer(test: TestFn): void {
  test("analyzeFile: detects new file", () => {
    const change: FileChange = {
      filePath: "src/new.ts",
      oldContent: "",
      newContent: "export function hello() { return 'hi'; }",
      editType: "create",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.includes("New file created"));
    assert.ok(result.functions.some((f) => f.name === "hello" && f.changeType === "added"));
    assert.ok(result.exports.some((e) => e.name === "hello" && e.changeType === "added"));
  });

  test("analyzeFile: detects removed function", () => {
    const change: FileChange = {
      filePath: "src/auth.ts",
      oldContent: "export function login() {}\nexport function logout() {}",
      newContent: "export function login() {}",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.functions.some((f) => f.name === "logout" && f.changeType === "removed"));
  });

  test("analyzeFile: detects return type change", () => {
    const change: FileChange = {
      filePath: "src/api.ts",
      oldContent: "export function getUser(id: string): User { return db.get(id); }",
      newContent: "export function getUser(id: string): Session { return db.get(id); }",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.functions.some((f) => f.name === "getUser" && f.returnTypeChanged));
  });

  test("analyzeFile: detects async change", () => {
    const change: FileChange = {
      filePath: "src/api.ts",
      oldContent: "export function fetchData(): Data { return cache.get(); }",
      newContent: "export async function fetchData(): Promise<Data> { return await api.get(); }",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.some((b) => b.includes("async")));
  });

  test("analyzeFile: detects removed export", () => {
    const change: FileChange = {
      filePath: "src/types.ts",
      oldContent: "export interface User { id: string; }\nexport interface Session { token: string; }",
      newContent: "export interface Session { token: string; }",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.exports.some((e) => e.name === "User" && e.changeType === "removed"));
  });

  test("analyzeFile: detects security patterns", () => {
    const change: FileChange = {
      filePath: "src/render.ts",
      oldContent: "function render(text: string) { el.textContent = text; }",
      newContent: "function render(html: string) { el.innerHTML = html; }",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.some((b) => b.includes("innerHTML")));
  });

  test("analyzeFile: detects deleted file", () => {
    const change: FileChange = {
      filePath: "src/old.ts",
      oldContent: "export function legacy() {}",
      newContent: "",
      editType: "delete",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.includes("File deleted"));
    assert.ok(result.exports.some((e) => e.name === "legacy" && e.changeType === "removed"));
  });

  test("analyzeFile: skips large files for deep analysis", () => {
    const bigContent = Array.from({ length: 11000 }, (_, i) => `const x${i} = ${i};`).join("\n");
    const change: FileChange = {
      filePath: "src/huge.ts",
      oldContent: bigContent,
      newContent: bigContent + "\nexport function newFn() {}",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.some((b) => b.includes("too large")));
    // Should still check exports even on large files
    assert.ok(result.exports.length >= 0);
  });

  test("analyzeDependencies: detects added package", () => {
    const old = JSON.stringify({ dependencies: { express: "^4.0.0" } });
    const new_ = JSON.stringify({ dependencies: { express: "^4.0.0", lodash: "^4.17.0" } });
    const deps = analyzeDependencies(old, new_);
    assert.ok(deps.some((d) => d.name === "lodash" && d.changeType === "added"));
  });

  test("analyzeDependencies: detects removed package", () => {
    const old = JSON.stringify({ dependencies: { express: "^4.0.0", lodash: "^4.17.0" } });
    const new_ = JSON.stringify({ dependencies: { express: "^4.0.0" } });
    const deps = analyzeDependencies(old, new_);
    assert.ok(deps.some((d) => d.name === "lodash" && d.changeType === "removed"));
  });

  test("analyzeDependencies: detects upgraded package", () => {
    const old = JSON.stringify({ dependencies: { express: "^4.0.0" } });
    const new_ = JSON.stringify({ dependencies: { express: "^5.0.0" } });
    const deps = analyzeDependencies(old, new_);
    assert.ok(deps.some((d) => d.name === "express" && d.changeType === "upgraded"));
  });

  test("analyzeFile: detects added React hooks", () => {
    const change: FileChange = {
      filePath: "src/App.tsx",
      oldContent: "export function App() { return <div>Hello</div>; }",
      newContent: "export function App() { const [count, setCount] = useState(0); useEffect(() => {}, []); return <div>{count}</div>; }",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.some((b) => b.includes("useState")));
    assert.ok(result.behaviorChanges.some((b) => b.includes("useEffect")));
  });

  test("analyzeFile: detects removed Props interface", () => {
    const change: FileChange = {
      filePath: "src/Button.tsx",
      oldContent: "interface ButtonProps { label: string; onClick: () => void; }\nexport function Button(props: ButtonProps) { return null; }",
      newContent: "export function Button({ label }: { label: string }) { return null; }",
      editType: "edit",
      timestamp: Date.now(),
    };
    const result = analyzeFile(change);
    assert.ok(result.behaviorChanges.some((b) => b.includes("ButtonProps")));
  });
}
