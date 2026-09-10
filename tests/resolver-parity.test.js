'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

describe('W2.1: Resolver CLI/MCP Parity', () => {
  const rootDir = path.resolve(__dirname, '..');
  const ctxPath = path.join(rootDir, '.agents', 'ctx.js');

  test('parity corpus tests', () => {
    // dynamically import the MCP selector (it is compiled to CommonJS in dist)
    const { selectContext } = require('../contextos-mcp/dist/contextos/selector.js');

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
