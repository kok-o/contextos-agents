#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { ROOT, hash } = require('./luna/fixture');
const { Budget, PRICING, atomicJson } = require('./luna/spending');
const { redact } = require('./luna/client');

function prepare(parent) {
  fs.mkdirSync(parent, { recursive: true });
  const root = fs.mkdtempSync(path.join(parent, 'native-'));
  const project = path.join(root, 'project'), home = path.join(root, 'codex-home');
  fs.mkdirSync(home); fs.mkdirSync(project);
  const initialized = spawnSync('git', ['init', '--quiet', project], { windowsHide: true, encoding: 'utf8' });
  if (initialized.status !== 0) throw new Error('Could not establish the native fixture repository boundary');
  fs.cpSync(path.join(ROOT, '.agents/skills'), path.join(project, '.agents/skills'), { recursive: true });
  fs.writeFileSync(path.join(project, 'AGENTS.md'), 'This is a harmless read-only native skill activation probe. Follow the explicitly requested skills. Do not edit files or delegate tasks.\n');
  const marker = `CONTEXTOS_NATIVE_${crypto.randomBytes(16).toString('hex')}`;
  const probe = path.join(project, '.agents/skills/contextos-native-probe/SKILL.md');
  fs.mkdirSync(path.dirname(probe));
  fs.writeFileSync(probe, `---\nname: contextos-native-probe\ndescription: A read-only native skill activation check; use when explicitly requested.\n---\n\nFor this probe return exactly this marker: ${marker}\nDo not run shell commands, edit files, or contact external services.\n`);
  const workflow = fs.readFileSync(path.join(project, '.agents/skills/engineering-workflow/SKILL.md'), 'utf8');
  const cachePath = path.join(process.env.CODEX_HOME || path.join(process.env.USERPROFILE || process.env.HOME, '.codex'), 'models_cache.json');
  let catalog = null;
  if (fs.existsSync(cachePath)) {
    const model = (JSON.parse(fs.readFileSync(cachePath, 'utf8')).models || []).find(item => item.slug === PRICING.model);
    if (model) { catalog = path.join(root, 'model-catalog.json'); atomicJson(catalog, { models: [model] }); }
  }
  return { root, project, home, marker, workflow, catalog, workflowSha256: hash(workflow) };
}

function completedResponse(text, streaming) {
  if (!streaming) return JSON.parse(text);
  for (const line of text.split(/\r?\n/).reverse()) {
    if (!line.startsWith('data: ')) continue;
    try {
      const event = JSON.parse(line.slice(6));
      if (event.type === 'response.completed') return event.response;
    } catch { /* Other SSE events are not billing completion evidence. */ }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--prepare-only', '--capture-only'].includes(arg)) || args.length > 1) throw new Error('Usage: node benchmarks/run-luna-native.js [--prepare-only|--capture-only]');
  const captureOnly = args.includes('--capture-only');
  const fixture = prepare(path.join(ROOT, 'scratch/luna-native'));
  atomicJson(path.join(fixture.root, 'preparation.json'), { timestamp: new Date().toISOString(), model: PRICING.model, workflowSha256: fixture.workflowSha256, paidRequests: 0, result: 'PREPARED', limitation: 'Preparation is not activation evidence.' });
  if (args.includes('--prepare-only')) { console.log(`Native fixture prepared: ${fixture.root}; no inference requests.`); return; }
  if (!captureOnly && !process.env.OPENAI_API_KEY) throw new Error('Use the masked launcher with -Mode native to supply the API key.');
  const shared = path.join(ROOT, 'scratch/live-benchmark'); fs.mkdirSync(shared, { recursive: true });
  const lockPath = path.join(shared, 'run.lock'), lock = fs.openSync(lockPath, 'wx');
  let budget;
  const localToken = crypto.randomBytes(24).toString('hex');
  const calls = []; let child, timer, timedOut = false, requestBusy = false, clientError = null;
  const server = http.createServer(async (incoming, outgoing) => {
    if (incoming.headers.authorization !== `Bearer ${localToken}` || incoming.url !== '/v1/responses' || incoming.method !== 'POST' || requestBusy || calls.length >= 6) {
      outgoing.writeHead(403); outgoing.end('Native probe request refused'); return;
    }
    requestBusy = true;
    try {
      let raw = '';
      for await (const chunk of incoming) { raw += chunk; if (Buffer.byteLength(raw) > 190000) throw new Error('Native request size limit'); }
      const body = JSON.parse(raw);
      const unbilled = tool => ['function', 'custom'].includes(tool.type) || (tool.type === 'namespace' && Array.isArray(tool.tools) && tool.tools.every(unbilled));
      if (body.model !== PRICING.model || (!captureOnly && (body.tools || []).some(tool => !unbilled(tool)))) throw new Error('Native probe only allows the pinned text model and unbilled client tools');
      body.max_output_tokens = 4096; body.store = false; body.service_tier = 'default'; body.reasoning = { ...(body.reasoning || {}), effort: 'medium' };
      if (captureOnly) {
        calls.push({ request: body, forwarded: false, response: null, charge: null, reservedMicroUsd: 0 });
        atomicJson(path.join(fixture.root, `request-${calls.length}.json`), calls.at(-1));
        outgoing.writeHead(400, { 'Content-Type': 'application/json' });
        outgoing.end(JSON.stringify({ error: { message: 'Capture-only probe: native request recorded locally; no OpenAI inference requested.', type: 'capture_only_probe' } }));
        return;
      }
      const ticket = budget.reserve(body);
      const call = { request: body, forwarded: true, reservedMicroUsd: ticket.amount, response: null, charge: null };
      calls.push(call);
      atomicJson(path.join(fixture.root, `request-${calls.length}.json`), call);
      const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const text = await response.text();
      if (!response.ok) { call.error = `OpenAI HTTP ${response.status}: ${redact(text).slice(0, 2000)}`; clientError = call.error; }
      else {
        const completed = completedResponse(text, body.stream);
        call.response = completed;
        if (completed) call.charge = budget.settle(ticket, completed);
        else clientError = 'No verified completed response; reservation retained';
        fs.writeFileSync(path.join(fixture.root, `wire-response-${calls.length}.${body.stream ? 'sse' : 'json'}`), text);
      }
      atomicJson(path.join(fixture.root, `request-${calls.length}.json`), call);
      outgoing.writeHead(response.status, { 'Content-Type': body.stream ? 'text/event-stream' : 'application/json' }); outgoing.end(text);
    } catch (error) {
      clientError = redact(error.message); outgoing.writeHead(502, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ error: { message: clientError, type: 'benchmark_proxy_error' } }));
    } finally { requestBusy = false; }
  });
  try {
    budget = new Budget(path.join(shared, 'spend-ledger.json'));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const env = { CODEX_HOME: fixture.home, HOME: fixture.home, USERPROFILE: fixture.home, BENCH_PROXY_KEY: localToken };
    for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
    const cliArgs = ['exec', '--json', '--ephemeral', '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--sandbox', 'read-only', '--model', PRICING.model, '--cd', fixture.project,
      '-c', 'model_provider="benchmark_proxy"', '-c', 'model_providers.benchmark_proxy.name="Budgeted native probe"',
      '-c', `model_providers.benchmark_proxy.base_url="http://127.0.0.1:${port}/v1"`, '-c', 'model_providers.benchmark_proxy.env_key="BENCH_PROXY_KEY"',
      '-c', 'model_providers.benchmark_proxy.wire_api="responses"', '-c', 'model_providers.benchmark_proxy.request_max_retries=0', '-c', 'model_providers.benchmark_proxy.stream_max_retries=0', '-'];
    cliArgs.splice(cliArgs.length - 1, 0, '-c', 'web_search="disabled"', '-c', 'features.multi_agent=false', '-c', 'features.apps=false');
    if (fixture.catalog) cliArgs.splice(cliArgs.length - 1, 0, '-c', `model_catalog_json=${JSON.stringify(fixture.catalog.replace(/\\/g, '/'))}`);
    child = spawn(process.platform === 'win32' ? 'codex.exe' : 'codex', cliArgs, { cwd: fixture.project, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [], stderr = [];
    child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
    child.stdin.on('error', () => {});
    timer = setTimeout(() => { timedOut = true; child.kill(); }, 240000);
    child.stdin.end('$engineering-workflow $contextos-native-probe\nExecute these explicitly named skills for a harmless native activation check. Return only the marker defined inside the probe skill. Do not run shell commands, edit files, delegate work, install packages, or contact external services.');
    const exitCode = await new Promise((resolve, reject) => { child.on('close', resolve); child.on('error', reject); });
    clearTimeout(timer);
    const output = Buffer.concat(stdout).toString(), errors = redact(Buffer.concat(stderr).toString());
    fs.writeFileSync(path.join(fixture.root, 'events.jsonl'), output); fs.writeFileSync(path.join(fixture.root, 'stderr.log'), errors);
    const events = output.split(/\r?\n/).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } });
    const finalMessages = events.filter(event => event.type === 'item.completed' && event.item?.type === 'agent_message').map(event => event.item.text);
    const workflowBody = fixture.workflow.replace(/^---[\s\S]*?---\s*/, '').trim().replace(/\r\n/g, '\n');
    const requestTexts = calls.map(call => JSON.stringify(call.request));
    const workflowBodyLoaded = requestTexts.some(text => text.replace(/\\r\\n/g, '\\n').includes(JSON.stringify(workflowBody).slice(1, -1)));
    const probeBodyLoaded = requestTexts.some(text => text.includes(fixture.marker));
    const markerReturned = finalMessages.some(text => text.trim() === fixture.marker);
    const actionEvents = events.filter(event => event.item && ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(event.item.type));
    const passed = exitCode === 0 && !timedOut && !clientError && workflowBodyLoaded && probeBodyLoaded && markerReturned && actionEvents.length === 0 && calls.length > 0;
    const injectionPassed = !timedOut && workflowBodyLoaded && probeBodyLoaded && actionEvents.length === 0 && calls.length > 0;
    const report = { timestamp: new Date().toISOString(), model: PRICING.model, captureOnly, result: captureOnly ? injectionPassed ? 'BODY_INJECTION_PASS' : 'BODY_INJECTION_FAIL' : passed ? 'PASS' : 'FAIL', exitCode, timedOut, clientError,
      workflowBodyLoaded, probeBodyLoaded, markerReturned, unexpectedActionEvents: actionEvents, workflowSha256: fixture.workflowSha256,
      paidRequests: calls.filter(call => call.forwarded).length, nativeRequestsCaptured: calls.length, calls: calls.map(({ charge, reservedMicroUsd, response }) => ({ charge, reservedMicroUsd, usage: response?.usage ?? null })),
      remainingSharedBudgetUsd: budget.remainingUsd, limitation: captureOnly ? 'Actual native CLI request assembly captured locally. No model inference or marker adherence was tested; the CLI error is intentional. Does not establish automatic routing or Cursor activation.' : 'Explicit native skill body activation in this Codex CLI fixture only. Does not establish automatic task routing, adherence in coding tasks, or Cursor activation.' };
    atomicJson(path.join(fixture.root, 'report.json'), report);
    console.log(`Native activation: ${report.result}; report ${path.join(fixture.root, 'report.json')}`);
    if (!(captureOnly ? injectionPassed : passed)) process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    child?.kill(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    fs.closeSync(lock); fs.unlinkSync(lockPath);
  }
}

if (require.main === module) main().catch(error => { console.error(redact(error.message)); process.exitCode = 1; });
module.exports = { prepare, completedResponse };
