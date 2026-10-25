'use strict';

/**
 * Test helper: an installed-package consumer project.
 *
 * The repository is packed once per test process and installed with npm into a
 * base project. Each scenario receives its own copy of that base project, so
 * scenarios exercise the shipped archive (never the checkout) and cannot
 * influence each other.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { packRepository, makeTempDir, runNpm } = require('./pack.js');

let baseProject = null;
const created = [];

function getBaseProject() {
  if (baseProject) return baseProject;
  const root = makeTempDir('ctx-scenario-base-');
  created.push(root);
  const archive = packRepository(path.join(root, 'archive'));
  const project = path.join(root, 'base');
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'consumer', version: '1.0.0', private: true }));
  const install = runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', archive], { cwd: project });
  if (install.status !== 0) throw new Error(`npm install failed: ${install.stdout}\n${install.stderr}`);
  baseProject = project;
  return project;
}

function git(project, args, options = {}) {
  return spawnSync('git', args, { cwd: project, encoding: 'utf8', ...options });
}

function cli(project, args, options = {}) {
  const bin = path.join(project, 'node_modules', 'contextos-agents', 'bin', 'index.js');
  const result = spawnSync(process.execPath, [bin, ...args], { cwd: project, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, ...options });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '', output: `${result.stdout || ''}${result.stderr || ''}` };
}

function newProject(options = {}) {
  const base = getBaseProject();
  const root = makeTempDir('ctx-scenario-');
  created.push(root);
  const project = path.join(root, 'app');
  fs.cpSync(base, project, { recursive: true });
  fs.writeFileSync(path.join(project, '.gitignore'), 'node_modules/\n');
  git(project, ['init', '-q', '-b', 'main']);
  git(project, ['config', 'user.email', 'test@contextos.dev']);
  git(project, ['config', 'user.name', 'Scenario Test']);
  git(project, ['config', 'core.autocrlf', options.autocrlf || 'false']);
  return project;
}

function commitAll(project, message) {
  git(project, ['add', '-A']);
  const result = git(project, ['commit', '-q', '-m', message]);
  if (result.status !== 0) throw new Error(`git commit failed: ${result.stdout}${result.stderr}`);
}

function writeRule(project, name, body, description = `Rules for ${name}.`) {
  const dir = path.join(project, '.agents', 'project', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n\n${body}\n`);
}

function checkStatus(project, target = 'all') {
  const result = cli(project, ['export', target, '--check', '--json']);
  let parsed = null;
  try { parsed = JSON.parse(result.stdout); } catch { /* reported through the status below */ }
  return { exit: result.status, status: parsed ? parsed.status : 'unparseable', report: parsed, raw: result.output };
}

function buildOutputs(project) {
  const compile = cli(project, ['compile']);
  if (compile.status !== 0) throw new Error(`compile failed: ${compile.output}`);
  const exported = cli(project, ['export', 'all']);
  if (exported.status !== 0) throw new Error(`export failed: ${exported.output}`);
}

function trackedFiles(project) {
  return git(project, ['ls-files']).stdout.split(/\r?\n/).filter(Boolean);
}

function cleanup() {
  for (const dir of created.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

module.exports = { newProject, cli, git, commitAll, writeRule, checkStatus, buildOutputs, trackedFiles, cleanup, os };
