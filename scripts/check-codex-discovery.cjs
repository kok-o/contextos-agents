#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const ROOT = path.resolve(__dirname, '..');
const child = spawn(process.platform === 'win32' ? 'codex.exe' : 'codex', ['app-server', '--stdio'], { cwd: ROOT, stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
const pending = new Map();
let nextId = 1;
const lines = readline.createInterface({ input: child.stdout });
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const handler = pending.get(message.id);
  if (handler) {
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(`Codex RPC error ${message.error.code}`));
    else handler.resolve(message.result);
  }
});
function request(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  });
}
const timer = setTimeout(() => {
  for (const handler of pending.values()) handler.reject(new Error('Codex discovery timed out'));
  child.kill();
}, 45000);
child.on('error', () => {
  for (const handler of pending.values()) handler.reject(new Error('Unable to launch Codex CLI'));
});
(async () => {
  try {
    const initialized = await request('initialize', { clientInfo: { name: 'contextos_discovery_check', title: 'ContextOS local discovery check', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} })}\n`);
    const result = await request('skills/list', { cwds: [ROOT], forceReload: true });
    const discovered = (result.data || []).flatMap(item => item.skills || [])
      .filter(skill => path.resolve(skill.path || '').toLowerCase().startsWith(path.join(ROOT, '.agents', 'skills').toLowerCase() + path.sep))
      .map(skill => ({ id: path.basename(path.dirname(skill.path)), name: skill.name, path: path.relative(ROOT, skill.path).replace(/\\/g, '/'), description: skill.description, enabled: skill.enabled }));
    const expected = fs.readdirSync(path.join(ROOT, '.agents/skills'), { withFileTypes: true }).filter(entry => entry.isDirectory() && fs.existsSync(path.join(ROOT, '.agents/skills', entry.name, 'SKILL.md'))).map(entry => entry.name);
    const missing = expected.filter(id => !discovered.some(skill => skill.id === id));
    const report = { timestamp: new Date().toISOString(), userAgent: initialized.userAgent, method: 'skills/list', inferenceRequests: 0, expected, discovered, missing, result: missing.length ? 'FAIL' : 'PASS', limitation: 'Native metadata discovery only. Does not prove body activation, instruction adherence, or Cursor loading.' };
    const output = path.join(ROOT, 'scratch', 'codex-discovery.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2));
    console.log(`Codex native discovery: ${report.result}; ${discovered.length}/${expected.length} local skills. Report: ${output}`);
    if (missing.length) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    lines.close();
    child.stdin.end();
    child.kill();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
