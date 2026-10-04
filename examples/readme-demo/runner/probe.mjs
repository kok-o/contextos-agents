/**
 * Native-loader preflight. Runs only inside a disposable container.
 * No real credentials are read or required. The HTTP capture server answers 418
 * instead of returning a generated response, so no model inference occurs.
 * Input: /fixture read-only; output: /out; optional /task.txt read-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const out = '/out';
fs.mkdirSync(out, { recursive: true });
fs.cpSync('/fixture', '/workspace', {
  recursive: true,
  filter: (source) => !['node_modules', '.git'].includes(path.basename(source)),
});
fs.copyFileSync('/opt/demo/runtime-config.toml', '/home/node/.codex/config.toml');
const git = spawnSync('git', ['init', '--quiet', '/workspace'], { encoding: 'utf8' });
if (git.status !== 0) throw new Error(git.stderr);

const task = fs.existsSync('/task.txt')
  ? fs.readFileSync('/task.txt', 'utf8').trim()
  : 'Improve item name normalization in createOrder in src/order.ts. Preserve the public API, add regression tests, and run the tests. Do not install new dependencies.';
const env = {
  PATH: process.env.PATH,
  HOME: '/home/node',
  CODEX_HOME: '/home/node/.codex',
  LANG: 'C.UTF-8',
  TERM: 'dumb',
};
const run = (args, name) => {
  const result = spawnSync('codex', args, { cwd: '/workspace', env, encoding: 'utf8', timeout: 45000, maxBuffer: 8 * 1024 * 1024 });
  fs.writeFileSync(`${out}/${name}.stdout`, result.stdout || '');
  fs.writeFileSync(`${out}/${name}.stderr`, result.stderr || '');
  return { args, exit_code: result.status, signal: result.signal, error: result.error?.message };
};

const inventory = {};
for (const [command, args] of [['node', ['--version']], ['npm', ['--version']], ['codex', ['--version']], ['git', ['--version']], ['rg', ['--version']], ['python3', ['--version']]]) {
  const result = spawnSync(command, args, { encoding: 'utf8', env });
  inventory[command] = { exit_code: result.status, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}
fs.writeFileSync(`${out}/inventory.json`, JSON.stringify(inventory, null, 2));
const records = [
  run(['exec', '--help'], 'exec-help'),
  // 0.149.1 rejects --strict-config on diagnostics. The exec capture below
  // validates the same config with --strict-config enabled.
  run(['features', 'list'], 'features'),
  run(['debug', 'prompt-input', task], 'prompt-input'),
];

let requestCount = 0;
const server = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    requestCount++;
    const body = Buffer.concat(chunks).toString('utf8');
    const prefix = `${out}/request-${requestCount}`;
    fs.writeFileSync(`${prefix}.json`, body);
    // Deliberately omit all request headers; credentials never enter artifacts.
    fs.writeFileSync(`${prefix}-meta.json`, JSON.stringify({ method: req.method, url: req.url, sha256: createHash('sha256').update(body).digest('hex') }, null, 2));
    res.writeHead(418, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'LOCAL_DISCOVERY_PROBE_NO_MODEL_INFERENCE', type: 'probe_only' } }));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const args = ['--strict-config', 'exec', '--json', '--color', 'never', '--ignore-rules',
  '-c', 'model_provider="local_capture"',
  '-c', 'model_providers.local_capture.name="Local capture - no inference"',
  '-c', `model_providers.local_capture.base_url="http://127.0.0.1:${port}/v1"`,
  '-c', 'model_providers.local_capture.wire_api="responses"',
  '-c', 'model_providers.local_capture.requires_openai_auth=false',
  '-c', 'model_providers.local_capture.request_max_retries=0',
  '-c', 'model_providers.local_capture.stream_max_retries=0',
  '-c', 'model_providers.local_capture.supports_websockets=false',
  task];
const started = new Date().toISOString();
const child = spawn('codex', args, { cwd: '/workspace', env, stdio: ['ignore', 'pipe', 'pipe'] });
let stdout = '', stderr = '';
child.stdout.on('data', data => { stdout += data; });
child.stderr.on('data', data => { stderr += data; });
const timer = setTimeout(() => child.kill('SIGKILL'), 45000);
const result = await new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
clearTimeout(timer);
server.close();
fs.writeFileSync(`${out}/capture.stdout`, stdout);
fs.writeFileSync(`${out}/capture.stderr`, stderr);
records.push({ args, exit_code: result.code, signal: result.signal, started_at: started, ended_at: new Date().toISOString(), request_count: requestCount });
fs.writeFileSync(`${out}/commands.json`, JSON.stringify(records, null, 2));
console.log(JSON.stringify({ inference: false, request_count: requestCount, debug_exit_code: records[2].exit_code, capture_exit_code: result.code, output: out }));
if (requestCount !== 1 || records[2].exit_code !== 0) process.exitCode = 1;
