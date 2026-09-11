#!/usr/bin/env node
/**
 * scan-codebase.mjs
 * Scans repository routes, middleware, and rendering directives for Vercel optimization.
 *
 * Usage:
 *   node scripts/scan-codebase.mjs <repo-root> [--out <file>] [--help]
 */

import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, relative, basename } from 'node:path';

function printHelp() {
  console.log(`
scan-codebase.mjs — Vercel Codebase Route & Config Scanner

Usage:
  node scripts/scan-codebase.mjs <repo-root> [options]

Arguments:
  repo-root              Path to the repository root directory to scan

Options:
  --out <file>           Output file path (default: stdout)
  --help, -h             Show this help message
`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  printHelp();
  process.exit(0);
}

let repoRoot = null;
let outFile = null;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--out' && i + 1 < args.length) {
    outFile = args[++i];
  } else if (!arg.startsWith('-') && !repoRoot) {
    repoRoot = resolve(process.cwd(), arg);
  }
}

if (!repoRoot || !existsSync(repoRoot)) {
  console.error(`Error: Repository path not found: ${repoRoot}`);
  process.exit(1);
}

// Detect framework
let framework = 'unknown';
const pkgPath = join(repoRoot, 'package.json');
if (existsSync(pkgPath)) {
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    if (deps.next) framework = 'nextjs';
    else if (deps['@sveltejs/kit']) framework = 'sveltekit';
    else if (deps.nuxt) framework = 'nuxt';
    else if (deps.astro) framework = 'astro';
    else if (deps.react) framework = 'react';
  } catch {
    // Ignore error
  }
}

const routes = [];
const middleware = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist') {
      continue;
    }
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile()) {
      const relPath = relative(repoRoot, fullPath).replace(/\\/g, '/');
      const filename = basename(entry.name);

      // Check middleware
      if (/^middleware\.(ts|js|mjs)$/.test(filename) || /^src\/middleware\.(ts|js|mjs)$/.test(relPath)) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          middleware.push({
            file: relPath,
            hasMatcher: content.includes('matcher:'),
            runtime: content.includes("runtime = 'edge'") ? 'edge' : 'nodejs'
          });
        } catch {}
      }

      // Check App Router route handlers
      if (/^(route|page)\.(ts|tsx|js|jsx)$/.test(filename) && (relPath.includes('app/') || relPath.includes('src/app/'))) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          const isRoute = filename.startsWith('route');
          const isDynamic = content.includes("dynamic = 'force-dynamic'") || content.includes('export const dynamic = "force-dynamic"');
          const isStatic = content.includes("dynamic = 'force-static'") || content.includes('export const dynamic = "force-static"');
          const hasRevalidate = /revalidate\s*=\s*(\d+)/.test(content);
          const revalidateVal = hasRevalidate ? parseInt(content.match(/revalidate\s*=\s*(\d+)/)[1], 10) : null;
          const runtime = content.includes("runtime = 'edge'") ? 'edge' : 'nodejs';

          // Extract route pattern
          let routeUrl = relPath
            .replace(/^(src\/)?app/, '')
            .replace(/\/(route|page)\.(ts|tsx|js|jsx)$/, '');
          if (!routeUrl.startsWith('/')) routeUrl = '/' + routeUrl;
          if (routeUrl === '') routeUrl = '/';

          routes.push({
            type: isRoute ? 'api-route' : 'page-route',
            route: routeUrl,
            file: relPath,
            dynamic: isDynamic ? 'force-dynamic' : (isStatic ? 'force-static' : 'auto'),
            revalidate: revalidateVal,
            runtime
          });
        } catch {}
      }

      // Check Pages Router API handlers
      if ((relPath.includes('pages/api/') || relPath.includes('src/pages/api/')) && /\.(ts|js)$/.test(filename)) {
        try {
          const content = readFileSync(fullPath, 'utf8');
          let routeUrl = relPath
            .replace(/^(src\/)?pages/, '')
            .replace(/\.(ts|js)$/, '');
          if (routeUrl.endsWith('/index')) routeUrl = routeUrl.slice(0, -6);

          routes.push({
            type: 'api-route',
            route: routeUrl,
            file: relPath,
            dynamic: 'pages-api',
            runtime: content.includes("runtime = 'edge'") ? 'edge' : 'nodejs'
          });
        } catch {}
      }
    }
  }
}

walk(repoRoot);

const result = {
  timestamp: new Date().toISOString(),
  repoRoot: relative(process.cwd(), repoRoot).replace(/\\/g, '/') || '.',
  framework,
  summary: {
    totalRoutes: routes.length,
    apiRoutes: routes.filter(r => r.type === 'api-route').length,
    pageRoutes: routes.filter(r => r.type === 'page-route').length,
    middlewareCount: middleware.length
  },
  middleware,
  routes
};

const outputJson = JSON.stringify(result, null, 2);
if (outFile) {
  writeFileSync(resolve(process.cwd(), outFile), outputJson, 'utf8');
} else {
  console.log(outputJson);
}
