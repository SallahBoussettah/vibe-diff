import { RiskAssessment, RiskLevel, FileAnalysis, AffectedDependent, AffectedTest } from "../types";

/**
 * Risk scoring weights.
 * Deterministic signals (0% false positive) get higher weights.
 * Heuristic signals (possible false positives) get lower weights.
 */
const WEIGHTS = {
  removedExport: 5,      // deterministic, universally max severity (SemVer, cargo-semver-checks, Go)
  returnTypeChange: 4,   // deterministic, compiler-verifiable
  paramChange: 4,        // deterministic, compiler-verifiable
  asyncChange: 3,        // deterministic but callers may already handle promises
  brokenDependent: 3,    // needs confirmation of actual breakage
  reviewDependent: 1,    // soft signal
  securityWarning: 2,    // heuristic, possible false positives
  deletedFile: 3,        // deterministic
  manyFiles: 2,          // noisy, context-dependent
  brokenTest: 1,         // soft signal
};

/**
 * Thresholds:
 *   LOW (0-2):      silent
 *   MEDIUM (3-5):   brief one-line note via additionalContext
 *   HIGH (6-9):     multi-line warning with affected files
 *   CRITICAL (10+): block Claude, force self-review
 */
const THRESHOLDS = {
  MEDIUM: 3,
  HIGH: 6,
  CRITICAL: 10,
};

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
    score += WEIGHTS.manyFiles;
    reasons.push(`${fileCount} files changed (large changeset)`);
  } else if (fileCount >= 5) {
    score += 1;
    reasons.push(`${fileCount} files changed`);
  }

  // Per-file analysis
  for (const analysis of analyses) {
    // Removed exports (deterministic, highest weight)
    const removedExports = analysis.exports.filter((e) => e.changeType === "removed");
    for (const exp of removedExports) {
      score += WEIGHTS.removedExport;
      reasons.push(`Removed export: ${exp.name} (${analysis.filePath})`);
    }

    // Return type changes (deterministic)
    const returnChanges = analysis.functions.filter((f) => f.returnTypeChanged);
    for (const fn of returnChanges) {
      score += WEIGHTS.returnTypeChange;
      reasons.push(`Return type changed: ${fn.name}() (${analysis.filePath})`);
    }

    // Param changes (deterministic)
    const paramChanges = analysis.functions.filter((f) => f.paramsChanged);
    for (const fn of paramChanges) {
      score += WEIGHTS.paramChange;
      reasons.push(`Parameters changed: ${fn.name}() (${analysis.filePath})`);
    }

    // Async/sync changes
    const asyncChanges = analysis.functions.filter((f) => f.asyncChanged);
    for (const fn of asyncChanges) {
      score += WEIGHTS.asyncChange;
      reasons.push(`Async/sync changed: ${fn.name}() (${analysis.filePath})`);
    }

    // Security warnings (heuristic)
    const securityWarnings = analysis.behaviorChanges.filter((c) => c.startsWith("WARNING:"));
    score += securityWarnings.length * WEIGHTS.securityWarning;
    for (const warning of securityWarnings) {
      reasons.push(warning);
    }

    // Deleted files
    if (analysis.editType === "delete") {
      score += WEIGHTS.deletedFile;
      reasons.push(`File deleted: ${analysis.filePath}`);
    }
  }

  // Unupdated dependents
  const brokenDeps = dependents.filter((d) => d.status === "likely-broken");
  const reviewDeps = dependents.filter((d) => d.status === "needs-review");
  score += brokenDeps.length * WEIGHTS.brokenDependent;
  score += reviewDeps.length * WEIGHTS.reviewDependent;
  if (brokenDeps.length > 0) {
    reasons.push(`${brokenDeps.length} dependent file(s) will likely break`);
  }
  if (reviewDeps.length > 0) {
    reasons.push(`${reviewDeps.length} dependent file(s) need review`);
  }

  // Test impact
  const brokenTests = affectedTests.filter((t) => t.status === "likely-broken");
  score += brokenTests.length * WEIGHTS.brokenTest;
  if (brokenTests.length > 0) {
    reasons.push(`${brokenTests.length} test(s) likely broken`);
  }

  // Determine level
  let level: RiskLevel;
  if (score >= THRESHOLDS.CRITICAL) {
    level = "CRITICAL";
  } else if (score >= THRESHOLDS.HIGH) {
    level = "HIGH";
  } else if (score >= THRESHOLDS.MEDIUM) {
    level = "MEDIUM";
  } else {
    level = "LOW";
  }

  return { level, score, reasons };
}
