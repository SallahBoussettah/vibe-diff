import { SemanticReport } from "../types";

export function formatMarkdown(report: SemanticReport): string {
  const lines: string[] = [];

  lines.push("# Vibe Diff Report");
  lines.push("");
  lines.push(`**${report.filesChanged} files** changed | **+${report.linesAdded}** added | **-${report.linesRemoved}** removed`);
  lines.push("");

  if (report.filesChanged === 0) {
    lines.push("No changes detected.");
    return lines.join("\n");
  }

  // Files
  lines.push("## Files Changed");
  lines.push("");
  for (const analysis of report.fileAnalyses) {
    const badge = analysis.editType === "create" ? " (new)" :
                  analysis.editType === "delete" ? " (deleted)" : "";
    lines.push(`- \`${analysis.filePath}\`${badge}`);
  }
  lines.push("");

  // Behavior Changes
  if (report.behaviorChanges.length > 0) {
    lines.push("## Behavior Changes");
    lines.push("");
    for (const change of report.behaviorChanges) {
      if (change.startsWith("WARNING:")) {
        lines.push(`- :warning: ${change}`);
      } else {
        lines.push(`- ${change}`);
      }
    }
    lines.push("");
  }

  // API Changes
  if (report.apiChanges.length > 0) {
    lines.push("## API Changes");
    lines.push("");
    for (const change of report.apiChanges) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  // Breaking Changes
  if (report.breakingChanges.length > 0) {
    lines.push("## Breaking Changes");
    lines.push("");
    for (const change of report.breakingChanges) {
      lines.push(`- :x: ${change}`);
    }
    lines.push("");
  }

  // Side Effects
  if (report.sideEffects.length > 0) {
    lines.push("## Side Effects");
    lines.push("");
    for (const dep of report.sideEffects) {
      const icon = dep.status === "likely-broken" ? ":x:" : ":warning:";
      lines.push(`- ${icon} **${dep.filePath}** — ${dep.reason}`);
    }
    lines.push("");
  }

  // Test Impact
  const brokenTests = report.affectedTests.filter((t) => t.status !== "ok");
  if (brokenTests.length > 0) {
    lines.push("## Test Impact");
    lines.push("");
    for (const test of brokenTests) {
      const icon = test.status === "likely-broken" ? ":x:" : ":warning:";
      lines.push(`- ${icon} \`${test.filePath}\` — ${test.reason}`);
    }
    lines.push("");
  }

  // Dependencies
  if (report.dependencyChanges.length > 0) {
    lines.push("## Dependency Changes");
    lines.push("");
    for (const dep of report.dependencyChanges) {
      switch (dep.changeType) {
        case "added":
          lines.push(`- :heavy_plus_sign: **${dep.name}** ${dep.newVersion}`);
          break;
        case "removed":
          lines.push(`- :heavy_minus_sign: **${dep.name}** ${dep.oldVersion}`);
          break;
        case "upgraded":
          lines.push(`- :arrow_up: **${dep.name}** ${dep.oldVersion} → ${dep.newVersion}`);
          break;
        case "downgraded":
          lines.push(`- :arrow_down: **${dep.name}** ${dep.oldVersion} → ${dep.newVersion}`);
          break;
      }
    }
    lines.push("");
  }

  // Risk
  lines.push("## Risk Assessment");
  lines.push("");
  lines.push(`**${report.risk.level}** (score: ${report.risk.score})`);
  lines.push("");
  if (report.risk.reasons.length > 0) {
    for (const reason of report.risk.reasons) {
      lines.push(`- ${reason}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatCommitMessage(report: SemanticReport): string {
  if (report.filesChanged === 0) return "";

  const parts: string[] = [];

  // Summary line from behavior changes
  const meaningful = report.behaviorChanges.filter(
    (c) => !c.startsWith("WARNING:") && !c.includes("New file created")
  );

  if (meaningful.length > 0) {
    parts.push(meaningful[0].replace(/^\[.*?\]\s*/, ""));
  } else if (report.apiChanges.length > 0) {
    parts.push(report.apiChanges[0]);
  } else {
    parts.push(`Update ${report.filesChanged} file(s)`);
  }

  // Body with details
  if (report.behaviorChanges.length > 1 || report.apiChanges.length > 0) {
    parts.push("");
    const details = [...report.behaviorChanges, ...report.apiChanges]
      .filter((c) => !c.startsWith("WARNING:"))
      .slice(0, 8);
    for (const detail of details) {
      parts.push(`- ${detail.replace(/^\[.*?\]\s*/, "")}`);
    }
  }

  if (report.breakingChanges.length > 0) {
    parts.push("");
    parts.push("BREAKING CHANGES:");
    for (const bc of report.breakingChanges) {
      parts.push(`- ${bc}`);
    }
  }

  return parts.join("\n");
}

export function formatPRDescription(report: SemanticReport): string {
  const lines: string[] = [];

  lines.push("## Summary");
  lines.push("");

  if (report.behaviorChanges.length > 0) {
    for (const change of report.behaviorChanges.slice(0, 5)) {
      lines.push(`- ${change.replace(/^\[.*?\]\s*/, "")}`);
    }
  }

  if (report.breakingChanges.length > 0) {
    lines.push("");
    lines.push("## Breaking Changes");
    lines.push("");
    for (const bc of report.breakingChanges) {
      lines.push(`- ${bc}`);
    }
  }

  if (report.dependencyChanges.length > 0) {
    lines.push("");
    lines.push("## Dependencies");
    lines.push("");
    for (const dep of report.dependencyChanges) {
      lines.push(`- **${dep.name}**: ${dep.changeType}${dep.newVersion ? ` (${dep.newVersion})` : ""}`);
    }
  }

  lines.push("");
  lines.push(`Risk: **${report.risk.level}** | ${report.filesChanged} files | +${report.linesAdded} -${report.linesRemoved}`);

  return lines.join("\n");
}
