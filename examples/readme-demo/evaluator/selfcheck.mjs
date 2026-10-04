import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Oracle fixtures only, never model output or benchmark results.
const evaluator = dirname(fileURLToPath(import.meta.url));
const baseline = resolve(evaluator, "../fixture");
const root = mkdtempSync(join(tmpdir(), "contextos-demo-oracle-"));
const source = readFileSync(join(baseline, "src/order.ts"), "utf8");
function evaluate(name, replacement, addRegression = false) {
  const project = join(root, name);
  cpSync(baseline, project, { recursive: true });
  if (replacement) writeFileSync(join(project, "src/order.ts"), source.replace("item.trim()", replacement));
  if (addRegression) {
    const path = join(project, "test/order.test.mjs");
    writeFileSync(path, readFileSync(path, "utf8") + '\ntest("regression: internal ordinary spaces", () => { assert.equal(createOrder("Green   Tea", 2).item, "Green Tea"); });\n');
  }
  const out = join(root, `${name}-evaluation`);
  const result = spawnSync(process.execPath, [join(evaluator, "evaluate.mjs"), "--project", project, "--baseline", baseline, "--out", out], { encoding: "utf8", windowsHide: true, timeout: 30000 });
  writeFileSync(join(root, `${name}.stdout.txt`), result.stdout || "");
  writeFileSync(join(root, `${name}.stderr.txt`), result.stderr || "");
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(readFileSync(join(out, "evaluation.json"), "utf8"));
}
const unchanged = evaluate("unchanged", null);
assert.deepEqual(unchanged.independent.summary, { task: { passed: 0, total: 3 }, preservation: { passed: 7, total: 7 }, team: { passed: 1, total: 5 } });
assert.equal(unchanged.agentTests.usefulRegression, false);
const correct = evaluate("correct", 'item.trim().replace(/ {2,}/g, " ")', true);
assert.deepEqual(correct.independent.summary, { task: { passed: 3, total: 3 }, preservation: { passed: 7, total: 7 }, team: { passed: 5, total: 5 } });
assert.equal(correct.agentTests.usefulRegression, true);
assert.equal(correct.agentTests.variants.find((variant) => variant.id === "broad-whitespace").detectedByAssertion, false);
const broad = evaluate("broad-whitespace", 'item.trim().replace(/\\s+/g, " ")', true);
assert.deepEqual(broad.independent.summary, { task: { passed: 3, total: 3 }, preservation: { passed: 7, total: 7 }, team: { passed: 3, total: 5 } });
assert.equal(broad.agentTests.usefulRegression, true);
console.log(JSON.stringify({ selfcheck: "PASS", oracleFixtures: 3, directory: root }, null, 2));
