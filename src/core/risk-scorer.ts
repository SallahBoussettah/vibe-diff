import { RiskAssessment, RiskLevel, FileAnalysis, AffectedDependent, AffectedTest } from "../types";

export function computeRisk(
  analyses: FileAnalysis[],
  dependents: AffectedDependent[],
  affectedTests: AffectedTest[]
): RiskAssessment {
  let score = 0;
  const reasons: string[] = [];

  // File-level scoring
  const fileCount = analyses.length;
  if (fileCount >= 10) {
    score += 3;
    reasons.push(`${fileCount} files changed (large changeset)`);
  } else if (fileCount >= 5) {
    score += 1;
    reasons.push(`${fileCount} files changed`);
  }

  // Breaking API changes
  let breakingCount = 0;
  for (const analysis of analyses) {
    // Removed exports = breaking
    const removedExports = analysis.exports.filter((e) => e.changeType === "removed");
    breakingCount += removedExports.length;
    for (const exp of removedExports) {
      reasons.push(`Removed export: ${exp.name} (${analysis.filePath})`);
    }

    // Return type changes = breaking
    const returnChanges = analysis.functions.filter((f) => f.returnTypeChanged);
    breakingCount += returnChanges.length;
    for (const fn of returnChanges) {
      reasons.push(`Return type changed: ${fn.name}() (${analysis.filePath})`);
    }

    // Param changes = breaking
    const paramChanges = analysis.functions.filter((f) => f.paramsChanged);
    breakingCount += paramChanges.length;
    for (const fn of paramChanges) {
      reasons.push(`Parameters changed: ${fn.name}() (${analysis.filePath})`);
    }

    // Async/sync changes = breaking
    const asyncChanges = analysis.functions.filter((f) => f.asyncChanged);
    breakingCount += asyncChanges.length;

    // Security warnings
    const securityWarnings = analysis.behaviorChanges.filter((c) => c.startsWith("WARNING:"));
    score += securityWarnings.length * 2;
    for (const warning of securityWarnings) {
      reasons.push(warning);
    }

    // Deleted files
    if (analysis.editType === "delete") {
      score += 2;
      reasons.push(`File deleted: ${analysis.filePath}`);
    }
  }

  score += breakingCount * 3;
  if (breakingCount > 0) {
    reasons.unshift(`${breakingCount} breaking API change(s)`);
  }

  // Unupdated dependents
  const brokenDeps = dependents.filter((d) => d.status === "likely-broken");
  const reviewDeps = dependents.filter((d) => d.status === "needs-review");
  score += brokenDeps.length * 3;
  score += reviewDeps.length * 1;
  if (brokenDeps.length > 0) {
    reasons.push(`${brokenDeps.length} dependent file(s) will likely break`);
  }
  if (reviewDeps.length > 0) {
    reasons.push(`${reviewDeps.length} dependent file(s) need review`);
  }

  // Test impact
  const brokenTests = affectedTests.filter((t) => t.status === "likely-broken");
  score += brokenTests.length * 1;
  if (brokenTests.length > 0) {
    reasons.push(`${brokenTests.length} test(s) likely broken`);
  }

  // Determine level
  let level: RiskLevel;
  if (score >= 12) {
    level = "CRITICAL";
  } else if (score >= 7) {
    level = "HIGH";
  } else if (score >= 3) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  return { level, score, reasons };
}
