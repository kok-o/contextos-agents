/**
 * tests/workspace-graph.test.js
 * ContextOS — Workspace Evidence Graph & Nearest-Package Scoping Unit Tests
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  WorkspaceGraphBuilder,
  toPosix,
  cleanRelative,
  globToRegex,
} = require('../.agents/workspace/workspace-graph.js');

function createTempDir(prefix = 'ctx-workspace-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function removeDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

test('workspace-graph.js — Workspace Evidence Graph Builder', async (t) => {

  await t.test('globToRegex compiles workspace glob patterns correctly', () => {
    const r1 = globToRegex('packages/*');
    assert.ok(r1.test('packages/core'));
    assert.ok(r1.test('packages/ui'));
    assert.ok(!r1.test('packages/core/sub'));
    assert.ok(!r1.test('apps/web'));

    const r2 = globToRegex('apps/**');
    assert.ok(r2.test('apps/web'));
    assert.ok(r2.test('apps/api/sub'));
    assert.ok(!r2.test('packages/core'));
  });

  await t.test('cleanRelative and toPosix normalize paths consistently across platforms', () => {
    assert.equal(toPosix('foo\\bar\\baz'), 'foo/bar/baz');
    assert.equal(cleanRelative('./packages/core/'), 'packages/core');
    assert.equal(cleanRelative('.'), '.');
    assert.equal(cleanRelative(''), '.');
  });

  await t.test('findRepositoryRoot discovers repository root via .git marker', () => {
    const tempDir = createTempDir();
    try {
      const gitDir = path.join(tempDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      const subDir = path.join(tempDir, 'packages', 'a', 'src');
      fs.mkdirSync(subDir, { recursive: true });

      const builder = new WorkspaceGraphBuilder();
      const detected = builder.findRepositoryRoot(subDir);
      assert.equal(toPosix(detected), toPosix(fs.realpathSync(tempDir)));
    } finally {
      removeDir(tempDir);
    }
  });

  await t.test('build discovers multi-package monorepo across polyglot ecosystems (npm, python, rust, go)', () => {
    const tempDir = createTempDir();
    try {
      // Root package.json with workspaces
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*', 'services/*']
      }, null, 2));

      // 1. NPM package in packages/web
      const webDir = path.join(tempDir, 'packages', 'web');
      fs.mkdirSync(webDir, { recursive: true });
      fs.writeFileSync(path.join(webDir, 'package.json'), JSON.stringify({
        name: '@monorepo/web',
        dependencies: {
          'next': '^15.0.0',
          'react': '^19.0.0'
        },
        devDependencies: {
          'typescript': '^5.0.0'
        }
      }, null, 2));
      fs.writeFileSync(path.join(webDir, 'next.config.js'), '// next config');
      fs.writeFileSync(path.join(webDir, 'tsconfig.json'), '{}');

      // 2. Python package in services/api
      const apiDir = path.join(tempDir, 'services', 'api');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(path.join(apiDir, 'requirements.txt'), 'fastapi>=0.100.0\nuvicorn[standard]\npydantic\n');
      fs.writeFileSync(path.join(apiDir, 'main.py'), '# python main');

      // 3. Rust package in services/worker
      const workerDir = path.join(tempDir, 'services', 'worker');
      fs.mkdirSync(workerDir, { recursive: true });
      fs.writeFileSync(path.join(workerDir, 'Cargo.toml'), '[package]\nname = "data-worker"\n\n[dependencies]\nserde = "1.0"\n');

      // 4. Go package in services/proxy
      const proxyDir = path.join(tempDir, 'services', 'proxy');
      fs.mkdirSync(proxyDir, { recursive: true });
      fs.writeFileSync(path.join(proxyDir, 'go.mod'), 'module github.com/myorg/proxy\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.9.1\n');

      const builder = new WorkspaceGraphBuilder();
      const graph = builder.build(tempDir);

      assert.equal(graph.schemaVersion, 1);
      assert.ok(graph.fingerprint && typeof graph.fingerprint === 'string');
      assert.equal(graph.partial, false);

      const pkgIds = graph.packages.map(p => p.id);
      assert.ok(pkgIds.includes('my-monorepo'), 'root package discovered');
      assert.ok(pkgIds.includes('@monorepo/web'), 'npm web package discovered');
      assert.ok(pkgIds.includes('api'), 'python api package discovered');
      assert.ok(pkgIds.includes('data-worker'), 'rust worker package discovered');
      assert.ok(pkgIds.includes('github.com/myorg/proxy'), 'go proxy package discovered');

      const webPkg = graph.packages.find(p => p.id === '@monorepo/web');
      assert.equal(webPkg.ecosystem, 'npm');
      assert.ok(webPkg.dependencies.includes('next'));
      assert.ok(webPkg.dependencies.includes('react'));
      assert.ok(webPkg.dependencies.includes('typescript'));
      assert.ok(webPkg.configs.some(c => c.includes('next.config.js')));

      const pyPkg = graph.packages.find(p => p.id === 'api');
      assert.equal(pyPkg.ecosystem, 'python');
      assert.ok(pyPkg.dependencies.includes('fastapi'));
      assert.ok(pyPkg.dependencies.includes('uvicorn'));
    } finally {
      removeDir(tempDir);
    }
  });

  await t.test('findNearestPackage correctly maps file paths to deepest matching enclosing package', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'root' }));

      const webDir = path.join(tempDir, 'apps', 'web');
      fs.mkdirSync(webDir, { recursive: true });
      fs.writeFileSync(path.join(webDir, 'package.json'), JSON.stringify({ name: 'web' }));

      const apiDir = path.join(tempDir, 'apps', 'api');
      fs.mkdirSync(apiDir, { recursive: true });
      fs.writeFileSync(path.join(apiDir, 'package.json'), JSON.stringify({ name: 'api' }));

      const builder = new WorkspaceGraphBuilder();
      const graph = builder.build(tempDir);

      const matchWeb = builder.findNearestPackage('apps/web/src/components/Button.tsx', graph);
      assert.equal(matchWeb?.id, 'web');
      assert.equal(matchWeb?.root, 'apps/web');

      const matchApi = builder.findNearestPackage('apps/api/main.py', graph);
      assert.equal(matchApi?.id, 'api');
      assert.equal(matchApi?.root, 'apps/api');

      const matchRoot = builder.findNearestPackage('README.md', graph);
      assert.equal(matchRoot?.id, 'root');
      assert.equal(matchRoot?.root, '.');
    } finally {
      removeDir(tempDir);
    }
  });

  await t.test('extractPackageEvidence extracts package-scoped dependencies and configs with high weights', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'root' }));

      const webDir = path.join(tempDir, 'apps', 'web');
      fs.mkdirSync(webDir, { recursive: true });
      fs.writeFileSync(path.join(webDir, 'package.json'), JSON.stringify({
        name: 'web',
        dependencies: { 'next': '^14.0.0', 'react': '^18.0.0' }
      }));
      fs.writeFileSync(path.join(webDir, 'next.config.js'), '// next');

      const builder = new WorkspaceGraphBuilder();
      const graph = builder.build(tempDir);

      const evidence = builder.extractPackageEvidence('apps/web/pages/index.tsx', graph);
      assert.ok(evidence.length > 0);

      const nextDep = evidence.find(e => e.target === 'next');
      assert.ok(nextDep);
      assert.equal(nextDep.source, 'nearest-package');
      assert.equal(nextDep.weight, 60);

      const nextCfg = evidence.find(e => e.target.includes('next.config.js'));
      assert.ok(nextCfg);
      assert.equal(nextCfg.source, 'package-config');
      assert.equal(nextCfg.weight, 50);
    } finally {
      removeDir(tempDir);
    }
  });

  await t.test('enforces maxPackages limit and sets partial: true when threshold reached', () => {
    const tempDir = createTempDir();
    try {
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'root' }));

      // Create 5 packages
      for (let i = 1; i <= 5; i++) {
        const pDir = path.join(tempDir, 'packages', `pkg-${i}`);
        fs.mkdirSync(pDir, { recursive: true });
        fs.writeFileSync(path.join(pDir, 'package.json'), JSON.stringify({ name: `pkg-${i}` }));
      }

      const builder = new WorkspaceGraphBuilder({ maxPackages: 3 });
      const graph = builder.build(tempDir);

      assert.equal(graph.partial, true);
      assert.ok(graph.packages.length <= 4); // root + max 3
    } finally {
      removeDir(tempDir);
    }
  });

  await t.test('generates deterministic fingerprint across repeated builds', () => {
    const builder = new WorkspaceGraphBuilder();
    const graph1 = builder.build(process.cwd());
    const graph2 = builder.build(process.cwd());

    assert.equal(graph1.fingerprint, graph2.fingerprint);
    assert.equal(graph1.packages.length, graph2.packages.length);
  });
});
