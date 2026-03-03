import * as assert from "assert";
import { computeRisk } from "../core/risk-scorer";
import { FileAnalysis, AffectedDependent, AffectedTest } from "../types";

type TestFn = (name: string, fn: () => void) => void;

function makeAnalysis(overrides: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    filePath: "src/test.ts",
    editType: "edit",
    functions: [],
    exports: [],
    types: [],
    behaviorChanges: [],
    configChanges: [],
    ...overrides,
  };
}

export function testRiskScorer(test: TestFn): void {
  test("LOW risk: no breaking changes", () => {
    const analysis = makeAnalysis({ functions: [{ name: "foo", changeType: "added", returnTypeChanged: false, paramsChanged: false, asyncChanged: false, details: "" }] });
    const risk = computeRisk([analysis], [], []);
    assert.strictEqual(risk.level, "LOW");
  });

  test("CRITICAL risk: many removed exports plus broken dependents", () => {
    const analysis = makeAnalysis({
      exports: [
        { name: "User", changeType: "removed", kind: "interface" },
        { name: "getUser", changeType: "removed", kind: "function" },
        { name: "deleteUser", changeType: "removed", kind: "function" },
      ],
      functions: [
        { name: "getUser", changeType: "removed", returnTypeChanged: false, paramsChanged: false, asyncChanged: false, details: "" },
      ],
    });
    const brokenDep: AffectedDependent = {
      filePath: "src/dashboard.ts",
      usesSymbols: ["User", "getUser"],
      brokenSymbols: ["User", "getUser"],
      status: "likely-broken",
      reason: "Uses removed exports",
    };
    const risk = computeRisk([analysis], [brokenDep], []);
    assert.strictEqual(risk.level, "CRITICAL");
    assert.ok(risk.score >= 12);
  });

  test("HIGH risk: return type change + broken dependent", () => {
    const analysis = makeAnalysis({
      functions: [
        { name: "login", changeType: "modified", returnTypeChanged: true, paramsChanged: false, asyncChanged: false, details: "", oldSignature: "login(): User", newSignature: "login(): Session" },
      ],
    });
    const dependent: AffectedDependent = {
      filePath: "src/dashboard.ts",
      usesSymbols: ["login"],
      brokenSymbols: [],
      status: "needs-review",
      reason: "Uses modified export",
    };
    const risk = computeRisk([analysis], [dependent], []);
    assert.ok(risk.score >= 3);
    assert.ok(["MEDIUM", "HIGH", "CRITICAL"].includes(risk.level));
  });

  test("risk increases with broken dependents", () => {
    const analysis = makeAnalysis({
      exports: [{ name: "User", changeType: "removed", kind: "interface" }],
    });
    const broken: AffectedDependent = {
      filePath: "src/dashboard.ts",
      usesSymbols: ["User"],
      brokenSymbols: ["User"],
      status: "likely-broken",
      reason: "Uses removed export",
    };
    const risk = computeRisk([analysis], [broken], []);
    assert.ok(risk.score >= 6);
    assert.ok(risk.reasons.some((r) => r.includes("likely break")));
  });

  test("risk includes security warnings", () => {
    const analysis = makeAnalysis({
      behaviorChanges: ["WARNING: Uses innerHTML (potential XSS)"],
    });
    const risk = computeRisk([analysis], [], []);
    assert.ok(risk.score >= 2);
    assert.ok(risk.reasons.some((r) => r.includes("innerHTML")));
  });

  test("risk increases with many files", () => {
    const analyses = Array.from({ length: 12 }, (_, i) =>
      makeAnalysis({ filePath: `src/file${i}.ts` })
    );
    const risk = computeRisk(analyses, [], []);
    assert.ok(risk.score >= 3);
    assert.ok(risk.reasons.some((r) => r.includes("files changed")));
  });
}
