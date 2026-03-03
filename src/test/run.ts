#!/usr/bin/env node

/**
 * Lightweight test runner using Node's built-in assert module.
 * Zero dependencies.
 */

import { testDiffParser } from "./diff-parser.test";
import { testCategorizer } from "./categorizer.test";
import { testRiskScorer } from "./risk-scorer.test";
import { testCollector } from "./collector.test";

let passed = 0;
let failed = 0;
const failures: string[] = [];

export function test(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err: unknown) {
    failed++;
    const msg = err instanceof Error ? err.message : String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`  FAIL  ${name}`);
    console.log(`        ${msg}`);
  }
}

console.log("\nVibeDiff Tests\n");

console.log("diff-parser:");
testDiffParser(test);

console.log("\ncategorizer:");
testCategorizer(test);

console.log("\nrisk-scorer:");
testRiskScorer(test);

console.log("\ncollector:");
testCollector(test);

console.log(`\n${passed + failed} tests, ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log("Failures:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}
