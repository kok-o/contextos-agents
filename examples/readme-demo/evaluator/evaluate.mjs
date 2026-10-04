import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ownDir = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!args[i]?.startsWith("--") || !args[i + 1]) throw new Error("Expected --project PATH --baseline PATH [--initial PATH] --out PATH");
  options[args[i].slice(2)] = resolve(args[i + 1]);
}
for (const key of ["project", "baseline", "out"]) if (!options[key]) throw new Error(`Missing --${key}`);
options.initial ||= options.baseline;
function within(child, parent) {
  const rel = relative(parent, child);
  return !rel || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}
for (const key of ["project", "baseline", "initial"]) {
  if (within(options.out, options[key])) throw new Error(`Output must be outside --${key}`);
}
if (existsSync(options.out) && readdirSync(options.out).length) throw new Error("Output directory must be empty; preserve prior evaluations");
mkdirSync(options.out, { recursive: true });
const excluded = new Set([".git", "node_modules", ".agents", ".codex"]);
function files(root, prefix = "") {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (excluded.has(entry.name) || entry.isSymbolicLink()) return [];
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? files(join(root, entry.name), name) : [name];
  }).sort();
}
function digest(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function inventory(root) { return Object.fromEntries(files(root).map((name) => [name, digest(join(root, name))])); }
function json(path) { return JSON.parse(readFileSync(path, "utf8")); }
function save(path, data) { writeFileSync(path, JSON.stringify(data, null, 2) + "\n"); }
function snapshot(to) {
  cpSync(options.project, to, { recursive: true, filter: (from) => !lstatSync(from).isSymbolicLink() && !relative(options.project, from).split(sep).some((part) => excluded.has(part)) });
}
const commands = [];
function run(label, commandArgs, cwd, timeout = 15000) {
  const startedAt = new Date().toISOString();
  const start = process.hrtime.bigint();
  const result = spawnSync(process.execPath, commandArgs, { cwd, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  writeFileSync(join(options.out, `${label}.stdout.txt`), result.stdout || "");
  writeFileSync(join(options.out, `${label}.stderr.txt`), result.stderr || "");
  const record = {
    label, command: [process.execPath, ...commandArgs], cwd, startedAt,
    finishedAt: new Date().toISOString(), elapsedMs, exitCode: result.status,
    signal: result.signal, error: result.error ? String(result.error) : null,
    timedOut: result.error?.code === "ETIMEDOUT",
    stdout: `${label}.stdout.txt`, stderr: `${label}.stderr.txt`,
  };
  commands.push(record);
  return { ...record, text: (result.stdout || "") + (result.stderr || "") };
}
const initialInventory = inventory(options.initial);
const finalInventory = inventory(options.project);
const changedFiles = [...new Set([...Object.keys(initialInventory), ...Object.keys(finalInventory)])].sort().filter((name) => initialInventory[name] !== finalInventory[name]);
const isTest = (name) => /(^|\/)(test|tests)\//.test(name) && /\.(test|spec)\.(mjs|cjs|js|ts|mts|cts)$/.test(name);
const testFiles = Object.keys(finalInventory).filter(isTest);
const changedTests = changedFiles.filter(isTest);
const finalCopy = join(options.out, "final-project");
snapshot(finalCopy);
const casesPath = join(options.out, "independent-cases.json");
const independentCommand = run("independent-cases", ["--experimental-strip-types", join(ownDir, "run-cases.mjs"), finalCopy, options.baseline, casesPath], finalCopy, 10000);
const independent = existsSync(casesPath) ? json(casesPath) : { loadError: independentCommand.error || "Independent worker did not produce results", summary: null, cases: [] };
function runTests(label, project) {
  if (!testFiles.length) return { label, exitCode: null, error: "No discoverable tests", assertionsFailed: false, skipped: true };
  const result = run(label, ["--experimental-strip-types", "--test", "--test-reporter=tap", ...testFiles], project);
  const { text, ...record } = result;
  return { ...record, assertionsFailed: /ERR_ASSERTION/.test(text), tests: Number(text.match(/^# tests (\d+)$/m)?.[1] || 0), failures: Number(text.match(/^# fail (\d+)$/m)?.[1] || 0) };
}
const agentTests = { changedFiles: changedTests, discoveredFiles: testFiles, final: runTests("agent-tests-final", finalCopy), variants: [] };
function knownImplementation(normalization, validation = true) {
  return `export function createOrder(item: string, quantity: number): { item: string; quantity: number } {\n  const normalizedItem = ${normalization};\n  if (!normalizedItem) throw new Error("Item is required");\n${validation ? '  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive integer");\n' : ""}  return { item: normalizedItem, quantity };\n}\n`;
}
const variants = [
  ["baseline", readFileSync(join(options.baseline, "src/order.ts"), "utf8"), "Original implementation; tests should detect the requested change"],
  ["broad-whitespace", knownImplementation('item.trim().replace(/\\s+/g, " ")'), "Wrongly collapses interior tabs and nonbreaking spaces"],
  ["lowercase", knownImplementation('item.trim().replace(/ {2,}/g, " ").toLowerCase()'), "Wrongly lowercases names"],
  ["quantity-validation-removed", knownImplementation('item.trim().replace(/ {2,}/g, " ")', false), "Wrongly accepts invalid quantities"],
];
for (const [id, source, description] of variants) {
  const variantCopy = join(options.out, `variant-${id}`);
  snapshot(variantCopy);
  mkdirSync(join(variantCopy, "src"), { recursive: true });
  writeFileSync(join(variantCopy, "src/order.ts"), source);
  const result = runTests(`agent-tests-${id}`, variantCopy);
  agentTests.variants.push({ id, description, ...result, detectedByAssertion: agentTests.final.exitCode === 0 && result.exitCode !== 0 && result.assertionsFailed === true && !result.timedOut });
}
agentTests.usefulRegression = changedTests.length > 0 && agentTests.final.exitCode === 0 && agentTests.variants.find((variant) => variant.id === "baseline").detectedByAssertion;
const initialPackage = json(join(options.initial, "package.json"));
let finalPackage = {};
let packageError = null;
try { finalPackage = json(join(options.project, "package.json")); }
catch (error) { packageError = String(error); }
const dependencyChanges = [];
for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  const before = initialPackage[field] || {};
  const after = finalPackage[field] || {};
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (before[name] !== after[name]) dependencyChanges.push({ field, name, before: before[name] ?? null, after: after[name] ?? null });
  }
}
const report = {
  schemaVersion: 1,
  evaluatedAt: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  paths: options,
  provenance: { initialInventory, finalInventory, baselineSourceSha256: digest(join(options.baseline, "src/order.ts")), evaluatorInventory: inventory(ownDir) },
  independent,
  agentTests,
  scope: {
    changedFiles,
    outsideRequestedSourceAndTests: changedFiles.filter((name) => name !== "src/order.ts" && !isTest(name)),
    dependencyChanges,
    packageError,
    addedDependencies: dependencyChanges.filter((change) => change.before === null && change.after !== null),
    packageTestScriptBefore: initialPackage.scripts?.test ?? null,
    packageTestScriptAfter: finalPackage.scripts?.test ?? null,
    manualReviewRequired: ["Review the source diff for unrelated changes, network/database effects, and static TypeScript API preservation", "Client instruction loading and client test execution require separate event evidence"],
  },
  commands,
};
save(join(options.out, "evaluation.json"), report);
console.log(JSON.stringify({ independent: independent.summary, usefulRegression: agentTests.usefulRegression, dependenciesAdded: report.scope.addedDependencies.length, changedFiles }, null, 2));
// A successfully completed evaluation may report a failing candidate.
process.exitCode = independent.summary ? 0 : 2;
