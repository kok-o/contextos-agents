'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

describe('W2.1: Resolver CLI/MCP Parity', () => {
  const rootDir = path.resolve(__dirname, '..');
  const ctxPath = path.join(rootDir, '.agents', 'ctx.js');

  function getMcpSelector() {
    // Always exercise current source: an ignored, stale dist must not mask drift.
    const tsPath = path.resolve(__dirname, '../contextos-mcp/src/contextos/selector.ts');
    if (fs.existsSync(tsPath)) {
      const { pathToFileURL } = require('url');
      const esbuild = require('esbuild');
      const result = esbuild.buildSync({
        entryPoints: [tsPath],
        write: false,
        format: 'cjs',
        platform: 'node',
        target: 'node20',
        define: {
          'import.meta.url': JSON.stringify(pathToFileURL(tsPath).href),
        },
      });
      const code = result.outputFiles[0].text;
      const m = new module.constructor();
      m.paths = module.paths;
      m.filename = tsPath;
      m._compile(code, tsPath);
      return m.exports.selectContext;
    }
    throw new Error(`MCP selector source not found at ${tsPath}`);
  }

  test('parity corpus tests', () => {
    // Compile in memory so this gate is identical in a fresh checkout and locally.
    const selectContext = getMcpSelector();

    const fixturesPath = path.join(__dirname, 'fixtures', 'resolver');
    const files = fs.readdirSync(fixturesPath).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const fixture = JSON.parse(fs.readFileSync(path.join(fixturesPath, file), 'utf8'));

      // 1. Run CLI
      const args = ['resolve', fixture.task, '--json'];
      if (fixture.files && fixture.files.length > 0) {
        args.push('--files', fixture.files.join(','));
      }
      if (fixture.contextBudgetTokens !== undefined) {
        args.push('--budget', fixture.contextBudgetTokens.toString());
      }
      
      const cliOutput = execFileSync(process.execPath, [ctxPath, ...args], { encoding: 'utf8' });
      const cliResult = JSON.parse(cliOutput);

      // 2. Run MCP selectContext
      const mcpResult = selectContext(fixture.task, {
        files: fixture.files || [],
        contextBudgetTokens: fixture.contextBudgetTokens
      });

      // 3. Compare selection
      const cliSkills = cliResult.selected.map(s => s.id).sort();
      const mcpSkills = [...mcpResult.skills].sort();

      assert.deepEqual(mcpSkills, cliSkills, `Parity mismatch for fixture: ${file}`);
    }
  });
});
