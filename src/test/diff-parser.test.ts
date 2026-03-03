import * as assert from "assert";
import {
  extractFunctions,
  extractExports,
  extractTypes,
  extractImports,
  computeDiff,
  detectReturnTypeChange,
  detectParamChange,
  detectAsyncChange,
} from "../core/diff-parser";

type TestFn = (name: string, fn: () => void) => void;

export function testDiffParser(test: TestFn): void {
  test("extractFunctions: simple function declaration", () => {
    const code = `export function getUser(id: string): User { return db.get(id); }`;
    const fns = extractFunctions(code);
    assert.ok(fns.has("getUser"), "should find getUser");
  });

  test("extractFunctions: async function", () => {
    const code = `export async function fetchData(url: string): Promise<Response> { return fetch(url); }`;
    const fns = extractFunctions(code);
    assert.ok(fns.has("fetchData"), "should find fetchData");
    assert.ok(fns.get("fetchData")!.includes("async"), "should include async");
  });

  test("extractFunctions: arrow function", () => {
    const code = `export const handleClick = (event: MouseEvent) => { console.log(event); }`;
    const fns = extractFunctions(code);
    assert.ok(fns.has("handleClick"), "should find handleClick");
  });

  test("extractFunctions: multi-line signature", () => {
    const code = `export function createUser(
  name: string,
  email: string,
  age: number
): User {
  return { name, email, age };
}`;
    const fns = extractFunctions(code);
    assert.ok(fns.has("createUser"), "should find createUser with multi-line params");
  });

  test("extractFunctions: class method with modifiers", () => {
    const code = `class UserService {
  public async getUser(id: string): Promise<User> {
    return this.db.get(id);
  }
}`;
    const fns = extractFunctions(code);
    assert.ok(fns.has("getUser"), "should find class method getUser");
  });

  test("extractFunctions: skips reserved words", () => {
    const code = `if (condition) { doSomething(); }\nfor (const x of items) { process(x); }`;
    const fns = extractFunctions(code);
    assert.ok(!fns.has("if"), "should not match 'if'");
    assert.ok(!fns.has("for"), "should not match 'for'");
  });

  test("extractFunctions: generic function", () => {
    const code = `export function findItem<T>(
  items: T[],
  predicate: (item: T) => boolean
): T | undefined {
  return items.find(predicate);
}`;
    const fns = extractFunctions(code);
    assert.ok(fns.has("findItem"), "should find generic function");
  });

  test("extractExports: named exports", () => {
    const code = `export function foo() {}\nexport const bar = 1;\nexport class Baz {}`;
    const exports = extractExports(code);
    assert.ok(exports.has("foo"));
    assert.ok(exports.has("bar"));
    assert.ok(exports.has("Baz"));
  });

  test("extractExports: re-exports", () => {
    const code = `export { UserService, AuthProvider } from './auth';`;
    const exports = extractExports(code);
    assert.ok(exports.has("UserService"));
    assert.ok(exports.has("AuthProvider"));
  });

  test("extractExports: interface and type", () => {
    const code = `export interface User { id: string; }\nexport type Status = "active" | "inactive";`;
    const exports = extractExports(code);
    assert.ok(exports.has("User"));
    assert.ok(exports.has("Status"));
  });

  test("extractTypes: interfaces, types, enums", () => {
    const code = `interface Foo {}\ntype Bar = string;\nenum Status { Active, Inactive }`;
    const types = extractTypes(code);
    assert.ok(types.has("Foo"));
    assert.ok(types.has("Bar"));
    assert.ok(types.has("Status"));
  });

  test("extractImports: ES module imports", () => {
    const code = `import { foo, bar } from './module';\nimport baz from './other';`;
    const imports = extractImports(code);
    assert.strictEqual(imports.length, 2);
    assert.deepStrictEqual(imports[0].names, ["foo", "bar"]);
    assert.strictEqual(imports[0].source, "./module");
  });

  test("extractImports: require syntax", () => {
    const code = `const { readFile } = require('fs');\nconst path = require('path');`;
    const imports = extractImports(code);
    assert.ok(imports.length >= 2);
  });

  test("computeDiff: counts added and removed lines", () => {
    const old = "line1\nline2\nline3";
    const new_ = "line1\nline4\nline3";
    const diff = computeDiff(old, new_);
    assert.strictEqual(diff.linesAdded, 1);
    assert.strictEqual(diff.linesRemoved, 1);
  });

  test("computeDiff: empty old content (new file)", () => {
    const diff = computeDiff("", "line1\nline2");
    assert.strictEqual(diff.linesAdded, 2);
    assert.strictEqual(diff.linesRemoved, 0);
  });

  test("detectReturnTypeChange: different return types", () => {
    assert.ok(detectReturnTypeChange("function foo(): User {", "function foo(): Session {"));
  });

  test("detectReturnTypeChange: same return types", () => {
    assert.ok(!detectReturnTypeChange("function foo(): User {", "function foo(): User {"));
  });

  test("detectParamChange: different params", () => {
    assert.ok(detectParamChange("function foo(a: string)", "function foo(a: string, b: number)"));
  });

  test("detectAsyncChange: sync to async", () => {
    assert.ok(detectAsyncChange("function foo()", "async function foo()"));
  });

  test("detectAsyncChange: both async", () => {
    assert.ok(!detectAsyncChange("async function foo()", "async function foo()"));
  });
}
