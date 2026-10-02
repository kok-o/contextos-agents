'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/evidence/r2-preparation-2026-10-02');
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const readJson = name => JSON.parse(fs.readFileSync(path.join(root, 'scratch', name), 'utf8'));
const consumer = readJson('release-install-result.json');
const migration = readJson('release-migration-result.json');
const mcp = readJson('r2-mcp-tests-verified.json');
const coreLog = fs.readFileSync(path.join(root, 'scratch/r2-core-tests-verified.log'), 'utf8');
assert.equal(consumer.result, 'PASS');
assert.equal(migration.result, 'PASS');
assert.equal(mcp.numFailedTests, 0);
assert.equal(mcp.numFailedTestSuites, 0);
assert.match(coreLog, /# fail 0\r?\n/);
assert.match(coreLog, /# cancelled 0\r?\n/);
const archives = consumer.archives.map(archive => {
  const file = path.join(root, 'scratch/r2-candidate-2026-10-02', archive.file);
  assert.equal(sha(fs.readFileSync(file)), archive.sha256);
  assert.ok(migration.archives.some(item => item.sha256 === archive.sha256), 'Migration used a different candidate');
  return { path: path.relative(root, file).replace(/\\/g, '/'), sha256: archive.sha256 };
});
const logs = ['r2-core-tests-verified.log', 'r2-mcp-tests-verified.log', 'r2-mcp-tests-verified.json',
  'r2-mcp-lint.log', 'r2-core-build-verified.log', 'r2-mcp-build.log', 'r2-core-pack.log', 'r2-mcp-pack.log',
  'r2-consumer-install.log', 'r2-migration-final.log', 'release-install-result.json', 'release-migration-result.json',
  'r2-catalog.log', 'r2-drift.json', 'r2-secrets.log'];
fs.mkdirSync(output, { recursive: true });
const evidenceFiles = logs.map(name => {
  const raw = fs.readFileSync(path.join(root, 'scratch', name), 'utf8');
  const data = raw.replace(/[A-Z]:\\\\Users\\\\[^\\\r\n"]+/g, '<USER_HOME>')
    .replace(/[A-Z]:\\Users\\[^\\\r\n"]+/g, '<USER_HOME>').replace(/\r\n/g, '\n');
  fs.writeFileSync(path.join(output, name), data);
  return { path: `docs/evidence/r2-preparation-2026-10-02/${name}`, sha256: sha(data) };
});
const sourceFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0')
  .filter(file => file && !file.startsWith('docs/evidence/') && fs.statSync(path.join(root, file)).isFile())
  .sort().map(file => ({ path: file, sha256: sha(fs.readFileSync(path.join(root, file))) }));
const pending = mcp.testResults.flatMap(suite => suite.assertionResults.filter(test => ['pending', 'skipped'].includes(test.status))
  .map(test => ({ file: path.relative(path.join(root, 'contextos-mcp'), suite.name).replace(/\\/g, '/'), name: test.fullName })));
assert.equal(pending.length, mcp.numPendingTests, 'Skip inventory must match test totals');
const result = {
  schemaVersion: 1, date: '2026-10-02', status: 'LOCAL_PREPARATION_PASS_REMOTE_CI_AND_PILOT_PENDING',
  baseRevision: git('rev-parse', 'HEAD'), sourceSnapshotSha256: sha(JSON.stringify(sourceFiles)), sourceFiles,
  node: process.version, platform: process.platform, archives, evidenceFiles,
  commands: ['npm test', 'npm --prefix contextos-mcp test -- --reporter=default --reporter=json',
    'npm --prefix contextos-mcp run lint', 'npm run build', 'npm --prefix contextos-mcp run build',
    'npm pack --ignore-scripts', 'npm run check:consumer -- scratch/r2-candidate-2026-10-02',
    'npm run check:migration -- scratch/r2-previous/contextos-agents-2.2.0.tgz scratch/r2-candidate-2026-10-02/contextos-agents-2.3.0.tgz'],
  checks: { core: { passed: Number(coreLog.match(/# pass (\d+)/)[1]), failed: 0, skipped: 0 },
    mcp: { passed: mcp.numPassedTests, failed: mcp.numFailedTests, skipped: mcp.numPendingTests, pending },
    consumer: consumer.result, migration: migration.result, restoredFiles: migration.configurationFilesRestored,
    remoteCI: 'PENDING', clientPilot: 'PENDING', publication: 'NOT_AUTHORIZED', benchmarks: 'PAUSED' },
};
fs.writeFileSync(path.join(root, 'docs/evidence/r2-preparation-2026-10-02.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, sourceSnapshotSha256: result.sourceSnapshotSha256, archives }, null, 2));
