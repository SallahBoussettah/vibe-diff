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
    assert.ok(risk.score <= 2);
  });

  test("MEDIUM risk: 1 removed export (5 pts)", () => {
    const analysis = makeAnalysis({
      exports: [{ name: "User", changeType: "removed", kind: "interface" }],
    });
    const risk = computeRisk([analysis], [], []);
    assert.strictEqual(risk.level, "MEDIUM");
    assert.strictEqual(risk.score, 5);
  });

  test("CRITICAL risk: 2 removed exports (10 pts)", () => {
    const analysis = makeAnalysis({
      exports: [
        { name: "User", changeType: "removed", kind: "interface" },
        { name: "getUser", changeType: "removed", kind: "function" },
      ],
    });
    const risk = computeRisk([analysis], [], []);
    assert.strictEqual(risk.level, "CRITICAL");
    assert.strictEqual(risk.score, 10);
  });

  test("CRITICAL risk: removed exports + broken dependent", () => {
    const analysis = makeAnalysis({
      exports: [
        { name: "User", changeType: "removed", kind: "interface" },
        { name: "getUser", changeType: "removed", kind: "function" },
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
    assert.strictEqual(risk.score, 13); // 5+5+3
  });

  test("HIGH risk: 1 removed export + 1 broken dependent (8 pts)", () => {
    const analysis = makeAnalysis({
      exports: [{ name: "User", changeType: "removed", kind: "interface" }],
    });
    const dependent: AffectedDependent = {
      filePath: "src/dashboard.ts",
      usesSymbols: ["User"],
      brokenSymbols: ["User"],
      status: "likely-broken",
      reason: "Uses removed export",
    };
    const risk = computeRisk([analysis], [dependent], []);
    assert.strictEqual(risk.level, "HIGH");
    assert.strictEqual(risk.score, 8); // 5+3
  });

  test("HIGH risk: return type change + param change (8 pts)", () => {
    const analysis = makeAnalysis({
      functions: [
        { name: "login", changeType: "modified", returnTypeChanged: true, paramsChanged: true, asyncChanged: false, details: "" },
      ],
    });
    const risk = computeRisk([analysis], [], []);
    assert.strictEqual(risk.level, "HIGH");
    assert.strictEqual(risk.score, 8); // 4+4
  });

  test("risk includes security warnings at 2 pts each", () => {
    const analysis = makeAnalysis({
      behaviorChanges: ["WARNING: Uses innerHTML (potential XSS)"],
    });
    const risk = computeRisk([analysis], [], []);
    assert.ok(risk.score >= 2);
    assert.ok(risk.reasons.some((r) => r.includes("innerHTML")));
  });

  test("risk: 10+ files adds 2 pts (not 3)", () => {
    const analyses = Array.from({ length: 12 }, (_, i) =>
      makeAnalysis({ filePath: `src/file${i}.ts` })
    );
    const risk = computeRisk(analyses, [], []);
    assert.strictEqual(risk.score, 2);
    assert.ok(risk.reasons.some((r) => r.includes("files changed")));
  });

  test("heuristic signals alone stay below CRITICAL", () => {
    const analysis = makeAnalysis({
      behaviorChanges: [
        "WARNING: Uses innerHTML (potential XSS)",
        "WARNING: Uses eval() (security risk)",
        "WARNING: Possible SQL injection",
      ],
    });
    // 3 security warnings x 2 = 6 = HIGH, not CRITICAL
    const risk = computeRisk([analysis], [], []);
    assert.strictEqual(risk.level, "HIGH");
    assert.ok(risk.score < 10);
  });
}
