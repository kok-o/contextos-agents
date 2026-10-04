'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { parseEnv } = require('node:util');
const { BLOCKED_EXACT_NAMES, BLOCKED_EXTENSIONS } = require('../bin/lib/scan');
const root = path.resolve(__dirname, '..');
const publicEvidence = new Set(['docs/evidence/ci-r2-accepted-2026-10-02.json', 'docs/evidence/release-2.3.json', 'docs/evidence/release-2.3.1.json']);
const internalDocs = /^(?:CONTEXTOS_WORK_PLAN\.md|IMPROVEMENT_PLAN\.md|docs\/(?:PERSONAL_WORKFLOW_ROADMAP|AUDIT_.+|INDEPENDENT_REVIEW_.+|IMPLEMENTATION_STATUS_.+|STABILIZATION_.+|RELEASE_ACCEPTANCE_.+|API_BENCHMARK_.+|LUNA_BENCHMARK_.+|SOL_BENCHMARK_.+)\.md)$/;

function privateFile(file) {
  return file.split('/').some(part => (/^\.env(?:\.|$)/i.test(part) && part !== '.env.example') || BLOCKED_EXACT_NAMES.has(part.toLowerCase()))
    || BLOCKED_EXTENSIONS.has(path.extname(file).toLowerCase()) || /\.(?:log|tgz|zip|bak|tmp)$/i.test(file);
}
function validateGitPaths(files) {
  const localProbes = new Set(['benchmarks/analyze-sol.js', 'benchmarks/continue-sol-capped.js', 'benchmarks/run-sol-agent.js', 'benchmarks/sol-session-smoke.js', 'benchmarks/verify-sol-evidence.js', 'scripts/collect-r2-evidence.cjs']);
  return files.filter(file => privateFile(file) || internalDocs.test(file) || localProbes.has(file)
    || (file.startsWith('docs/evidence/') && !publicEvidence.has(file))
    || /^(?:scratch|\.external-skills|\.swarm-worktrees|\.contextos-worktrees|node_modules)\//.test(file));
}
function validatePackagePaths(files, kind) {
  const required = kind === 'core' ? ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'bin/index.js', '.agents/AGENTS.md', '.agents/resolver/canonical-resolver.js']
    : ['package.json', 'README.md', 'bin/mcp.mjs', 'dist/contextos/loader.js', 'dist/mcp/server.js'];
  const permitted = kind === 'core' ? /^(?:bin|catalog|\.agents)\// : /^(?:dist|bin)\//;
  const metadata = /^(?:package\.json|README(?:\.md)?|LICENSE(?:\..+)?|NOTICE|registry(?:\.v2)?(?:\.schema)?\.json)$/i;
  return [...files.filter(file => privateFile(file) || (!permitted.test(file) && !metadata.test(file))
    || /^\.agents\/(?:state|cache|transactions|project|mcp)\//.test(file)),
  ...required.filter(file => !files.includes(file)).map(file => `Missing required file: ${file}`)];
}
function checkLinks(files) {
  const selected = new Set(files);
  const docs = files.filter(file => /^(?:README|GUIDE|CONTRIBUTING|CHANGELOG)\.md$/.test(file) || /^docs\/.+\.md$/.test(file));
  const missing = [];
  for (const file of docs) {
    const markdown = fs.readFileSync(path.join(root, file), 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const match of markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = match[1].split(/\s+"/)[0].replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^(?:https?:|mailto:|app:|codex:|file:)/i.test(target)) continue;
      const resolved = path.relative(root, path.resolve(path.dirname(path.join(root, file)), decodeURI(target))).replace(/\\/g, '/');
      if (!selected.has(resolved) && !files.some(item => item.startsWith(`${resolved}/`))) missing.push(`${file}: ${target}`);
    }
  }
  return missing;
}
function checkTestInventory(projectRoot = root) {
  const read = file => fs.readFileSync(path.join(projectRoot, file), 'utf8');
  const listed = new Set(JSON.parse(read('package.json')).scripts.test.split(/\s+/).filter(token => token.startsWith('tests/')));
  const separate = 'tests/release-publish.test.js';
  const files = fs.readdirSync(path.join(projectRoot, 'tests')).filter(file => file.endsWith('.test.js')).map(file => `tests/${file}`);
  const violations = files.filter(file => !listed.has(file) && file !== separate).map(file => `Test not scheduled: ${file}`);
  for (const file of listed) if (!files.includes(file)) violations.push(`Scheduled test missing: ${file}`);
  const { parse } = require('yaml');
  for (const file of ['.github/workflows/validate-skills.yml', '.github/workflows/publish.yml']) {
    const jobs = Object.values(parse(read(file)).jobs);
    const runs = jobs.flatMap(job => job.steps || []).map(step => step.run || '');
    if (!runs.some(run => /^\s*node --test tests\/release-publish\.test\.js\s*$/m.test(run))) {
      violations.push(`${file}: separately scheduled ${separate} is missing`);
    }
  }
  return violations;
}
function checkPublicInstructions(projectRoot = root) {
  const read = file => fs.readFileSync(path.join(projectRoot, file), 'utf8');
  const { version } = JSON.parse(read('package.json'));
  const violations = [];
  for (const file of ['README.md', 'GUIDE.md', 'docs/PRODUCT_BOUNDARIES.md', 'docs/MIGRATION.md', 'contextos-mcp/README.md']) {
    if (/\bnpm(?:\.cmd)?\s+(?:install|i|add)\b[^\n]*@contextos\/mcp\b/.test(read(file))) {
      violations.push(`${file}: installs the historical @contextos/mcp package`);
    }
  }
  const { parse } = require('yaml');
  const action = parse(read('.github/actions/contextos-gate/action.yml'));
  if (action.inputs?.version?.default !== version) violations.push('Action inputs.version.default differs from the core package version');
  for (const file of ['README.md', 'docs/MIGRATION.md']) {
    const snippets = [...read(file).matchAll(/```ya?ml\r?\n([\s\S]*?)```/g)].map(match => parse(match[1]));
    const steps = snippets.flatMap(doc => Array.isArray(doc) ? doc : Object.values(doc?.jobs || {}).flatMap(job => job.steps || []));
    const gates = steps.filter(step => step.uses?.startsWith('kok-o/contextos-agents/.github/actions/contextos-gate@'));
    if (!gates.length || gates.some(step => step.uses !== `kok-o/contextos-agents/.github/actions/contextos-gate@v${version}` || step.with?.version !== version)) {
      violations.push(`${file}: gate example must pin the current tag and explicit CLI version`);
    }
  }
  return violations;
}
function main() {
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = [...new Set(git(['ls-files', '-z']).concat(git(['ls-files', '--others', '--exclude-standard', '-z'])))];
  const ignoredTracked = git(['ls-files', '-ci', '--exclude-standard', '-z']);
  const violations = [...validateGitPaths(files), ...ignoredTracked.map(file => `Ignored but still tracked: ${file}`), ...checkLinks(files),
    ...checkTestInventory(), ...checkPublicInstructions()];
  const core = require('../package.json'), mcp = require('../contextos-mcp/package.json');
  for (const [folder, pkg] of [['.', core], ['contextos-mcp', mcp]]) {
    const lock = JSON.parse(fs.readFileSync(path.join(root, folder, 'package-lock.json')));
    if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version) violations.push(`Version/lockfile mismatch: ${folder}`);
  }
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const secrets = ['.env', 'contextos-mcp/.env'].filter(file => fs.existsSync(path.join(root, file))).flatMap(file =>
    Object.entries(parseEnv(fs.readFileSync(path.join(root, file), 'utf8'))).filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(name) && value.length >= 16).map(([, value]) => Buffer.from(value)));
  const packages = [['core', '.'], ['mcp', 'contextos-mcp']].map(([kind, folder]) => {
    const packed = JSON.parse(execFileSync(process.execPath, [npm, 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: path.join(root, folder), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }))[0];
    const paths = packed.files.map(file => file.path);
    const metadata = JSON.parse(fs.readFileSync(path.join(root, folder, 'package.json')));
    if (metadata.main && !paths.includes(metadata.main.replace(/^\.\//, ''))) violations.push(`${kind}: declared main is missing`);
    for (const file of paths) {
      const data = fs.readFileSync(path.join(root, folder, file));
      if (secrets.some(secret => data.includes(secret))) violations.push(`${kind}: local credential copied into ${file}`);
    }
    violations.push(...validatePackagePaths(paths, kind).map(file => `${kind}: ${file}`));
    if (kind === 'core' && packed.unpackedSize > 2 * 1024 * 1024) violations.push('Core exceeds 2 MiB unpacked');
    return { kind, name: packed.name, version: packed.version, entries: paths.length, unpackedSize: packed.unpackedSize, files: paths };
  });
  const report = { result: violations.length ? 'FAIL' : 'PASS', gitFiles: files.length, packages, violations };
  fs.mkdirSync(path.join(root, 'scratch'), { recursive: true });
  fs.writeFileSync(path.join(root, 'scratch/release-surface.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ result: report.result, gitFiles: files.length, packages: packages.map(({ files, ...info }) => info), violations }, null, 2));
  if (violations.length) process.exitCode = 1;
}
if (require.main === module) main();
module.exports = { privateFile, validateGitPaths, validatePackagePaths, checkLinks, checkTestInventory, checkPublicInstructions };
