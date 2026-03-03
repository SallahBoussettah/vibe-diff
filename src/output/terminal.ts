import { SemanticReport, RiskLevel } from "../types";

// ANSI color codes
const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bgRed: "\x1b[41m",
  bgYellow: "\x1b[43m",
  bgGreen: "\x1b[42m",
  bgBlue: "\x1b[44m",
};

const RISK_COLORS: Record<RiskLevel, string> = {
  LOW: c.green,
  MEDIUM: c.yellow,
  HIGH: c.red,
  CRITICAL: c.bgRed + c.white,
};

const RISK_ICONS: Record<RiskLevel, string> = {
  LOW: "OK",
  MEDIUM: "!!",
  HIGH: "XX",
  CRITICAL: "!!",
};

export function formatTerminal(report: SemanticReport): string {
  const lines: string[] = [];
  const W = 64;
  const HR = "─".repeat(W);

  // Header
  lines.push("");
  lines.push(`  ${c.bold}${c.cyan}Vibe Diff${c.reset}`);
  lines.push(`  ${c.dim}${HR}${c.reset}`);
  lines.push(
    `  ${c.dim}Session: ${report.filesChanged} file(s), ` +
    `+${report.linesAdded} -${report.linesRemoved} lines${c.reset}`
  );
  lines.push("");

  if (report.filesChanged === 0) {
    lines.push(`  ${c.dim}No changes detected in this session.${c.reset}`);
    lines.push("");
    return lines.join("\n");
  }

  // Files changed
  lines.push(`  ${c.bold}Files Changed${c.reset}`);
  for (const analysis of report.fileAnalyses) {
    const icon = analysis.editType === "create" ? "+" :
                 analysis.editType === "delete" ? "-" : "*";
    const color = analysis.editType === "create" ? c.green :
                  analysis.editType === "delete" ? c.red : c.yellow;
    lines.push(`    ${color}${icon}${c.reset} ${analysis.filePath}`);
  }
  lines.push("");

  // Behavior Changes
  if (report.behaviorChanges.length > 0) {
    lines.push(`  ${c.bold}Behavior Changes${c.reset}`);
    for (const change of report.behaviorChanges) {
      if (change.startsWith("WARNING:")) {
        lines.push(`    ${c.red}!${c.reset} ${c.red}${change}${c.reset}`);
      } else {
        lines.push(`    ${c.blue}>${c.reset} ${change}`);
      }
    }
    lines.push("");
  }

  // API Changes
  if (report.apiChanges.length > 0) {
    lines.push(`  ${c.bold}API Changes${c.reset}`);
    for (const change of report.apiChanges) {
      const color = change.includes("Removed") || change.includes("removed")
        ? c.red
        : change.includes("New") || change.includes("added")
          ? c.green
          : c.yellow;
      lines.push(`    ${color}>${c.reset} ${change}`);
    }
    lines.push("");
  }

  // Breaking Changes
  if (report.breakingChanges.length > 0) {
    lines.push(`  ${c.bold}${c.red}Breaking Changes${c.reset}`);
    for (const change of report.breakingChanges) {
      lines.push(`    ${c.red}!${c.reset} ${c.red}${change}${c.reset}`);
    }
    lines.push("");
  }

  // Side Effects (affected dependents)
  if (report.sideEffects.length > 0) {
    lines.push(`  ${c.bold}Side Effects${c.reset}`);
    for (const dep of report.sideEffects) {
      const color = dep.status === "likely-broken" ? c.red : c.yellow;
      const icon = dep.status === "likely-broken" ? "!" : "?";
      lines.push(`    ${color}${icon}${c.reset} ${dep.filePath}`);
      lines.push(`      ${c.dim}${dep.reason}${c.reset}`);
      if (dep.brokenSymbols.length > 0) {
        lines.push(`      ${c.dim}Broken imports: ${dep.brokenSymbols.join(", ")}${c.reset}`);
      }
    }
    lines.push("");
  }

  // Affected Tests
  const brokenTests = report.affectedTests.filter((t) => t.status !== "ok");
  if (brokenTests.length > 0) {
    lines.push(`  ${c.bold}Test Impact${c.reset}`);
    for (const test of brokenTests) {
      const color = test.status === "likely-broken" ? c.red : c.yellow;
      const icon = test.status === "likely-broken" ? "!" : "?";
      lines.push(`    ${color}${icon}${c.reset} ${test.filePath}`);
      lines.push(`      ${c.dim}${test.reason}${c.reset}`);
    }
    lines.push("");
  }

  // Dependency Changes
  if (report.dependencyChanges.length > 0) {
    lines.push(`  ${c.bold}Dependencies${c.reset}`);
    for (const dep of report.dependencyChanges) {
      let icon: string;
      let color: string;
      switch (dep.changeType) {
        case "added":
          icon = "+"; color = c.green;
          lines.push(`    ${color}${icon}${c.reset} ${dep.name} ${c.dim}${dep.newVersion}${c.reset}`);
          break;
        case "removed":
          icon = "-"; color = c.red;
          lines.push(`    ${color}${icon}${c.reset} ${dep.name} ${c.dim}${dep.oldVersion}${c.reset}`);
          break;
        case "upgraded":
          icon = "^"; color = c.cyan;
          lines.push(`    ${color}${icon}${c.reset} ${dep.name} ${c.dim}${dep.oldVersion} -> ${dep.newVersion}${c.reset}`);
          break;
        case "downgraded":
          icon = "v"; color = c.yellow;
          lines.push(`    ${color}${icon}${c.reset} ${dep.name} ${c.dim}${dep.oldVersion} -> ${dep.newVersion}${c.reset}`);
          break;
      }
    }
    lines.push("");
  }

  // Risk Assessment
  const riskColor = RISK_COLORS[report.risk.level];
  const riskIcon = RISK_ICONS[report.risk.level];
  lines.push(`  ${c.dim}${HR}${c.reset}`);
  lines.push(`  ${c.bold}Risk: ${riskColor}${riskIcon} ${report.risk.level}${c.reset} ${c.dim}(score: ${report.risk.score})${c.reset}`);
  if (report.risk.reasons.length > 0) {
    const topReasons = report.risk.reasons.slice(0, 5);
    for (const reason of topReasons) {
      lines.push(`    ${c.dim}- ${reason}${c.reset}`);
    }
    if (report.risk.reasons.length > 5) {
      lines.push(`    ${c.dim}... and ${report.risk.reasons.length - 5} more${c.reset}`);
    }
  }
  lines.push("");

  return lines.join("\n");
}
