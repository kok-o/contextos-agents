import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cases } from "./cases.mjs";

const [project, baseline, output] = process.argv.slice(2);
if (!project || !baseline || !output) throw new Error("Usage: run-cases.mjs PROJECT BASELINE OUTPUT");
let context;
let loadError;
try {
  const module = await import(pathToFileURL(resolve(project, "src/order.ts")).href);
  context = {
    createOrder: module.createOrder,
    source: readFileSync(resolve(project, "src/order.ts"), "utf8"),
    baselineSource: readFileSync(resolve(baseline, "src/order.ts"), "utf8"),
  };
} catch (error) {
  loadError = String(error.stack || error);
}
const results = cases.map(([category, id, description, check]) => {
  try {
    if (loadError) throw new Error(loadError);
    check(context);
    return { category, id, description, passed: true };
  } catch (error) {
    return { category, id, description, passed: false, error: String(error.stack || error) };
  }
});
const summary = Object.fromEntries(["task", "preservation", "team"].map((category) => {
  const selected = results.filter((result) => result.category === category);
  return [category, { passed: selected.filter((result) => result.passed).length, total: selected.length }];
}));
writeFileSync(output, JSON.stringify({ loadError: loadError || null, summary, cases: results }, null, 2) + "\n");
console.log(JSON.stringify(summary));
process.exitCode = results.every((result) => result.passed) ? 0 : 1;
