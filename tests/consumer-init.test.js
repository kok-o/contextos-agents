/**
 * tests/consumer-init.test.js
 * Integration test suite for Phase 3: Consumer CLI Initialization from Tarball,
 * Minimal / Auto Modes, Non-Destructive Re-Init, Dry-Run, and Recovery.
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

describe('Phase 3: Consumer CLI Init from Tarball (Tasks 3.1, 3.2, 3.3)', () => {
  let tmpBase;
  let tarballPath;
  let pkgBin;
  const projectRoot = path.resolve(__dirname, '..');

  before(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-consumer-init-'));

    // 1. Pack distribution tarball directly from repo
    const packOutput = execSync('npm pack', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();

    const tarballFileName = packOutput.split(/\r?\n/).pop().trim();
    tarballPath = path.join(projectRoot, tarballFileName);
    assert.ok(fs.existsSync(tarballPath), `Tarball must exist at ${tarballPath}`);

    // 2. Unpack into isolated directory to ensure zero dev dependencies bleed
    const extractedPkgDir = path.join(tmpBase, 'unpacked');
    fs.mkdirSync(extractedPkgDir, { recursive: true });
    execSync(`tar -xzf "${tarballPath}" -C "${extractedPkgDir}"`);

    pkgBin = path.join(extractedPkgDir, 'package', 'bin', 'index.js');
    assert.ok(fs.existsSync(pkgBin), 'Unpacked binary must exist');
  });

  after(() => {
    try {
      if (tarballPath && fs.existsSync(tarballPath)) {
        fs.unlinkSync(tarballPath);
      }
      fs.rmSync(tmpBase, { recursive: true, force: true });
    } catch {}
  });

  test('Task 3.1a: Clean public init in empty consumer directory', () => {
    const consumerAppDir = path.join(tmpBase, 'empty-consumer-app');
    fs.mkdirSync(consumerAppDir, { recursive: true });

    // Run init without access to repo source
    const output = execSync(`node "${pkgBin}" init --skip-compile`, {
      cwd: consumerAppDir,
      encoding: 'utf8',
    });

    assert.ok(fs.existsSync(path.join(consumerAppDir, '.agents')), '.agents/ must be created');
    assert.ok(fs.existsSync(path.join(consumerAppDir, '.agents', 'AGENTS.md')), 'AGENTS.md must exist');
    assert.ok(
      fs.existsSync(path.join(consumerAppDir, '.agents', 'contextos.lock.json')) ||
      fs.existsSync(path.join(consumerAppDir, '.agents', 'lockfile.v2.json')),
      'Lockfile must exist'
    );

    const coreSkillsDir = path.join(consumerAppDir, '.agents', 'core', 'skills');
    assert.ok(fs.existsSync(path.join(coreSkillsDir, 'engineering-workflow')), 'engineering-workflow must exist');
    assert.ok(fs.existsSync(path.join(coreSkillsDir, 'security')), 'security must exist');
    assert.ok(fs.existsSync(path.join(coreSkillsDir, 'ponytail-mindset')), 'ponytail-mindset must exist');
  });

  test('Task 3.1b: init --minimal installs only essential core skills', () => {
    const minimalAppDir = path.join(tmpBase, 'minimal-consumer-app');
    fs.mkdirSync(minimalAppDir, { recursive: true });

    execSync(`node "${pkgBin}" init --minimal --skip-compile`, {
      cwd: minimalAppDir,
      encoding: 'utf8',
    });

    const installedSkills = fs.readdirSync(path.join(minimalAppDir, '.agents', 'core', 'skills'));
    assert.ok(installedSkills.length <= 7, 'Minimal install must contain only core essential skills');
    assert.ok(installedSkills.includes('engineering-workflow'));
    assert.ok(installedSkills.includes('ponytail-mindset'));
  });

  test('Task 3.1c: init --auto detects project stack and applies recommended profile', () => {
    const reactAppDir = path.join(tmpBase, 'react-auto-app');
    fs.mkdirSync(reactAppDir, { recursive: true });

    // Place package.json with React dependency
    fs.writeFileSync(
      path.join(reactAppDir, 'package.json'),
      JSON.stringify({
        name: 'react-auto-consumer',
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
      }, null, 2)
    );

    const output = execSync(`node "${pkgBin}" init --auto --skip-compile`, {
      cwd: reactAppDir,
      encoding: 'utf8',
    });

    assert.ok(output.includes('Detected stack') || output.includes('Installing'), 'Must report detection and install');
    assert.ok(
      fs.existsSync(path.join(reactAppDir, '.agents', 'contextos.lock.json')) ||
      fs.existsSync(path.join(reactAppDir, '.agents', 'lockfile.v2.json')),
      'Lockfile must exist'
    );
  });

  test('Task 3.1d: init --agent cursor exports cursor rules', () => {
    const cursorAppDir = path.join(tmpBase, 'cursor-consumer-app');
    fs.mkdirSync(cursorAppDir, { recursive: true });

    execSync(`node "${pkgBin}" init --agent cursor`, {
      cwd: cursorAppDir,
      encoding: 'utf8',
    });

    const cursorRulesDir = path.join(cursorAppDir, '.cursor', 'rules');
    assert.ok(fs.existsSync(cursorRulesDir), '.cursor/rules/ must be created for cursor agent');
    const mdcFiles = fs.readdirSync(cursorRulesDir).filter(f => f.endsWith('.mdc'));
    assert.ok(mdcFiles.length > 0, 'Must generate .mdc rule files for cursor');
  });

  test('Task 3.2a: init --dry-run performs zero writes to disk', () => {
    const dryRunAppDir = path.join(tmpBase, 'dry-run-consumer-app');
    fs.mkdirSync(dryRunAppDir, { recursive: true });

    const beforeFiles = fs.readdirSync(dryRunAppDir);
    const output = execSync(`node "${pkgBin}" init --dry-run --skip-compile`, {
      cwd: dryRunAppDir,
      encoding: 'utf8',
    });

    const afterFiles = fs.readdirSync(dryRunAppDir);
    assert.deepEqual(beforeFiles, afterFiles, 'Directory must remain untouched after dry-run');
    assert.ok(!fs.existsSync(path.join(dryRunAppDir, '.agents')), '.agents/ must not be created on dry-run');
    assert.ok(output.includes('[DRY-RUN] No files will be written'));
  });

  test('Task 3.2b: Existing .agents refuses overwrite without --force, preserving user skills', () => {
    const existingAppDir = path.join(tmpBase, 'existing-consumer-app');
    fs.mkdirSync(existingAppDir, { recursive: true });

    // Initial install
    execSync(`node "${pkgBin}" init --minimal --skip-compile`, {
      cwd: existingAppDir,
      encoding: 'utf8',
    });

    // Add user custom skill
    const customSkillDir = path.join(existingAppDir, '.agents', 'core', 'skills', 'my-custom-accounting');
    fs.mkdirSync(customSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(customSkillDir, 'SKILL.md'),
      '---\nname: my-custom-accounting\ndescription: Custom rule\n---\n# Accounting Rules\n'
    );

    // Re-running init without --force must fail closed
    let failedClosed = false;
    try {
      execSync(`node "${pkgBin}" init`, {
        cwd: existingAppDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      failedClosed = true;
      assert.equal(err.status, 1, 'Refusal to overwrite must exit with code 1');
      const stderr = err.stderr.toString();
      assert.ok(stderr.includes('.agents/ already exists. Refusing to overwrite it.'));
    }
    assert.ok(failedClosed, 'Must fail closed when .agents already exists');

    // Verify user skill was NOT deleted
    assert.ok(
      fs.existsSync(path.join(customSkillDir, 'SKILL.md')),
      'User custom skill must remain intact after refused overwrite'
    );
  });

  test('Task 3.2c: Safe update command updates installation without deleting user custom skills', () => {
    const updateAppDir = path.join(tmpBase, 'update-consumer-app');
    fs.mkdirSync(updateAppDir, { recursive: true });

    // Install initial
    execSync(`node "${pkgBin}" init --minimal --skip-compile`, {
      cwd: updateAppDir,
      encoding: 'utf8',
    });

    // Add user custom skill
    const customSkillDir = path.join(updateAppDir, '.agents', 'core', 'skills', 'user-unique-devops');
    fs.mkdirSync(customSkillDir, { recursive: true });
    fs.writeFileSync(
      path.join(customSkillDir, 'SKILL.md'),
      '---\nname: user-unique-devops\ndescription: DevOps rule\n---\n# DevOps\n'
    );

    // Run safe update command
    execSync(`node "${pkgBin}" update`, {
      cwd: updateAppDir,
      encoding: 'utf8',
    });

    // Verify custom skill is still present
    assert.ok(
      fs.existsSync(path.join(customSkillDir, 'SKILL.md')),
      'User custom skill must be preserved after update'
    );
  });

  test('Task 3.3: Interrupted transaction recovery and safe retry without corruption', () => {
    const recoverAppDir = path.join(tmpBase, 'recover-consumer-app');
    fs.mkdirSync(recoverAppDir, { recursive: true });

    // Initial valid install
    execSync(`node "${pkgBin}" init --minimal --skip-compile`, {
      cwd: recoverAppDir,
      encoding: 'utf8',
    });

    // Check doctor is healthy initially
    const initialDoctor = execSync(`node "${pkgBin}" doctor`, {
      cwd: recoverAppDir,
      encoding: 'utf8',
    });
    assert.doesNotMatch(initialDoctor, /RECOVERY_REQUIRED/);

    // Simulate an incomplete/torn transaction in .agents/.contextos/transactions
    const txDir = path.join(recoverAppDir, '.agents', '.contextos', 'transactions', 'tx_test_torn_123');
    fs.mkdirSync(txDir, { recursive: true });
    const journalData = {
      txId: 'tx_test_torn_123',
      state: 'APPLYING',
      createdAt: new Date().toISOString(),
      operations: [
        { type: 'write', relativePath: 'torn_file.txt', hadExisting: false },
      ],
    };
    fs.writeFileSync(path.join(txDir, 'journal.json'), JSON.stringify(journalData, null, 2));

    // Doctor should detect RECOVERY_REQUIRED
    let doctorFailed = false;
    try {
      execSync(`node "${pkgBin}" doctor`, {
        cwd: recoverAppDir,
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (err) {
      doctorFailed = true;
      const combined = (err.stdout || '') + (err.stderr || '');
      assert.match(combined, /RECOVERY_REQUIRED/);
    }
    assert.ok(doctorFailed, 'Doctor must detect torn transaction and exit non-zero');

    // recover --list should show the torn tx
    const listOutput = execSync(`node "${pkgBin}" recover --list`, {
      cwd: recoverAppDir,
      encoding: 'utf8',
    });
    assert.match(listOutput, /tx_test_torn_123/);
    assert.match(listOutput, /APPLYING/);

    // recover --rollback should roll it back
    const rollbackOutput = execSync(`node "${pkgBin}" recover --rollback tx_test_torn_123`, {
      cwd: recoverAppDir,
      encoding: 'utf8',
    });
    assert.match(rollbackOutput, /successfully rolled back/);

    // Doctor is healthy again
    const postDoctor = execSync(`node "${pkgBin}" doctor`, {
      cwd: recoverAppDir,
      encoding: 'utf8',
    });
    assert.doesNotMatch(postDoctor, /RECOVERY_REQUIRED/);

    // Original installation is completely intact
    assert.ok(fs.existsSync(path.join(recoverAppDir, '.agents', 'AGENTS.md')), 'Original installation must remain intact');
  });
});
