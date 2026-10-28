'use strict';

// One-off recovery of the accepted v3.0.0 archive, never a new release selector.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const RECOVERY = Object.freeze({
  repository: 'kok-o/contextos-agents',
  repositoryId: 1297199126,
  workflowId: 311861436,
  tag: 'v3.0.0',
  sourceSha: '0ad9eeb7bf3bbe5d6c863fdf991c1f164edfc56f',
  archiveSha256: '72840e7e40e0e13373a91470c9b6943d6866566bb9152236d107e5aad559dbfd',
  runId: 40746599298,
  attempt: 1,
  artifactId: 12841148594,
  artifactName: 'core-stable-archive-attempt-1',
  zipSha256: '7f1204d4d2b8c3531d76a904777c7420d8080d9017ed39e532d705603272646e',
});
const OS = ['ubuntu-latest', 'windows-latest', 'macos-latest'];
const JOB_NAMES = Object.freeze(['prepare', ...OS.flatMap(os => ['22', '24'].map(node => `Core stable acceptance (${os}, Node ${node})`))]);
const PREPARE_STEPS = ['Run npm ci --ignore-scripts', 'Run npm run build', 'Run git diff --exit-code',
  'Pack the reviewed core archive once', 'Run actions/upload-artifact@v4'];
const VERIFY_STEP = 'Run node scripts/publish-release.cjs verify core-stable';
const CONSUMER_STEP = 'Run npm run check:consumer:core -- scratch/release-candidate';
const MIGRATION_STEP = 'Verify 2.x upgrade and checkpoint rollback';
const ACCEPTANCE_STEPS = ['Run npm ci --ignore-scripts', 'Run npm run build', 'Run git diff --exit-code',
  'Run npm run validate', 'Run npm run validate:catalog', 'Run npm run check:secrets:core',
  'Run npm run test:core', 'Run node --test tests/release-publish.test.js', 'Run npm run test:skills',
  'Run npm run lint:md',
  'Run npx markdownlint docs/PRODUCT_BOUNDARIES.md docs/ARCHITECTURE.md docs/RELEASE_PROCESS.md docs/RELEASE_3.0.0-rc.1.md --config .markdownlint.json',
  'Run node .agents/ctx.js export all --check --json', 'Run npm run check:release-surface:core',
  CONSUMER_STEP, MIGRATION_STEP];
const MAX_BYTES = 10 * 1024 * 1024;

function requireProof(condition, message) {
  if (!condition) throw new Error(`Core release recovery refused: ${message}`);
}

function successfulSteps(job, expected) {
  requireProof(Array.isArray(job.steps), 'missing mandatory step evidence');
  const numbers = job.steps.map(step => step.number);
  requireProof(numbers.every(number => Number.isInteger(number) && number > 0) && new Set(numbers).size === numbers.length,
    'invalid or duplicate step numbers');
  for (const name of expected) {
    const steps = job.steps.filter(step => step.name === name);
    requireProof(steps.length === 1 && steps[0].status === 'completed' && steps[0].conclusion === 'success',
      `mandatory step did not succeed: ${name}`);
  }
  if (job.name !== 'prepare') {
    const verify = job.steps.filter(step => step.name === VERIFY_STEP).sort((a, b) => a.number - b.number);
    const consumer = job.steps.find(step => step.name === CONSUMER_STEP);
    const migration = job.steps.find(step => step.name === MIGRATION_STEP);
    requireProof(verify.length === 2 && verify.every(step => step.status === 'completed' && step.conclusion === 'success') &&
      verify[0].number < consumer.number && consumer.number < migration.number && migration.number < verify[1].number,
    'archive verification must surround consumer and migration acceptance');
  }
}

function validateRecoveryEvidence({ repository, ref, eventName, sourceSha, tagSha, identity, run, jobs, artifact }) {
  requireProof(repository === RECOVERY.repository && ref === 'refs/heads/main' && eventName === 'workflow_dispatch',
    'only a same-repository main workflow_dispatch may recover publication');
  requireProof(sourceSha === RECOVERY.sourceSha && tagSha === RECOVERY.sourceSha, 'original source or immutable tag differs');
  requireProof(identity?.kind === 'core-stable' && identity.name === 'contextos-agents' && identity.version === '3.0.0' &&
    identity.file === 'contextos-agents-3.0.0.tgz' && identity.sha256 === RECOVERY.archiveSha256, 'original reviewed identity differs');
  requireProof(run?.id === RECOVERY.runId && run.run_attempt === RECOVERY.attempt && run.workflow_id === RECOVERY.workflowId &&
    run.path === '.github/workflows/publish.yml' && run.event === 'release' && run.head_branch === RECOVERY.tag &&
    run.head_sha === RECOVERY.sourceSha && run.status === 'completed' && run.conclusion === 'failure', 'original release run differs or is incomplete');
  for (const repo of [run.repository, run.head_repository]) {
    requireProof(repo?.id === RECOVERY.repositoryId && repo.full_name === RECOVERY.repository, 'original run repository or fork differs');
  }
  requireProof(Array.isArray(jobs) && jobs.length > 0 && jobs.every(job => Number.isSafeInteger(job.id) && job.id > 0) &&
    new Set(jobs.map(job => job.id)).size === jobs.length,
    'missing or duplicate job evidence');
  for (const name of JOB_NAMES) {
    const matches = jobs.filter(job => job.name === name);
    requireProof(matches.length === 1, `missing or duplicate mandatory job: ${name}`);
    const job = matches[0];
    requireProof(job.run_id === RECOVERY.runId && job.run_attempt === RECOVERY.attempt && job.head_sha === RECOVERY.sourceSha &&
      job.status === 'completed' && job.conclusion === 'success', `mandatory job did not succeed for the original attempt: ${name}`);
    successfulSteps(job, name === 'prepare' ? PREPARE_STEPS : ACCEPTANCE_STEPS);
  }
  requireProof(artifact?.id === RECOVERY.artifactId && artifact.name === RECOVERY.artifactName && artifact.expired === false &&
    artifact.digest === `sha256:${RECOVERY.zipSha256}`, 'accepted artifact identity, lifetime or ZIP digest differs');
  requireProof(artifact.workflow_run?.id === RECOVERY.runId && artifact.workflow_run.head_sha === RECOVERY.sourceSha &&
    artifact.workflow_run.repository_id === RECOVERY.repositoryId && artifact.workflow_run.head_repository_id === RECOVERY.repositoryId &&
    artifact.workflow_run.head_branch === RECOVERY.tag, 'accepted artifact run or repository differs');
  return { result: 'PASS', tag: RECOVERY.tag, sourceSha, runId: RECOVERY.runId, attempt: RECOVERY.attempt,
    verifiedJobs: JOB_NAMES.length, artifactId: RECOVERY.artifactId, artifactName: RECOVERY.artifactName,
    zipSha256: RECOVERY.zipSha256, archiveSha256: RECOVERY.archiveSha256 };
}

async function boundedBytes(response) {
  const length = response.headers.get('content-length');
  requireProof(length === null || (/^\d+$/.test(length) && Number(length) <= MAX_BYTES), 'response exceeds size limit');
  requireProof(response.body, 'response body is missing');
  const chunks = []; let size = 0;
  for await (const data of response.body) {
    const chunk = Buffer.from(data); size += chunk.length;
    requireProof(size <= MAX_BYTES, 'response exceeds size limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function apiHeaders(token) {
  requireProof(typeof token === 'string' && token.length > 0, 'read-only GitHub token is unavailable');
  return { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
}

async function apiJson(route, token, fetcher) {
  let response;
  try {
    response = await fetcher(`https://api.github.com/repos/${RECOVERY.repository}/${route}`, {
      headers: apiHeaders(token), redirect: 'error', signal: AbortSignal.timeout(30000),
    });
  } catch { throw new Error('Core release recovery refused: GitHub API request failed'); }
  requireProof(response.status === 200, `GitHub API returned HTTP ${response.status}`);
  const bytes = await boundedBytes(response);
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Core release recovery refused: invalid GitHub API JSON'); }
}

async function paginated(route, field, token, fetcher) {
  const items = []; let total;
  for (let page = 1; page <= 10; page++) {
    const data = await apiJson(`${route}?per_page=100&page=${page}`, token, fetcher);
    requireProof(Number.isInteger(data.total_count) && data.total_count >= 0 && data.total_count <= 1000 &&
      (total === undefined || data.total_count === total) && Array.isArray(data[field]), 'incomplete or changing API pagination');
    total = data.total_count;
    items.push(...data[field]);
    requireProof(items.length <= total, 'duplicate or inconsistent API pages');
    if (items.length === total) return items;
    requireProof(data[field].length > 0, 'truncated API pagination');
  }
  throw new Error('Core release recovery refused: API pagination exceeds limit');
}

async function fetchRecoveryEvidence(token, fetcher = fetch) {
  const run = await apiJson(`actions/runs/${RECOVERY.runId}`, token, fetcher);
  const jobs = await paginated(`actions/runs/${RECOVERY.runId}/attempts/${RECOVERY.attempt}/jobs`, 'jobs', token, fetcher);
  const artifacts = await paginated(`actions/runs/${RECOVERY.runId}/artifacts`, 'artifacts', token, fetcher);
  const accepted = artifacts.filter(artifact => artifact.id === RECOVERY.artifactId || artifact.name === RECOVERY.artifactName);
  requireProof(accepted.length === 1, 'accepted artifact is missing or ambiguous');
  let object = (await apiJson(`git/ref/tags/${RECOVERY.tag}`, token, fetcher)).object;
  for (let depth = 0; object?.type === 'tag' && depth < 4; depth++) {
    requireProof(/^[a-f0-9]{40}$/.test(object.sha), 'invalid annotated tag object');
    object = (await apiJson(`git/tags/${object.sha}`, token, fetcher)).object;
  }
  requireProof(object?.type === 'commit', 'tag does not resolve to a commit');
  return { run, jobs, artifact: accepted[0], tagSha: object.sha };
}

async function downloadRecoveryZip(token, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`https://api.github.com/repos/${RECOVERY.repository}/actions/artifacts/${RECOVERY.artifactId}/zip`, {
      headers: apiHeaders(token), redirect: 'manual', signal: AbortSignal.timeout(30000),
    });
    if (response.status === 302) {
      const url = new URL(response.headers.get('location'));
      requireProof(url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') &&
        /(?:\.blob\.core\.windows\.net|\.actions\.githubusercontent\.com|\.githubusercontent\.com)$/.test(url.hostname),
      'artifact redirect is not an approved signed HTTPS host');
      // GitHub credentials must never reach the signed storage redirect.
      response = await fetcher(url.href, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    }
  } catch { throw new Error('Core release recovery refused: artifact download request failed'); }
  requireProof(response.status === 200, `artifact download returned HTTP ${response.status}`);
  const bytes = await boundedBytes(response);
  requireProof(crypto.createHash('sha256').update(bytes).digest('hex') === RECOVERY.zipSha256, 'downloaded ZIP bytes differ from accepted artifact');
  return bytes;
}

async function main() {
  requireProof(process.argv.slice(2).every(arg => arg === '--download') && process.argv.length <= 3, 'only --download is supported');
  requireProof(process.env.GITHUB_REPOSITORY === RECOVERY.repository && process.env.GITHUB_REF === 'refs/heads/main' &&
    process.env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'only a same-repository main workflow_dispatch may recover publication');
  const sourceRoot = path.resolve('release-source');
  const git = args => execFileSync('git', ['-C', sourceRoot, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
  requireProof(fs.realpathSync(git(['rev-parse', '--show-toplevel'])) === fs.realpathSync(sourceRoot), 'original checkout root differs');
  const sourceSha = git(['rev-parse', 'HEAD']);
  requireProof(git(['status', '--porcelain', '--untracked-files=no']) === '', 'original source checkout has tracked modifications');
  const identity = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'docs/release-identities/core-stable-3.0.0.json'), 'utf8'));
  const evidence = await fetchRecoveryEvidence(process.env.GITHUB_TOKEN);
  const report = validateRecoveryEvidence({ ...evidence, identity, sourceSha,
    repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF, eventName: process.env.GITHUB_EVENT_NAME });
  const { resolveManagedPath } = require('../.agents/filesystem/safe-path.js');
  if (process.argv.includes('--download')) {
    const bytes = await downloadRecoveryZip(process.env.GITHUB_TOKEN);
    const destination = resolveManagedPath(process.cwd(), 'scratch/core-release-recovery.zip').resolvedPath;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
    report.downloadedZip = 'scratch/core-release-recovery.zip';
  }
  const evidencePath = resolveManagedPath(process.cwd(), 'scratch/core-release-recovery-evidence.json').resolvedPath;
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main().catch(error => {
  console.error(error.message.startsWith('Core release recovery refused:') ? error.message
    : 'Core release recovery verification failed; no artifact was accepted.');
  process.exitCode = 1;
});
module.exports = { RECOVERY, JOB_NAMES, validateRecoveryEvidence, fetchRecoveryEvidence, downloadRecoveryZip, main };
