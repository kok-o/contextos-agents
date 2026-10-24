'use strict';

/**
 * Installed-package scenarios for the team workflow that the product exists
 * for: shared rules, branches, merges, other checkouts and removal. Every test
 * runs the shipped archive in a throwaway project; none of them reads the
 * repository checkout.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  newProject, cli, git, commitAll, writeRule, checkStatus, buildOutputs, trackedFiles, cleanup,
} = require('./helpers/consumer.js');

after(cleanup);

const COPILOT = '.github/copilot-instructions.md';
const read = (project, rel) => fs.readFileSync(path.join(project, rel), 'utf8');
const exists = (project, rel) => fs.existsSync(path.join(project, rel));
const hasConflictMarkers = text => /^(<{7}|={7}|>{7})( |$)/m.test(text);
const unmergedFiles = project => git(project, ['diff', '--name-only', '--diff-filter=U']).stdout.split(/\r?\n/).filter(Boolean);

function initWithRule(project, name = 'team-auth', body = '- Never log authorization headers.') {
  const init = cli(project, ['init', '--skip-compile']);
  assert.equal(init.status, 0, init.output);
  writeRule(project, name, body);
  buildOutputs(project);
}

function writeUserFile(project, rel, content) {
  fs.mkdirSync(path.dirname(path.join(project, rel)), { recursive: true });
  fs.writeFileSync(path.join(project, rel), content);
}

describe('first use', () => {
  test('strict doctor skips absent claims in CJS and ESM consumers but rejects broken evidence', () => {
    for (const type of ['commonjs', 'module']) {
      const project = newProject();
      const metadata = JSON.parse(read(project, 'package.json'));
      metadata.type = type;
      writeUserFile(project, 'package.json', JSON.stringify(metadata));
      initWithRule(project);
      const result = cli(project, ['doctor', '--strict', '--json']);
      const report = JSON.parse(result.stdout);
      assert.equal(report.claimCheck.status, 'SKIP');
      assert.ok(!report.warnings.some(message => /No claims\.json/.test(message)), result.output);
      assert.deepEqual(report.errors, []);
      // An unrelated host warning (e.g. no optional OCI engine) still fails strict mode.
      assert.equal(result.status, report.warnings.length ? 1 : 0, result.output);
      assert.ok(!exists(project, '.agents/ctx.js'), 'the installed compiler must not be copied into the consumer');

      writeUserFile(project, 'benchmarks/claims.json', JSON.stringify({ claims: [{ evidenceArtifact: 'missing-evidence.json' }] }));
      const broken = cli(project, ['doctor', '--strict', '--json']);
      assert.notEqual(broken.status, 0);
      assert.match(JSON.parse(broken.stdout).claimCheck.message, /missing evidence artifact/);
    }
  });

  test('quickstart reaches pass, detects drift, and returns to pass', () => {
    const project = newProject();
    initWithRule(project);
    assert.equal(checkStatus(project).status, 'pass');
    assert.ok(exists(project, '.cursor/rules/team-auth.mdc'));
    assert.match(read(project, '.cursor/rules/team-auth.mdc'), /Never log authorization headers/);

    writeRule(project, 'team-auth', '- Never log authorization headers.\n- Never log session tokens.');
    cli(project, ['compile']);
    const drift = checkStatus(project);
    assert.equal(drift.status, 'drift');
    assert.equal(drift.exit, 1);

    assert.equal(cli(project, ['export', 'all']).status, 0);
    assert.equal(checkStatus(project).status, 'pass');
  });

  test('check detects drift even when compile was not re-run', () => {
    const project = newProject();
    initWithRule(project);
    writeRule(project, 'team-auth', '- Changed without compile.');
    assert.equal(checkStatus(project).status, 'drift');
  });

  test('init adds only rule sources and managed outputs, not the tool itself', () => {
    const project = newProject();
    initWithRule(project);
    commitAll(project, 'baseline');
    const tracked = trackedFiles(project);
    assert.ok(tracked.length <= 30, `expected a small footprint, got ${tracked.length} files:\n${tracked.join('\n')}`);
    assert.ok(!tracked.some(file => /^\.agents\/(adapters|compiler|resolver|filesystem|transaction-core|workspace)\//.test(file)),
      'tool implementation must stay in node_modules');
    assert.ok(!tracked.some(file => file.startsWith('.agents/compiled/') || file.startsWith('.agents/.contextos/')),
      'derived caches and journals must not be committed');
    assert.ok(tracked.includes('.agents/project/skills/team-auth/SKILL.md'));
  });

  test('no bundled opinions are installed unless asked for', () => {
    const project = newProject();
    initWithRule(project);
    assert.ok(!exists(project, '.agents/core'));
    assert.ok(!exists(project, '.agents/AGENTS.md'));
    assert.doesNotMatch(read(project, 'CONVENTIONS.md'), /Core law|ponytail/i);
    assert.doesNotMatch(read(project, COPILOT), /Zero-Assumption/);
    assert.ok(!exists(project, '.cursor/rules/00-project-rules.mdc'));
  });
});

describe('branches and merges', () => {
  test('a conflict spanning user text and a managed block refuses export without changing the file', () => {
    for (const placement of ['before', 'after', 'between']) {
      const project = newProject();
      initWithRule(project);
      const original = read(project, COPILOT);
      const side = marker => placement === 'before' ? `${marker}\n${original}`
        : placement === 'after' ? `${original}${marker}\n`
          : `${original}${marker}\n${original}`;
      const conflicted = `<<<<<<< HEAD\n${side('USER_OURS')}=======\n${side('USER_THEIRS')}>>>>>>> other\n`;
      writeUserFile(project, COPILOT, conflicted);
      const lock = read(project, '.agents/lockfile.v2.json');

      const result = cli(project, ['export', 'all']);
      assert.notEqual(result.status, 0, `export accepted user text ${placement} the block`);
      assert.match(result.output, /merge conflict/i);
      assert.equal(read(project, COPILOT), conflicted);
      assert.equal(read(project, '.agents/lockfile.v2.json'), lock, 'refusal must not commit partial outputs');
    }
  });

  test('a recovered lockfile does not authorize overwriting a manually edited generated file', () => {
    const project = newProject();
    initWithRule(project);
    const rel = '.cursor/rules/team-auth.mdc';
    const edited = `${read(project, rel)}\nUSER_LOCAL_CHANGE\n`;
    writeUserFile(project, rel, edited);
    const lockRel = '.agents/lockfile.v2.json';
    const lock = read(project, lockRel);
    const conflicted = `<<<<<<< HEAD\n${lock}=======\n${lock}>>>>>>> other\n`;
    writeUserFile(project, lockRel, conflicted);

    const refused = cli(project, ['export', 'all']);
    assert.notEqual(refused.status, 0, refused.output);
    assert.match(refused.output, /team-auth\.mdc/);
    assert.equal(read(project, rel), edited);
    assert.equal(read(project, lockRel), conflicted);
    assert.equal(cli(project, ['export', 'all', '--force']).status, 0);
    assert.doesNotMatch(read(project, rel), /USER_LOCAL_CHANGE/);
    assert.equal(checkStatus(project).status, 'pass');
  });

  test('uninstall preserves manual changes even when the lockfile needs conflict recovery', () => {
    const project = newProject();
    initWithRule(project);
    const rel = '.cursor/rules/team-auth.mdc';
    const edited = `${read(project, rel)}\nUSER_LOCAL_CHANGE\n`;
    writeUserFile(project, rel, edited);
    const lock = read(project, '.agents/lockfile.v2.json');
    writeUserFile(project, '.agents/lockfile.v2.json', `<<<<<<< HEAD\n${lock}=======\n${lock}>>>>>>> other\n`);
    const result = cli(project, ['uninstall', '--yes']);
    assert.equal(result.status, 0, result.output);
    assert.equal(read(project, rel), edited);
    assert.ok(!exists(project, '.zed/prompts/team-auth.md'), 'clean outputs should still be removed');
  });

  function branchScenario() {
    const project = newProject();
    initWithRule(project);
    commitAll(project, 'baseline');

    git(project, ['checkout', '-q', '-b', 'feature-a']);
    writeRule(project, 'team-auth', '- Never log authorization headers.\n- Rotate refresh tokens.');
    buildOutputs(project);
    commitAll(project, 'a: edit team-auth');

    git(project, ['checkout', '-q', 'main']);
    git(project, ['checkout', '-q', '-b', 'feature-b']);
    writeRule(project, 'team-db', '- Use migrations for every schema change.');
    buildOutputs(project);
    commitAll(project, 'b: add team-db');

    git(project, ['checkout', '-q', 'feature-a']);
    const merge = git(project, ['merge', 'feature-b', '-m', 'merge b']);
    return { project, merge };
  }

  test('rule sources never conflict and one command recovers the merged outputs', () => {
    const { project, merge } = branchScenario();
    if (merge.status !== 0) {
      const unmerged = unmergedFiles(project);
      assert.ok(!unmerged.some(file => file.startsWith('.agents/project/')), `sources conflicted: ${unmerged.join(', ')}`);
    }

    const recovered = cli(project, ['export', 'all']);
    assert.equal(recovered.status, 0, recovered.output);
    assert.equal(checkStatus(project).status, 'pass');

    for (const file of trackedFiles(project)) {
      assert.ok(!hasConflictMarkers(read(project, file)), `conflict markers left in ${file}`);
    }
    assert.match(read(project, '.cursor/rules/team-auth.mdc'), /Rotate refresh tokens/);
    assert.match(read(project, '.cursor/rules/team-db.mdc'), /Use migrations/);
    assert.ok(exists(project, '.claude/skills/team-db/SKILL.md'), 'merged rule missing for Claude Code');
  });

  test('two branches adding neighbouring rules conflict only in derived files, and one command resolves them', () => {
    const project = newProject();
    initWithRule(project);
    commitAll(project, 'baseline');
    git(project, ['checkout', '-q', '-b', 'one']);
    writeRule(project, 'team-aaa', '- Rule from the first branch.');
    buildOutputs(project);
    commitAll(project, 'one');
    git(project, ['checkout', '-q', 'main']);
    git(project, ['checkout', '-q', '-b', 'two']);
    writeRule(project, 'team-aab', '- Rule from the second branch.');
    buildOutputs(project);
    commitAll(project, 'two');
    git(project, ['checkout', '-q', 'one']);
    const merge = git(project, ['merge', 'two', '-m', 'merge two']);

    assert.notEqual(merge.status, 0, 'neighbouring insertions into aggregate files are expected to conflict');
    const unmerged = unmergedFiles(project);
    const allowed = new Set(['.agents/lockfile.v2.json', COPILOT, '.zed/rules.md', 'CONVENTIONS.md']);
    assert.ok(unmerged.length > 0 && unmerged.every(file => allowed.has(file)), `unexpected conflicts: ${unmerged.join(', ')}`);
    assert.equal(checkStatus(project).status, 'error', 'check must say what is wrong instead of reporting a pass');

    const recovered = cli(project, ['export', 'all']);
    assert.equal(recovered.status, 0, recovered.output);
    assert.equal(checkStatus(project).status, 'pass');
    for (const file of trackedFiles(project)) {
      assert.ok(!hasConflictMarkers(read(project, file)), `conflict markers left in ${file}`);
    }
    assert.match(read(project, 'CONVENTIONS.md'), /team-aaa/);
    assert.match(read(project, 'CONVENTIONS.md'), /team-aab/);
    assert.ok(exists(project, '.claude/skills/team-aaa/SKILL.md') && exists(project, '.claude/skills/team-aab/SKILL.md'));
  });

  test('a conflicted lockfile is rebuilt, not trusted and not fatal', () => {
    const { project } = branchScenario();
    const lockPath = path.join(project, '.agents', 'lockfile.v2.json');
    const current = fs.readFileSync(lockPath, 'utf8');
    // Simulate the worst case: the lockfile still holds both sides of a merge.
    const ours = current;
    const theirs = current.replace(/"mode": 420/, '"mode": 420,\n      "note": "other side"');
    fs.writeFileSync(lockPath, `<<<<<<< HEAD\n${ours}=======\n${theirs}>>>>>>> feature-b\n`);

    assert.equal(checkStatus(project).status, 'error', 'check must say the lockfile needs rebuilding, not crash');
    const recovered = cli(project, ['export', 'all']);
    assert.equal(recovered.status, 0, recovered.output);
    assert.ok(!hasConflictMarkers(read(project, '.agents/lockfile.v2.json')));
    assert.equal(checkStatus(project).status, 'pass');
  });

  test('conflict markers inside a generated block are replaced, outside it they stop the export', () => {
    const project = newProject();
    writeUserFile(project, COPILOT, '# My project\n\nUse pnpm.\n');
    initWithRule(project);
    const file = path.join(project, COPILOT);
    const text = fs.readFileSync(file, 'utf8');

    // Markers around the whole managed region: both sides are ours, so export replaces them.
    const start = text.indexOf('<!-- CONTEXTOS:START -->');
    const end = text.indexOf('<!-- CONTEXTOS:END -->') + '<!-- CONTEXTOS:END -->'.length;
    const block = text.slice(start, end);
    fs.writeFileSync(file, `${text.slice(0, start)}<<<<<<< HEAD\n${block}\n=======\n${block}\n>>>>>>> other\n${text.slice(end)}`);
    assert.equal(cli(project, ['export', 'all']).status, 0);
    assert.ok(!hasConflictMarkers(read(project, COPILOT)));
    assert.match(read(project, COPILOT), /Use pnpm\./);

    // A conflict in the user's own text needs a human; export must not guess.
    fs.writeFileSync(file, `<<<<<<< HEAD\nUse pnpm.\n=======\nUse npm.\n>>>>>>> other\n${read(project, COPILOT)}`);
    const refused = cli(project, ['export', 'all']);
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /merge conflict/i);
  });
});

describe('other checkouts', () => {
  test('a CRLF checkout does not change any file when exporting', () => {
    const origin = newProject();
    initWithRule(origin);
    commitAll(origin, 'baseline');

    const clone = path.join(path.dirname(origin), 'clone');
    const cloned = git(origin, ['-c', 'core.autocrlf=true', 'clone', '-q', origin, clone]);
    assert.equal(cloned.status, 0, cloned.stderr);
    git(clone, ['config', 'core.autocrlf', 'true']);
    fs.cpSync(path.join(origin, 'node_modules'), path.join(clone, 'node_modules'), { recursive: true });
    assert.match(read(clone, '.cursor/rules/team-auth.mdc'), /\r\n/, 'fixture must really be CRLF');

    assert.equal(checkStatus(clone).status, 'pass');
    const before = git(clone, ['status', '--porcelain']).stdout;
    assert.equal(cli(clone, ['export', 'all']).status, 0);
    assert.equal(read(clone, '.agents/lockfile.v2.json').replace(/\r\n/g, '\n'), read(origin, '.agents/lockfile.v2.json').replace(/\r\n/g, '\n'),
      'lockfile content must not depend on the checkout line endings');
    assert.equal(git(clone, ['status', '--porcelain']).stdout, before, 'export must not modify a clean CRLF checkout');
  });
});

describe('user-owned content', () => {
  test('editing your own text next to the managed block does not make the check fail', () => {
    const project = newProject();
    writeUserFile(project, COPILOT, '# My project\n\nUse pnpm.\n');
    initWithRule(project);
    assert.equal(checkStatus(project).status, 'pass');
    assert.match(read(project, COPILOT), /Use pnpm\./);

    fs.appendFileSync(path.join(project, COPILOT), '\nAlso run the linter before committing.\n');
    assert.equal(checkStatus(project).status, 'pass');
    assert.equal(cli(project, ['export', 'all']).status, 0);
    assert.match(read(project, COPILOT), /Also run the linter/);
  });

  test('editing inside the managed block is still reported', () => {
    const project = newProject();
    initWithRule(project);
    const file = path.join(project, COPILOT);
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('team-auth', 'tampered'));
    assert.equal(checkStatus(project).status, 'drift');
  });

  test('your CLAUDE.md is never rewritten; Claude Code reads .claude/ instead', () => {
    const project = newProject();
    writeUserFile(project, 'CLAUDE.md', '# My project\n\nUse pnpm.\n');
    initWithRule(project);
    assert.equal(read(project, 'CLAUDE.md'), '# My project\n\nUse pnpm.\n');
    assert.ok(exists(project, '.claude/skills/team-auth/SKILL.md'));
  });

  test('a team rule marked activation: always reaches always-loaded files in every client', () => {
    const project = newProject();
    cli(project, ['init', '--skip-compile']);
    writeUserFile(project, '.agents/project/skills/team-secrets/SKILL.md',
      '---\nname: team-secrets\ndescription: Secrets handling.\nactivation: always\n---\n# Secrets\n\n- Never commit .env files.\n');
    buildOutputs(project);
    assert.match(read(project, '.claude/rules/team-secrets.md'), /Never commit \.env files/);
    assert.doesNotMatch(read(project, '.claude/rules/team-secrets.md'), /^---\npaths:/, 'always rules are not path-scoped');
    assert.match(read(project, '.cursor/rules/team-secrets.mdc'), /alwaysApply: true/);
    assert.match(read(project, COPILOT), /Never commit \.env files/);
    assert.match(read(project, 'CONVENTIONS.md'), /Never commit \.env files/);
    assert.equal(checkStatus(project).status, 'pass');
  });

  test('a rule with globs becomes a path-scoped rule', () => {
    const project = newProject();
    cli(project, ['init', '--skip-compile']);
    writeUserFile(project, '.agents/project/skills/team-api/SKILL.md',
      '---\nname: team-api\ndescription: API rules.\nactivation: globs\nglobs: "src/api/**/*.ts,src/routes/**/*.ts"\n---\n# API\n\n- Validate every request body.\n');
    buildOutputs(project);
    assert.match(read(project, '.claude/rules/team-api.md'),
      /^---\npaths:\n {2}- "src\/api\/\*\*\/\*\.ts"\n {2}- "src\/routes\/\*\*\/\*\.ts"\n---/);
    assert.match(read(project, '.cursor/rules/team-api.mdc'), /globs: "src\/api\/\*\*\/\*\.ts,src\/routes\/\*\*\/\*\.ts"/);
  });

  test('an unknown activation value is reported with the skill name', () => {
    const project = newProject();
    cli(project, ['init', '--skip-compile']);
    writeUserFile(project, '.agents/project/skills/team-typo/SKILL.md',
      '---\nname: team-typo\ndescription: Typo.\nactivation: alwayz\n---\n# Typo\n');
    const result = cli(project, ['export', 'all']);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /team-typo.*activation must be one of/);
    assert.doesNotMatch(result.output, /\n\s+at /, 'a user mistake must not print a stack trace');
  });

  test('init --force keeps project rules', () => {
    const project = newProject();
    initWithRule(project);
    const forced = cli(project, ['init', '--force', '--skip-compile']);
    assert.equal(forced.status, 0, forced.output);
    assert.ok(exists(project, '.agents/project/skills/team-auth/SKILL.md'), 'project rule was deleted');
  });

  test('init without --force refuses to touch an initialized project', () => {
    const project = newProject();
    initWithRule(project);
    const again = cli(project, ['init', '--skip-compile']);
    assert.notEqual(again.status, 0);
    assert.match(again.output, /already exists/);
    assert.ok(exists(project, '.agents/project/skills/team-auth/SKILL.md'));
  });

  test('export refuses to overwrite a file you own at a generated path unless forced', () => {
    const project = newProject();
    writeUserFile(project, 'CONVENTIONS.md', 'My aider conventions\n');
    cli(project, ['init', '--skip-compile']);
    writeRule(project, 'team-auth', '- Never log authorization headers.');
    cli(project, ['compile']);
    const refused = cli(project, ['export', 'all']);
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /CONVENTIONS\.md/);
    assert.match(refused.output, /--force/);
    assert.equal(read(project, 'CONVENTIONS.md'), 'My aider conventions\n');
    assert.ok(!exists(project, '.cursor/rules/team-auth.mdc'), 'a refused export must write nothing');

    assert.equal(cli(project, ['export', 'all', '--force']).status, 0);
    assert.match(read(project, 'CONVENTIONS.md'), /team-auth/);
  });
});

describe('removal and path safety', () => {
  test('uninstall preserves a pre-existing Aider configuration after repeated exports', () => {
    const project = newProject();
    writeUserFile(project, '.aider.conf.yml', 'model: team-model\nread:\n  - TEAM.md\nauto-commits: false\n');
    initWithRule(project);
    assert.equal(cli(project, ['export', 'all']).status, 0);
    const before = read(project, '.aider.conf.yml');
    assert.match(before, /team-model/);
    assert.match(before, /TEAM\.md/);
    assert.match(before, /auto-commits: false/);
    // Older export records did not mark merged user content. They must be safe too.
    const lockRel = '.agents/lockfile.v2.json';
    const lock = JSON.parse(read(project, lockRel));
    delete lock.managedFiles['.aider.conf.yml'].userContent;
    writeUserFile(project, lockRel, JSON.stringify(lock, null, 2) + '\n');
    const result = cli(project, ['uninstall', '--yes']);
    assert.equal(result.status, 0, result.output);
    assert.ok(exists(project, '.aider.conf.yml'), 'merged user settings must not be deleted');
    assert.equal(read(project, '.aider.conf.yml'), before);
    assert.ok(!exists(project, 'CONVENTIONS.md'), 'generated conventions should still be removed');
  });

  test('update refuses junctions in its state paths before writing anything outside the project', () => {
    for (const rel of ['.agents', '.agents/.contextos', '.agents/.contextos/locks', '.agents/.contextos/transactions']) {
      const project = newProject();
      const outside = path.join(path.dirname(project), 'outside');
      fs.mkdirSync(outside);
      writeUserFile(outside, 'precious.md', 'KEEP\n');
      const link = path.join(project, ...rel.split('/'));
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(outside, link, 'junction');
      try {
        const before = fs.readdirSync(outside, { recursive: true }).sort();
        const result = cli(project, ['update']);
        assert.notEqual(result.status, 0, `update accepted ${rel} junction: ${result.output}`);
        assert.match(result.output, /CTX_PATH_SYMLINK_ESCAPE/);
        assert.deepEqual(fs.readdirSync(outside, { recursive: true }).sort(), before);
        assert.equal(read(outside, 'precious.md'), 'KEEP\n');
        assert.ok(!exists(project, '.agents/contextos.lock.json'), 'migration must not write before path validation');
      } finally {
        fs.unlinkSync(link);
      }
    }
  });

  test('uninstall asks for confirmation and changes nothing without --yes', () => {
    const project = newProject();
    initWithRule(project);
    const result = cli(project, ['uninstall']);
    assert.notEqual(result.status, 0);
    assert.match(result.output, /--yes/);
    assert.ok(exists(project, '.cursor/rules/team-auth.mdc'));
  });

  test('uninstall removes managed outputs and blocks but keeps project rules and user text', () => {
    const project = newProject();
    writeUserFile(project, COPILOT, '# My project\n\nUse pnpm.\n');
    initWithRule(project);
    assert.match(read(project, COPILOT), /CONTEXTOS:START/);

    const result = cli(project, ['uninstall', '--yes']);
    assert.equal(result.status, 0, result.output);

    assert.ok(exists(project, '.agents/project/skills/team-auth/SKILL.md'), 'project rule must be kept');
    assert.ok(!exists(project, '.cursor/rules/team-auth.mdc'), 'managed output left behind');
    assert.ok(!exists(project, '.claude/skills/team-auth/SKILL.md'), 'managed output left behind');
    assert.ok(!exists(project, '.agents/lockfile.v2.json'), 'lockfile left behind');
    assert.ok(!exists(project, '.agents/compiled'), 'derived cache left behind');
    assert.ok(exists(project, COPILOT), 'user file must be kept');
    assert.doesNotMatch(read(project, COPILOT), /CONTEXTOS:(START|END)/);
    assert.match(read(project, COPILOT), /Use pnpm\./);
    assert.doesNotMatch(read(project, '.gitignore'), /CONTEXTOS/);
    assert.match(read(project, '.gitignore'), /node_modules/);
  });

  test('uninstall of a file that only held the managed block removes that file', () => {
    const project = newProject();
    initWithRule(project);
    assert.equal(cli(project, ['uninstall', '--yes']).status, 0);
    assert.ok(!exists(project, COPILOT));
    assert.ok(!exists(project, '.github'), 'directories emptied by the uninstall are removed');
  });

  test('uninstall keeps a generated file that you edited', () => {
    const project = newProject();
    initWithRule(project);
    fs.appendFileSync(path.join(project, '.cursor/rules/team-auth.mdc'), '\nMy own addition.\n');
    const result = cli(project, ['uninstall', '--yes']);
    assert.equal(result.status, 0, result.output);
    assert.ok(exists(project, '.cursor/rules/team-auth.mdc'), 'edited file must be preserved');
    assert.ok(!exists(project, '.zed/prompts/team-auth.md'), 'untouched output must be removed');
  });

  test('uninstall removes the core files that init --with-core copied, and nothing else', () => {
    const project = newProject();
    assert.equal(cli(project, ['init', '--with-core', '--skip-compile']).status, 0);
    assert.ok(exists(project, '.agents/core/skills/security/SKILL.md'));
    writeRule(project, 'team-auth', '- Never log authorization headers.');
    assert.equal(cli(project, ['uninstall', '--yes']).status, 0);
    assert.ok(!exists(project, '.agents/core'), 'bundled core must be removed');
    assert.ok(!exists(project, '.agents/AGENTS.md'));
    assert.ok(exists(project, '.agents/project/skills/team-auth/SKILL.md'));
  });

  test('uninstall, update and export never touch files behind a junction or symlink', () => {
    const project = newProject();
    assert.equal(cli(project, ['init', '--with-core', '--skip-compile']).status, 0);
    writeRule(project, 'team-auth', '- Never log authorization headers.');
    buildOutputs(project);

    const outside = path.join(path.dirname(project), 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.writeFileSync(path.join(outside, 'precious.md'), 'do not delete\n');

    // Move two managed directories outside the project and link them back in.
    const moved = [];
    for (const rel of ['.cursor/rules', '.agents/core/skills']) {
      const dir = path.join(project, ...rel.split('/'));
      const target = path.join(outside, rel.replace(/\//g, '-'));
      fs.cpSync(dir, target, { recursive: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.symlinkSync(target, dir, 'junction');
      moved.push(target);
    }

    const before = moved.map(dir => fs.readdirSync(dir, { recursive: true }).sort());
    for (const args of [['export', 'all'], ['update'], ['uninstall', '--yes']]) {
      cli(project, args);
      moved.forEach((dir, index) => {
        assert.deepEqual(fs.readdirSync(dir, { recursive: true }).sort(), before[index],
          `'${args.join(' ')}' changed files outside the project`);
      });
      assert.equal(read(outside, 'precious.md'), 'do not delete\n');
    }
  });
});
