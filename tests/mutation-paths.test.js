'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

describe('W3.1: Mutation Inventory Enforcement', () => {
  const rootDir = path.resolve(__dirname, '..');
  const agentsDir = path.join(rootDir, '.agents');

  // Allowed modules that can perform direct filesystem mutations.
  // Ideally, everything should route through JournaledTransaction or LockfileV2,
  // but some core components (compilers, doctor, profile managers) need basic IO.
  const ALLOWED_MUTATION_PATHS = [
    // Filesystem primitives & Transactions
    path.join(agentsDir, 'filesystem', 'journaled-transaction.js'),
    path.join(agentsDir, 'filesystem', 'lockfile-v2.js'),
    path.join(agentsDir, 'filesystem', 'project-lock.js'),
    path.join(agentsDir, 'filesystem', 'platform-hardening.js'),
    
    // Core systems that manage their own state (could be migrated later, but allowed for now)
    path.join(agentsDir, 'adapters', 'pure-compiler.js'),
    path.join(agentsDir, 'adapters', 'shared.js'),
    path.join(agentsDir, 'filesystem', 'safe-path.js'),
    path.join(agentsDir, 'compiler', 'manifest-compiler.js'),
    path.join(agentsDir, 'ctx.js'),
    path.join(agentsDir, 'doctor.js'),
    path.join(agentsDir, 'plugins.js'),
    path.join(agentsDir, 'runtime', 'plugin-supply-chain-bundle.js'),
    path.join(agentsDir, 'profiles.js'),
    path.join(agentsDir, 'customization-dx.js'),
    path.join(agentsDir, 'watch.js'),

    // Runtime tracking primitives
    path.join(agentsDir, 'runtime', 'state-machine.js'),
    path.join(agentsDir, 'runtime', 'event-store.js'),
    path.join(agentsDir, 'runtime', 'idempotency.js'),
    path.join(agentsDir, 'runtime', 'ipc-lock.js'),
    path.join(agentsDir, 'runtime', 'thread-store.js')
  ].map(p => p.toLowerCase());

  // Patterns that indicate a filesystem mutation
  const MUTATION_PATTERNS = [
    /fs\.writeFileSync\(/g,
    /fs\.writeFile\(/g,
    /fs\.unlinkSync\(/g,
    /fs\.unlink\(/g,
    /fs\.rmdirSync\(/g,
    /fs\.rmSync\(/g,
    /fs\.mkdirSync\(/g,
    /fs\.appendFileSync\(/g,
    /fs\.renameSync\(/g,
    /fs\.copyFileSync\(/g
  ];

  function getAllJsFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      // Skip node_modules, generated, plugins, etc.
      if (fullPath.includes('node_modules') || 
          fullPath.includes(path.join('.agents', 'compiled')) ||
          fullPath.includes(path.join('.agents', 'generated')) ||
          fullPath.includes(path.join('.agents', 'plugins')) ||
          fullPath.includes(path.join('.agents', 'core', 'skills')) ||
          fullPath.includes(path.join('tests', 'fixtures'))) {
        continue;
      }
      
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        getAllJsFiles(fullPath, fileList);
      } else if (fullPath.endsWith('.js') && !fullPath.includes('.test.js')) {
        fileList.push(fullPath);
      }
    }
    return fileList;
  }

  test('Project direct writes/deletes are strictly confined to allowed primitives', () => {
    const jsFiles = getAllJsFiles(agentsDir);
    const violations = [];

    for (const file of jsFiles) {
      if (ALLOWED_MUTATION_PATHS.includes(file.toLowerCase())) {
        continue; // Exempted
      }

      const content = fs.readFileSync(file, 'utf8');
      
      for (const pattern of MUTATION_PATTERNS) {
        if (pattern.test(content)) {
          violations.push(`File ${path.relative(rootDir, file)} contains unauthorized direct fs mutation: ${pattern}`);
        }
      }
    }

    if (violations.length > 0) {
      console.error('--- MUTATION INVENTORY VIOLATIONS ---');
      violations.forEach(v => console.error(v));
      assert.fail(`Found ${violations.length} files with unauthorized filesystem mutations. All writes must go through journaled transactions.`);
    } else {
      assert.ok(true, 'No unauthorized mutations found.');
    }
  });
});
