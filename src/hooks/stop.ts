#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { generateReport } from "../core/analyzer";
import { formatTerminal } from "../output/terminal";

/**
 * Stop hook for VibeDiff.
 * Fires when Claude finishes responding.
 *
 * Runs full semantic analysis on all accumulated changes.
 * - CRITICAL risk: blocks Claude (decision: "block"), forces self-review
 * - HIGH risk: warns Claude via additionalContext
 * - LOW/MEDIUM: silent (report available via CLI)
 *
 * Checks stop_hook_active to prevent infinite loops.
 */

interface StopHookPayload {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
}

function main(): void {
  let input = "";
  process.stdin.setEncoding("utf-8");
  process.stdin.on("data", (chunk: string) => { input += chunk; });
  process.stdin.on("error", () => process.exit(1));

  process.stdin.on("end", () => {
    try {
      const data: StopHookPayload = JSON.parse(input);
      handle(data);
    } catch {
      // Silent exit. Never break Claude Code.
      process.exit(0);
    }
  });
}

function handle(data: StopHookPayload): void {
  try {
    const projectRoot = data.cwd || process.cwd();

    // Prevent infinite loops: if Stop hook already fired and Claude is
    // continuing because we blocked it, don't block again for the same issues.
    if (data.stop_hook_active) {
      handleRecheck(projectRoot);
      return;
    }

    // Check if we have any changes to analyze
    const changesPath = path.join(projectRoot, ".vibe-diff", "changes.jsonl");
    const legacyPath = path.join(projectRoot, ".vibe-diff", "session.json");
    if (!fs.existsSync(changesPath) && !fs.existsSync(legacyPath)) {
      process.exit(0);
      return;
    }

    // Run full semantic analysis
    const report = generateReport(projectRoot);

    if (report.filesChanged === 0) {
      process.exit(0);
      return;
    }

    // Save the report for CLI access
    const reportPath = path.join(projectRoot, ".vibe-diff", "last-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

    const riskLevel = report.risk.level;

    if (riskLevel === "CRITICAL") {
      // BLOCK: Force Claude to stop and fix breaking changes
      const breakingList = report.breakingChanges.slice(0, 5).join("\n  - ");
      const sideEffects = report.sideEffects
        .filter((s) => s.status === "likely-broken")
        .slice(0, 3)
        .map((s) => `${s.filePath}: ${s.reason}`)
        .join("\n  - ");

      let reason = `VibeDiff detected breaking changes that need attention before continuing.\n\n`;
      reason += `Breaking changes:\n  - ${breakingList}\n`;
      if (sideEffects) {
        reason += `\nFiles that may break:\n  - ${sideEffects}\n`;
      }
      const remaining = report.breakingChanges.length - 5;
      if (remaining > 0) {
        reason += `\n  ... and ${remaining} more.\n`;
      }
      reason += `\nRisk: Critical (score: ${report.risk.score})`;
      reason += `\nPlease review these changes and fix affected files, or confirm the removals were intentional and update dependent imports.`;

      saveReportedIssues(projectRoot, report.breakingChanges);

      const output = JSON.stringify({ decision: "block", reason });
      process.stdout.write(output);
      process.exit(0);

    } else if (riskLevel === "HIGH") {
      // WARN: Multi-line warning via systemMessage
      const changes = report.breakingChanges.slice(0, 3);
      const affected = report.sideEffects
        .filter((s) => s.status === "likely-broken" || s.status === "needs-review")
        .slice(0, 3)
        .map((s) => s.filePath);

      let msg = `VibeDiff detected changes that may cause issues:`;
      for (const c of changes) {
        msg += `\n  - ${c}`;
      }
      if (affected.length > 0) {
        msg += `\nAffected files: ${affected.join(", ")}`;
      }
      msg += `\nRisk: High (score: ${report.risk.score}). Run 'vibe-diff report' for full details.`;

      const output = JSON.stringify({ systemMessage: msg });
      process.stdout.write(output);
      process.exit(0);

    } else if (riskLevel === "MEDIUM") {
      // INFORM: Brief one-line note via systemMessage
      const topChange = report.breakingChanges[0] || report.apiChanges[0] || `${report.filesChanged} file(s) modified`;
      const msg = `VibeDiff: ${topChange}. Risk: Medium (score: ${report.risk.score}).`;
      const output = JSON.stringify({ systemMessage: msg });
      process.stdout.write(output);
      process.exit(0);

    } else {
      // LOW: Silent. Report available via `vibe-diff report`.
      process.exit(0);
    }
  } catch {
    // Silent fail
    process.exit(0);
  }
}

function handleRecheck(projectRoot: string): void {
  // Claude is continuing after we blocked it. Check if the issues were fixed.
  try {
    const report = generateReport(projectRoot);
    const previousIssues = loadReportedIssues(projectRoot);

    // Check if any previously reported breaking changes still exist
    const unresolvedIssues = report.breakingChanges.filter((bc) =>
      previousIssues.includes(bc)
    );

    if (unresolvedIssues.length > 0 && report.risk.level === "CRITICAL") {
      // Still critical, but don't block again to avoid infinite loop.
      // Just warn via systemMessage.
      const msg = `VibeDiff: ${unresolvedIssues.length} breaking change(s) still unresolved. Risk remains Critical.`;
      const output = JSON.stringify({ systemMessage: msg });
      process.stdout.write(output);
    }

    // Save updated report
    const reportPath = path.join(projectRoot, ".vibe-diff", "last-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  } catch {
    // Silent fail
  }
  process.exit(0);
}

function buildSummary(report: ReturnType<typeof generateReport>): string {
  const parts: string[] = [];
  if (report.breakingChanges.length > 0) {
    parts.push(`${report.breakingChanges.length} breaking change(s)`);
  }
  const brokenDeps = report.sideEffects.filter((s) => s.status === "likely-broken");
  if (brokenDeps.length > 0) {
    parts.push(`${brokenDeps.length} file(s) likely broken`);
  }
  const brokenTests = report.affectedTests.filter((t) => t.status === "likely-broken");
  if (brokenTests.length > 0) {
    parts.push(`${brokenTests.length} test(s) likely broken`);
  }
  return parts.join(", ") || `${report.filesChanged} file(s) changed`;
}

function saveReportedIssues(projectRoot: string, issues: string[]): void {
  try {
    const issuePath = path.join(projectRoot, ".vibe-diff", "reported-issues.json");
    fs.writeFileSync(issuePath, JSON.stringify({ issues, timestamp: Date.now() }));
  } catch {
    // Silent fail
  }
}

function loadReportedIssues(projectRoot: string): string[] {
  try {
    const issuePath = path.join(projectRoot, ".vibe-diff", "reported-issues.json");
    const data = JSON.parse(fs.readFileSync(issuePath, "utf-8"));
    // Only use reported issues from the last 10 minutes (avoid stale data)
    if (Date.now() - data.timestamp < 10 * 60 * 1000) {
      return data.issues || [];
    }
  } catch {
    // No previous issues
  }
  return [];
}

main();
