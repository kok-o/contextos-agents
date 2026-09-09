/**
 * .agents/workspace/workspace-graph.js
 * ContextOS — Workspace Evidence Graph Builder
 *
 * Discovers and builds a structured evidence graph of the workspace repository:
 *   - Monorepo & multi-package workspace discovery (npm/yarn workspaces, pnpm, Turborepo, Lerna, Nx)
 *   - Polyglot ecosystem support (npm, python, rust, go)
 *   - Nearest-package resolution with bounded traversal & symlink escape guards
 *   - Package dependency extraction, internal cross-package edges, and stack configs
 *   - Cryptographic deterministic fingerprinting (SHA-256)
 *   - Cross-platform POSIX path normalization
 *   - Zero install-time runtime dependencies (pure Node.js)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Default directories to ignore during traversal
const DEFAULT_IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.contextos-worktrees',
  '.agents',
  'dist',
  'build',
  '.next',
  'out',
  'target',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  '.turbo',
  '.cache',
  'coverage',
  '.svn',
  '.hg',
  'scratch',
  'temp',
  'tmp'
]);

// Known stack config patterns to detect per package
const KNOWN_CONFIG_FILES = [
  'tsconfig.json',
  'jsconfig.json',
  'next.config.js',
  'next.config.mjs',
  'next.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'vite.config.ts',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'tailwind.config.mjs',
  'tailwind.config.ts',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'vitest.config.js',
  'vitest.config.ts',
  'vitest.config.mjs',
  'jest.config.js',
  'jest.config.ts',
  'nest-cli.json',
  'prisma/schema.prisma'
];

/**
 * Normalizes any path to a POSIX path with forward slashes.
 * @param {string} p
 * @returns {string}
 */
function toPosix(p) {
  if (!p) return '';
  return p.replace(/\\/g, '/');
}

/**
 * Standardizes directory paths for safe relative comparisons.
 * @param {string} p
 * @returns {string}
 */
function cleanRelative(p) {
  const posix = toPosix(p).replace(/^\.\//, '');
  if (posix === '' || posix === '.') return '.';
  return posix.replace(/\/+$/, '');
}

/**
 * Simple glob-to-RegExp compiler for workspace patterns (e.g. "packages/*", "apps/**").
 * @param {string} glob
 * @returns {RegExp}
 */
function globToRegex(glob) {
  const normalized = toPosix(glob).replace(/^\.\//, '').replace(/\/+$/, '');
  let regStr = '';
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (char === '*' && normalized[i + 1] === '*') {
      regStr += '.*';
      i++; // skip second asterisk
    } else if (char === '*') {
      regStr += '[^/]+';
    } else if (char === '?') {
      regStr += '[^/]';
    } else if (['.', '+', '^', '$', '(', ')', '[', ']', '{', '}', '|', '\\'].includes(char)) {
      regStr += '\\' + char;
    } else {
      regStr += char;
    }
  }
  return new RegExp(`^${regStr}$`);
}

class WorkspaceGraphBuilder {
  constructor(options = {}) {
    this.maxDepth = options.maxDepth || 8;
    this.maxPackages = options.maxPackages || 500;
    this.ignoredDirs = new Set([...DEFAULT_IGNORED_DIRS, ...(options.ignoredDirs || [])]);
  }

  /**
   * Discovers the real repository root starting from a directory.
   * Traverses upwards looking for markers (.git, pnpm-workspace.yaml, lerna.json, root package.json with workspaces).
   * @param {string} startDir
   * @returns {string} Real absolute path
   */
  findRepositoryRoot(startDir) {
    let current = path.resolve(startDir || process.cwd());
    try {
      current = fs.realpathSync(current);
    } catch {
      // keep current as is
    }

    const { root } = path.parse(current);
    let candidate = current;

    while (current && current !== root) {
      // Priority 1: .git folder or file
      if (fs.existsSync(path.join(current, '.git'))) {
        return current;
      }
      // Priority 2: monorepo workspace markers
      if (
        fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) ||
        fs.existsSync(path.join(current, 'lerna.json')) ||
        fs.existsSync(path.join(current, 'turbo.json')) ||
        fs.existsSync(path.join(current, 'nx.json'))
      ) {
        candidate = current;
      }
      // Check package.json for workspaces
      const pkgPath = path.join(current, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.workspaces) {
            candidate = current;
          }
        } catch {
          // ignore corrupted package.json
        }
      }

      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }

    return candidate;
  }

  /**
   * Builds the Workspace Evidence Graph for the given root directory.
   * @param {string} rootDir
   * @param {object} [options]
   * @returns {object} WorkspaceGraph
   */
  build(rootDir, options = {}) {
    const realRoot = this.findRepositoryRoot(rootDir);
    const posixRoot = toPosix(realRoot);
    let hitLimit = false;

    // Read workspace globs if defined (npm/yarn or pnpm)
    const workspaceGlobs = this._detectDeclaredWorkspaces(realRoot);

    const packages = [];
    const evidence = [];
    const packageIdSet = new Set();
    const manifestHashes = [];

    // Check root package
    const rootPkg = this._inspectDirectoryForPackage(realRoot, '.', realRoot);
    if (rootPkg) {
      packages.push(rootPkg);
      packageIdSet.add(rootPkg.id);
      manifestHashes.push(...rootPkg.manifestHashes);
    }

    // Traverse directory tree
    const visitedDirs = new Set();
    try {
      visitedDirs.add(fs.realpathSync(realRoot));
    } catch {
      visitedDirs.add(realRoot);
    }

    const walk = (currentDir, depth) => {
      if (packages.length >= this.maxPackages || depth > this.maxDepth) {
        hitLimit = true;
        return;
      }

      let entries;
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        if (this.ignoredDirs.has(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);
        let realEntryPath;
        try {
          realEntryPath = fs.realpathSync(fullPath);
        } catch {
          continue;
        }

        // Symlink escape guard: must remain within root realpath
        if (
          !realEntryPath.startsWith(visitedDirs.values().next().value) &&
          !realEntryPath.startsWith(realRoot)
        ) {
          continue;
        }

        if (visitedDirs.has(realEntryPath)) continue;
        visitedDirs.add(realEntryPath);

        const relPath = cleanRelative(path.relative(realRoot, fullPath));

        // Check if this directory is a package
        const isDeclared =
          workspaceGlobs.length === 0 ||
          workspaceGlobs.some((g) => g.test(relPath));

        const pkg = this._inspectDirectoryForPackage(fullPath, relPath, realRoot);
        if (pkg) {
          packages.push(pkg);
          packageIdSet.add(pkg.id);
          manifestHashes.push(...pkg.manifestHashes);
          if (packages.length >= this.maxPackages) {
            hitLimit = true;
            break;
          }
        }

        // Recurse into subdirectories (if not deeper than maxDepth)
        if (depth < this.maxDepth) {
          walk(fullPath, depth + 1);
        }
      }
    };

    walk(realRoot, 1);

    // Compute internal cross-package dependencies
    for (const pkg of packages) {
      pkg.internalDependencies = pkg.dependencies.filter(
        (dep) => packageIdSet.has(dep) && dep !== pkg.id
      );
      // Clean up internal hashes before returning
      delete pkg.manifestHashes;
    }

    // Sort packages deterministically by root path
    packages.sort((a, b) => a.root.localeCompare(b.root));

    // Compute deterministic fingerprint
    manifestHashes.sort();
    const fingerprint = crypto
      .createHash('sha256')
      .update(manifestHashes.join('\n') || realRoot)
      .digest('hex');

    // Aggregate baseline evidence for detected packages
    for (const pkg of packages) {
      for (const dep of pkg.dependencies) {
        evidence.push({
          target: dep,
          source: pkg.root === '.' ? 'root-package' : 'workspace-package',
          weight: pkg.root === '.' ? 20 : 30,
          description: `package ${pkg.id} (${pkg.ecosystem}) depends on ${dep}`
        });
      }
    }

    return {
      schemaVersion: 1,
      repositoryRoot: posixRoot,
      packages,
      evidence,
      fingerprint,
      partial: hitLimit
    };
  }

  /**
   * Finds the nearest enclosing package for a given file path.
   * Returns the package with the longest matching relative root prefix.
   * @param {string} filePath
   * @param {object} graph WorkspaceGraph
   * @returns {object|null}
   */
  findNearestPackage(filePath, graph) {
    if (!filePath || !graph || !Array.isArray(graph.packages)) return null;

    let targetRel = toPosix(filePath).trim();
    const repoRoot = toPosix(graph.repositoryRoot);

    // Handle absolute paths
    if (path.isAbsolute(filePath)) {
      if (process.platform === 'win32') {
        if (targetRel.toLowerCase().startsWith(repoRoot.toLowerCase() + '/')) {
          targetRel = targetRel.slice(repoRoot.length + 1);
        } else if (targetRel.toLowerCase() === repoRoot.toLowerCase()) {
          targetRel = '.';
        }
      } else {
        if (targetRel.startsWith(repoRoot + '/')) {
          targetRel = targetRel.slice(repoRoot.length + 1);
        } else if (targetRel === repoRoot) {
          targetRel = '.';
        }
      }
    }

    targetRel = cleanRelative(targetRel);

    let bestMatch = null;
    let longestPrefixLen = -1;

    for (const pkg of graph.packages) {
      const pkgRoot = cleanRelative(pkg.root);

      if (pkgRoot === '.') {
        // Root package matches everything as a baseline fallback
        if (longestPrefixLen < 0) {
          bestMatch = pkg;
          longestPrefixLen = 0;
        }
        continue;
      }

      // Check if targetRel is inside pkgRoot
      const isMatch =
        process.platform === 'win32'
          ? targetRel.toLowerCase() === pkgRoot.toLowerCase() ||
            targetRel.toLowerCase().startsWith(pkgRoot.toLowerCase() + '/')
          : targetRel === pkgRoot || targetRel.startsWith(pkgRoot + '/');

      if (isMatch) {
        if (pkgRoot.length > longestPrefixLen) {
          bestMatch = pkg;
          longestPrefixLen = pkgRoot.length;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Extracts evidence signals for a file based on its nearest enclosing package.
   * @param {string} filePath
   * @param {object} graph
   * @returns {Array<object>} Evidence items with nearest package weights
   */
  extractPackageEvidence(filePath, graph) {
    const pkg = this.findNearestPackage(filePath, graph);
    if (!pkg) return [];

    const evidence = [];

    // Dependencies in nearest package get high confidence weight (60)
    for (const dep of pkg.dependencies) {
      evidence.push({
        target: dep,
        source: 'nearest-package',
        weight: 60,
        description: `nearest workspace package "${dep}" in ${pkg.id}`
      });
    }

    // Config files in nearest package get weight 50
    for (const cfg of pkg.configs) {
      evidence.push({
        target: cfg,
        source: 'package-config',
        weight: 50,
        description: `package config "${cfg}" in ${pkg.id}`
      });
    }

    return evidence;
  }

  /**
   * Inspects a directory to determine if it is a package in any supported ecosystem.
   * @private
   */
  _inspectDirectoryForPackage(dirPath, relativeDir, repoRoot) {
    const cleanRel = cleanRelative(relativeDir);
    const manifests = [];
    const manifestHashes = [];
    const dependencies = new Set();
    const languages = new Set();
    let ecosystem = 'unknown';
    let id = cleanRel === '.' ? path.basename(repoRoot) : path.basename(dirPath);

    // 1. Node / NPM (package.json)
    const pkgJsonPath = path.join(dirPath, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const content = fs.readFileSync(pkgJsonPath, 'utf8');
        const parsed = JSON.parse(content);
        ecosystem = 'npm';
        manifests.push(cleanRel === '.' ? 'package.json' : `${cleanRel}/package.json`);
        manifestHashes.push(
          crypto.createHash('sha256').update(content).digest('hex')
        );

        if (parsed.name) id = parsed.name;

        // Collect all dependencies
        const allDeps = {
          ...parsed.dependencies,
          ...parsed.devDependencies,
          ...parsed.peerDependencies
        };
        for (const dep of Object.keys(allDeps)) {
          dependencies.add(dep);
        }
      } catch {
        // invalid package.json
      }
    }

    // 2. Python (pyproject.toml, requirements.txt, Pipfile, setup.py)
    const pyprojectPath = path.join(dirPath, 'pyproject.toml');
    const requirementsPath = path.join(dirPath, 'requirements.txt');
    const pipfilePath = path.join(dirPath, 'Pipfile');
    const setupPyPath = path.join(dirPath, 'setup.py');

    if (
      fs.existsSync(pyprojectPath) ||
      fs.existsSync(requirementsPath) ||
      fs.existsSync(pipfilePath) ||
      fs.existsSync(setupPyPath)
    ) {
      if (ecosystem === 'unknown') ecosystem = 'python';
      languages.add('python');

      if (fs.existsSync(pyprojectPath)) {
        try {
          const content = fs.readFileSync(pyprojectPath, 'utf8');
          manifests.push(cleanRel === '.' ? 'pyproject.toml' : `${cleanRel}/pyproject.toml`);
          manifestHashes.push(
            crypto.createHash('sha256').update(content).digest('hex')
          );
          const pyDeps = this._parsePyprojectDependencies(content);
          for (const d of pyDeps) dependencies.add(d);
          const nameMatch = content.match(/name\s*=\s*["']([^"']+)["']/);
          if (nameMatch && ecosystem === 'python') id = nameMatch[1];
        } catch {
          // ignore
        }
      }

      if (fs.existsSync(requirementsPath)) {
        try {
          const content = fs.readFileSync(requirementsPath, 'utf8');
          manifests.push(cleanRel === '.' ? 'requirements.txt' : `${cleanRel}/requirements.txt`);
          manifestHashes.push(
            crypto.createHash('sha256').update(content).digest('hex')
          );
          const reqDeps = this._parseRequirementsDependencies(content);
          for (const d of reqDeps) dependencies.add(d);
        } catch {
          // ignore
        }
      }
    }

    // 3. Rust (Cargo.toml)
    const cargoPath = path.join(dirPath, 'Cargo.toml');
    if (fs.existsSync(cargoPath)) {
      if (ecosystem === 'unknown') ecosystem = 'rust';
      languages.add('rust');
      try {
        const content = fs.readFileSync(cargoPath, 'utf8');
        manifests.push(cleanRel === '.' ? 'Cargo.toml' : `${cleanRel}/Cargo.toml`);
        manifestHashes.push(
          crypto.createHash('sha256').update(content).digest('hex')
        );
        const nameMatch = content.match(/\[package\][\s\S]*?name\s*=\s*["']([^"']+)["']/);
        if (nameMatch && ecosystem === 'rust') id = nameMatch[1];
        const cargoDeps = this._parseCargoDependencies(content);
        for (const d of cargoDeps) dependencies.add(d);
      } catch {
        // ignore
      }
    }

    // 4. Go (go.mod)
    const goModPath = path.join(dirPath, 'go.mod');
    if (fs.existsSync(goModPath)) {
      if (ecosystem === 'unknown') ecosystem = 'go';
      languages.add('go');
      try {
        const content = fs.readFileSync(goModPath, 'utf8');
        manifests.push(cleanRel === '.' ? 'go.mod' : `${cleanRel}/go.mod`);
        manifestHashes.push(
          crypto.createHash('sha256').update(content).digest('hex')
        );
        const modMatch = content.match(/module\s+([^\s\r\n]+)/);
        if (modMatch && ecosystem === 'go') id = modMatch[1];
        const goDeps = this._parseGoModDependencies(content);
        for (const d of goDeps) dependencies.add(d);
      } catch {
        // ignore
      }
    }

    // If no manifest found, not a package
    if (manifests.length === 0) {
      return null;
    }

    // Detect configs
    const configs = this._detectConfigs(dirPath, cleanRel);

    // Detect languages if not already determined
    this._detectLanguages(dirPath, languages);

    return {
      id,
      root: cleanRel,
      ecosystem,
      manifests,
      dependencies: Array.from(dependencies).sort(),
      configs: configs.sort(),
      languages: Array.from(languages).sort(),
      internalDependencies: [],
      manifestHashes
    };
  }

  /**
   * Detects declared workspace patterns from root manifest files.
   * @private
   */
  _detectDeclaredWorkspaces(rootDir) {
    const patterns = [];

    // Check package.json workspaces
    const pkgPath = path.join(rootDir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        let ws = pkg.workspaces;
        if (ws && typeof ws === 'object' && Array.isArray(ws.packages)) {
          ws = ws.packages;
        }
        if (Array.isArray(ws)) {
          for (const item of ws) {
            if (typeof item === 'string') {
              patterns.push(globToRegex(item));
            }
          }
        }
      } catch {
        // ignore
      }
    }

    // Check pnpm-workspace.yaml
    const pnpmPath = path.join(rootDir, 'pnpm-workspace.yaml');
    if (fs.existsSync(pnpmPath)) {
      try {
        const content = fs.readFileSync(pnpmPath, 'utf8');
        const lines = content.split(/\r?\n/);
        let inPackages = false;
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('packages:')) {
            inPackages = true;
            continue;
          }
          if (inPackages) {
            if (trimmed.startsWith('-')) {
              const val = trimmed.replace(/^-\s*/, '').replace(/['"]/g, '').trim();
              if (val && !val.startsWith('!')) {
                patterns.push(globToRegex(val));
              }
            } else if (trimmed && !trimmed.startsWith('#')) {
              inPackages = false;
            }
          }
        }
      } catch {
        // ignore
      }
    }

    return patterns;
  }

  /**
   * Detects known configuration files in a package directory.
   * @private
   */
  _detectConfigs(dirPath, relativeDir) {
    const configs = [];
    for (const cfg of KNOWN_CONFIG_FILES) {
      const fullPath = path.join(dirPath, cfg);
      if (fs.existsSync(fullPath)) {
        configs.push(relativeDir === '.' ? cfg : `${relativeDir}/${cfg}`);
      }
    }
    return configs;
  }

  /**
   * Scans shallowly for language indicators in the package directory.
   * @private
   */
  _detectLanguages(dirPath, languagesSet) {
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === '.ts' || ext === '.tsx') {
          languagesSet.add('typescript');
        } else if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') {
          languagesSet.add('javascript');
        } else if (ext === '.py') {
          languagesSet.add('python');
        } else if (ext === '.rs') {
          languagesSet.add('rust');
        } else if (ext === '.go') {
          languagesSet.add('go');
        }
      }
    }
  }

  /**
   * Parses dependencies from requirements.txt content.
   * @private
   */
  _parseRequirementsDependencies(content) {
    const deps = [];
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const clean = line.split('#')[0].trim();
      if (!clean) continue;
      const match = clean.match(/^([a-zA-Z0-9_\-\.]+)/);
      if (match) {
        deps.push(match[1].toLowerCase());
      }
    }
    return deps;
  }

  /**
   * Parses dependencies from pyproject.toml content.
   * @private
   */
  _parsePyprojectDependencies(content) {
    const deps = [];
    // Match dependencies array: dependencies = [ "foo>=1.0", "bar" ]
    const arrayMatch = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (arrayMatch) {
      const inner = arrayMatch[1];
      const items = inner.match(/["']([^"']+)["']/g) || [];
      for (const item of items) {
        const raw = item.replace(/["']/g, '').trim();
        const m = raw.match(/^([a-zA-Z0-9_\-\.]+)/);
        if (m) deps.push(m[1].toLowerCase());
      }
    }

    // Match poetry dependencies [tool.poetry.dependencies]
    const poetrySection = content.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(?=\n\[|$)/);
    if (poetrySection) {
      const lines = poetrySection[1].split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^([a-zA-Z0-9_\-\.]+)\s*=/);
        if (m && m[1].toLowerCase() !== 'python') {
          deps.push(m[1].toLowerCase());
        }
      }
    }

    return deps;
  }

  /**
   * Parses dependencies from Cargo.toml content.
   * @private
   */
  _parseCargoDependencies(content) {
    const deps = [];
    const depSection = content.match(/\[(?:workspace\.)?dependencies\]([\s\S]*?)(?=\n\[|$)/);
    if (depSection) {
      const lines = depSection[1].split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const m = trimmed.match(/^([a-zA-Z0-9_\-]+)\s*=/);
        if (m) deps.push(m[1]);
      }
    }
    return deps;
  }

  /**
   * Parses dependencies from go.mod content.
   * @private
   */
  _parseGoModDependencies(content) {
    const deps = [];
    // Match single require
    const singleMatches = content.matchAll(/require\s+([^\s\r\n]+)\s+/g);
    for (const m of singleMatches) {
      deps.push(m[1]);
    }
    // Match require block
    const blockMatch = content.match(/require\s*\(([\s\S]*?)\)/);
    if (blockMatch) {
      const lines = blockMatch[1].split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        const m = trimmed.match(/^([^\s]+)/);
        if (m) deps.push(m[1]);
      }
    }
    return deps;
  }
}

module.exports = {
  WorkspaceGraphBuilder,
  toPosix,
  cleanRelative,
  globToRegex,
  DEFAULT_IGNORED_DIRS,
  KNOWN_CONFIG_FILES
};
