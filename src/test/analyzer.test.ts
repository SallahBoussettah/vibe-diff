import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { addChange } from "../core/collector";
import { generateReport } from "../core/analyzer";

type TestFn = (name: string, fn: () => void) => void;

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vibe-diff-analyzer-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  return dir;
}

function cleanUp(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch { /* ignore */ }
}

export function testAnalyzer(test: TestFn): void {
  test("report: recognizes a test file updated alongside its source", () => {
    // findRelatedTests returned platform-native paths while the collector
    // stores forward slashes, so on Windows the comparison never matched and
    // an updated test was still reported as "not updated".
    const dir = makeTempProject();
    try {
      fs.writeFileSync(
        path.join(dir, "src", "math.ts"),
        "export function add(a: number, b: number, c: number): number { return a + b + c; }\n"
      );
      fs.writeFileSync(
        path.join(dir, "src", "math.test.ts"),
        'import { add } from "./math";\nadd(1, 2, 3);\n'
      );

      addChange(dir, {
        filePath: "src/math.ts",
        oldContent: "export function add(a: number, b: number): number { return a + b; }\n",
        newContent: "export function add(a: number, b: number, c: number): number { return a + b + c; }\n",
        editType: "edit",
        timestamp: Date.now(),
      }, "s1");
      addChange(dir, {
        filePath: "src/math.test.ts",
        oldContent: 'import { add } from "./math";\nadd(1, 2);\n',
        newContent: 'import { add } from "./math";\nadd(1, 2, 3);\n',
        editType: "edit",
        timestamp: Date.now(),
      }, "s1");

      const report = generateReport(dir);
      const mathTest = report.affectedTests.find((t) => t.filePath.endsWith("math.test.ts"));
      assert.ok(mathTest, "should have found the related test file");
      assert.strictEqual(
        mathTest!.status,
        "ok",
        `test was updated in the same session but was reported as: ${mathTest!.reason}`
      );
    } finally {
      cleanUp(dir);
    }
  });

  test("report: flags a test that was not updated", () => {
    const dir = makeTempProject();
    try {
      fs.writeFileSync(
        path.join(dir, "src", "math.ts"),
        "export function add(a: number, b: number, c: number): number { return a + b + c; }\n"
      );
      fs.writeFileSync(
        path.join(dir, "src", "math.test.ts"),
        'import { add } from "./math";\nadd(1, 2);\n'
      );

      addChange(dir, {
        filePath: "src/math.ts",
        oldContent: "export function add(a: number, b: number): number { return a + b; }\n",
        newContent: "export function add(a: number, b: number, c: number): number { return a + b + c; }\n",
        editType: "edit",
        timestamp: Date.now(),
      }, "s1");

      const report = generateReport(dir);
      const mathTest = report.affectedTests.find((t) => t.filePath.endsWith("math.test.ts"));
      assert.ok(mathTest, "should have found the related test file");
      assert.strictEqual(mathTest!.status, "needs-review");
    } finally {
      cleanUp(dir);
    }
  });

  test("report: all reported paths use forward slashes", () => {
    const dir = makeTempProject();
    try {
      fs.writeFileSync(
        path.join(dir, "src", "api.ts"),
        "export function getUser(id: string): string { return id; }\n"
      );
      fs.writeFileSync(
        path.join(dir, "src", "consumer.ts"),
        'import { getUser, saveUser } from "./api";\ngetUser("1"); saveUser("2");\n'
      );

      addChange(dir, {
        filePath: "src/api.ts",
        oldContent:
          "export function getUser(id: string): string { return id; }\n" +
          "export function saveUser(u: string): void { void u; }\n",
        newContent: "export function getUser(id: string): string { return id; }\n",
        editType: "edit",
        timestamp: Date.now(),
      }, "s1");

      const report = generateReport(dir);
      assert.ok(report.sideEffects.length > 0, "should have found a dependent");
      for (const dep of report.sideEffects) {
        assert.ok(
          !dep.filePath.includes("\\"),
          `dependent path should use forward slashes, got: ${dep.filePath}`
        );
      }
      for (const affected of report.affectedTests) {
        assert.ok(
          !affected.filePath.includes("\\"),
          `test path should use forward slashes, got: ${affected.filePath}`
        );
      }
    } finally {
      cleanUp(dir);
    }
  });
}
