import * as path from "path";
import {
  FileChange,
  SemanticReport,
  AffectedDependent,
  AffectedTest,
  DependencyChange,
} from "../types";
import { analyzeFile, analyzeDependencies } from "./categorizer";
import { computeDiff } from "./diff-parser";
import { findDependents, findRelatedTests } from "./import-scanner";
import { computeRisk } from "./risk-scorer";
import { loadSession } from "./collector";

export function generateReport(projectRoot: string): SemanticReport {
  const session = loadSession(projectRoot);
  const changes = session.changes;

  if (changes.length === 0) {
    return emptyReport(session.sessionId);
  }

  // Analyze each file
  const fileAnalyses = changes.map((change) => analyzeFile(change));

  // Compute total lines
  let totalAdded = 0;
  let totalRemoved = 0;
  for (const change of changes) {
    const diff = computeDiff(change.oldContent, change.newContent);
    totalAdded += diff.linesAdded;
    totalRemoved += diff.linesRemoved;
  }

  // Collect all behavior changes
  const behaviorChanges: string[] = [];
  for (const analysis of fileAnalyses) {
    for (const change of analysis.behaviorChanges) {
      const prefix = fileAnalyses.length > 1 ? `[${shortPath(analysis.filePath)}] ` : "";
      behaviorChanges.push(`${prefix}${change}`);
    }
  }

  // Collect API changes (export + function signature changes)
  const apiChanges: string[] = [];
  const breakingChanges: string[] = [];
  for (const analysis of fileAnalyses) {
    const fp = shortPath(analysis.filePath);

    for (const exp of analysis.exports) {
      const desc = `${exp.changeType} export: ${exp.name} (${exp.kind}) in ${fp}`;
      apiChanges.push(desc);
      if (exp.changeType === "removed") {
        breakingChanges.push(`REMOVED export: ${exp.name} from ${fp}`);
      }
    }

    for (const fn of analysis.functions) {
      if (fn.changeType === "added") {
        apiChanges.push(`New function: ${fn.name}() in ${fp}`);
      } else if (fn.changeType === "removed") {
        apiChanges.push(`Removed function: ${fn.name}() from ${fp}`);
        breakingChanges.push(`REMOVED function: ${fn.name}() from ${fp}`);
      } else if (fn.changeType === "modified") {
        if (fn.returnTypeChanged || fn.paramsChanged || fn.asyncChanged) {
          apiChanges.push(`Modified: ${fn.details} in ${fp}`);
          if (fn.returnTypeChanged) {
            breakingChanges.push(`BREAKING: ${fn.name}() return type changed in ${fp}`);
          }
          if (fn.paramsChanged) {
            breakingChanges.push(`BREAKING: ${fn.name}() parameters changed in ${fp}`);
          }
        }
      }
    }

    for (const type of analysis.types) {
      apiChanges.push(`${type.changeType} ${type.kind}: ${type.name} in ${fp}`);
      if (type.changeType === "removed") {
        breakingChanges.push(`REMOVED ${type.kind}: ${type.name} from ${fp}`);
      }
    }
  }

  // Find affected dependents
  const allDependents: AffectedDependent[] = [];
  for (const analysis of fileAnalyses) {
    const filePath = path.isAbsolute(analysis.filePath)
      ? analysis.filePath
      : path.join(projectRoot, analysis.filePath);

    const deps = findDependents(filePath, projectRoot, analysis.exports);
    allDependents.push(...deps);
  }

  // Find affected tests
  const allTests: AffectedTest[] = [];
  for (const change of changes) {
    const filePath = path.isAbsolute(change.filePath)
      ? change.filePath
      : path.join(projectRoot, change.filePath);

    const tests = findRelatedTests(filePath, projectRoot);
    const wasTestUpdated = changes.some((c) => tests.includes(c.filePath));

    for (const test of tests) {
      if (changes.some((c) => c.filePath === test || c.filePath.endsWith(test))) {
        allTests.push({
          filePath: test,
          relatedSource: change.filePath,
          status: "ok",
          reason: "Test file was also updated",
        });
      } else {
        allTests.push({
          filePath: test,
          relatedSource: change.filePath,
          status: "needs-review",
          reason: "Source changed but test was not updated",
        });
      }
    }
  }

  // Dependency changes (package.json)
  let dependencyChanges: DependencyChange[] = [];
  const pkgChange = changes.find(
    (c) => path.basename(c.filePath) === "package.json"
  );
  if (pkgChange) {
    dependencyChanges = analyzeDependencies(pkgChange.oldContent, pkgChange.newContent);
  }

  // Compute risk
  const risk = computeRisk(fileAnalyses, allDependents, allTests);

  return {
    sessionId: session.sessionId,
    timestamp: Date.now(),
    filesChanged: changes.length,
    linesAdded: totalAdded,
    linesRemoved: totalRemoved,
    fileAnalyses,
    behaviorChanges,
    apiChanges,
    breakingChanges,
    sideEffects: allDependents,
    affectedTests: allTests,
    dependencyChanges,
    risk,
  };
}

function emptyReport(sessionId: string): SemanticReport {
  return {
    sessionId,
    timestamp: Date.now(),
    filesChanged: 0,
    linesAdded: 0,
    linesRemoved: 0,
    fileAnalyses: [],
    behaviorChanges: [],
    apiChanges: [],
    breakingChanges: [],
    sideEffects: [],
    affectedTests: [],
    dependencyChanges: [],
    risk: { level: "LOW", score: 0, reasons: [] },
  };
}

function shortPath(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  if (parts.length <= 3) return parts.join("/");
  return `.../${parts.slice(-2).join("/")}`;
}
