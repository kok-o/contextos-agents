'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const root = path.resolve(process.argv[2] || '.');
const runtimePaths = ['.agents/.contextos', '.contextos-session', '.contextos-worktrees'];
const before = runtimePaths.map(file => fs.existsSync(path.join(root, file)));
const child = spawn(process.execPath, [path.join(root, 'node_modules/@contextos/mcp/bin/mcp.mjs')], {
  cwd: root, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true,
});
const input = readline.createInterface({ input: child.stdout });
let stage = 0;
let finished = false;
function finish(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  input.close();
  child.stdin.end();
  child.kill();
  if (error) { console.error(error.message); process.exitCode = 1; }
}
function send(message) { child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n'); }
const timer = setTimeout(() => finish(new Error('Installed MCP handshake timed out')), 15000);
child.on('error', error => finish(error));
child.stdin.on('error', error => finish(error));
child.on('exit', () => { if (!finished) finish(new Error('Installed MCP exited before protocol checks completed')); });
input.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  try {
    if (message.error) throw new Error('Installed MCP rejected the protocol request');
    if (message.id === 1 && stage === 0) {
      assert.ok(message.result?.protocolVersion);
      stage = 1;
      send({ method: 'notifications/initialized' });
      send({ id: 2, method: 'tools/list', params: {} });
    } else if (message.id === 2 && stage === 1) {
      const names = message.result.tools.map(tool => tool.name).sort();
      assert.deepEqual(names, ['contextos_compare', 'contextos_diff', 'contextos_status']);
      stage = 2;
      send({ id: 3, method: 'tools/call', params: { name: 'contextos_status', arguments: { dir: root } } });
    } else if (message.id === 3 && stage === 2) {
      assert.equal(Boolean(message.result.isError), false);
      const status = JSON.parse(message.result.content.find(block => block.type === 'text').text);
      assert.equal(path.resolve(status.dir), root);
      assert.equal(status.counts.total, 0);
      assert.deepEqual(runtimePaths.map(file => fs.existsSync(path.join(root, file))), before);
      fs.writeFileSync(path.join(root, 'mcp-handshake.json'), JSON.stringify({
        result: 'PASS', installedVersion: require(path.join(root, 'node_modules/@contextos/mcp/package.json')).version,
        tools: ['contextos_compare', 'contextos_diff', 'contextos_status'], statusCall: 'PASS',
        runtimePathsUnchanged: true, runtimeRequests: 0,
      }, null, 2));
      console.log('Installed MCP handshake and read-only status: PASS');
      finish();
    }
  } catch (error) { finish(error); }
});
send({ id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'contextos-release-check', version: '1.0.0' } } });
