'use strict';

// This file belongs to the trusted action checkout, not the consumer project.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const node = fs.realpathSync(process.execPath);

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function childEnvironment(home) {
  // An allowlist deliberately excludes npm_config_*, NODE_OPTIONS/NODE_PATH,
  // proxies, custom certificate/config files, credentials and workspace PATH.
  const env = {};
  for (const key of ['SystemRoot', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL', 'NO_COLOR', 'GITHUB_STEP_SUMMARY']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, {
    PATH: path.dirname(node), HOME: home, USERPROFILE: home,
    TMP: home, TEMP: home, TMPDIR: home, CI: 'true',
  });
  return env;
}

function execute(entrypoint, args, options) {
  const result = spawnSync(node, [entrypoint, ...args], {
    ...options, shell: false, stdio: 'inherit', timeout: 300_000,
  });
  if (result.error) throw result.error;
  if (result.signal || result.status === null) throw new Error(`Runner terminated: ${result.signal || 'unknown status'}`);
  return result.status;
}

function run() {
  const env = process.env;
  if (!['true', 'false'].includes(env.CONTEXTOS_REQUIRE_SECRETS) || !['true', 'false'].includes(env.CONTEXTOS_SKIP_SECRETS)) {
    throw new Error('Secret scanning inputs must be true or false');
  }
  if (env.CONTEXTOS_REQUIRE_SECRETS === 'true' || env.CONTEXTOS_SKIP_SECRETS === 'false') {
    throw new Error('[SECRETS_SCANNER_NOT_CONFIGURED] Secret scanning is not_configured. Use a dedicated secrets scanner.');
  }
  const version = env.CONTEXTOS_VERSION;
  // No dist-tags, ranges, URLs, paths or npm option injection. Exact SemVer only.
  const numeric = '(?:0|[1-9][0-9]*)';
  const identifier = '(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)';
  const semver = new RegExp(`^${numeric}\\.${numeric}\\.${numeric}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$`);
  if (version !== 'local' && !semver.test(version)) throw new Error('version must be an exact SemVer or local');

  const args = ['gate', '--project', env.CONTEXTOS_PROJECT, '--target', env.CONTEXTOS_ADAPTERS, '--github-annotations'];
  if (env.CONTEXTOS_PROFILE) args.push('--profile', env.CONTEXTOS_PROFILE);
  const workspace = fs.realpathSync(process.cwd());
  const temp = fs.realpathSync(env.RUNNER_TEMP);
  const roots = [workspace];
  for (const root of [env.GITHUB_WORKSPACE, env.CONTEXTOS_PROJECT]) {
    if (root && fs.existsSync(root)) roots.push(fs.realpathSync(root));
  }
  if (roots.some(root => isWithin(root, temp))) throw new Error('RUNNER_TEMP must be outside the consumer workspace');

  const isolated = fs.mkdtempSync(path.join(temp, 'contextos-gate-'));
  try {
    const cleanEnv = childEnvironment(isolated);
    let entrypoint;
    if (version === 'local') {
      // Explicit opt-in to the action checkout; never resolve relative to cwd.
      entrypoint = fs.realpathSync(path.resolve(__dirname, '../../../bin/index.js'));
    } else {
      const npmCli = fs.realpathSync(path.resolve(path.dirname(node), process.platform === 'win32'
        ? 'node_modules/npm/bin/npm-cli.js' : '../lib/node_modules/npm/bin/npm-cli.js'));
      const userConfig = path.join(isolated, 'user.npmrc');
      const globalConfig = path.join(isolated, 'global.npmrc');
      fs.writeFileSync(userConfig, '');
      fs.writeFileSync(globalConfig, '');
      fs.writeFileSync(path.join(isolated, 'package.json'), '{"private":true}');
      const registry = new URL(env.CONTEXTOS_REGISTRY);
      if (registry.protocol !== 'https:' && !(registry.protocol === 'http:' && registry.hostname === '127.0.0.1')) {
        throw new Error('Registry must use HTTPS');
      }
      const installCode = execute(npmCli, [
        'install', `contextos-agents@${version}`, '--prefix', isolated,
        '--registry', registry.href, '--userconfig', userConfig, '--globalconfig', globalConfig,
        '--cache', path.join(isolated, 'cache'), '--ignore-scripts', '--no-audit', '--no-fund',
        '--no-package-lock', '--bin-links=false', '--workspaces=false', '--loglevel=error',
      ], { cwd: isolated, env: cleanEnv });
      if (installCode !== 0) throw new Error(`Pinned package installation failed (exit ${installCode})`);
      const packageRoot = path.join(isolated, 'node_modules/contextos-agents');
      const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
      if (manifest.name !== 'contextos-agents' || manifest.version !== version) throw new Error('Installed package identity does not match the exact pin');
      entrypoint = fs.realpathSync(path.join(packageRoot, 'bin/index.js'));
      if (!isWithin(fs.realpathSync(packageRoot), entrypoint)) throw new Error('Installed entrypoint escapes its package');
    }
    return execute(entrypoint, args, { cwd: workspace, env: cleanEnv });
  } finally {
    fs.rmSync(isolated, { recursive: true, force: true });
  }
}

let code = 2;
try {
  code = run();
} catch (error) {
  // Escape Actions command data so an invalid input cannot inject annotations.
  const message = String(error.message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  console.error(`::error::[CONTEXTOS_GATE_BOOTSTRAP] ${message}`);
}
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `status=${code === 0 ? 'pass' : code === 1 ? 'drift' : 'error'}\ncode=${code}\n`);
}
process.exitCode = code;
