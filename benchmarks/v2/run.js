#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { LLMClient } = require('../lib/llm-client');
const { normalizeUsage } = require('../lib/usage');
const { ARMS } = require('./arms/arm-definitions');
const { API_BENCHMARK_TASKS } = require('./tasks');
const { buildPromptContext, buildTaskPrompt } = require('./harness/prompts');
const { runApiBenchmark, evaluateChatResponses } = require('./harness/api-runner');

const ROOT = path.resolve(__dirname, '../..');
const ARM_ALIASES = {
  a: ARMS.ARM_A_VANILLA,
  b: ARMS.ARM_B_CONCISE_CHECKLIST,
  c: ARMS.ARM_C_CONTEXTOS_CORE,
  d: ARMS.ARM_D_EXPANDED_GUIDANCE,
  ...Object.fromEntries(Object.values(ARMS).map(arm => [arm.id, arm])),
};

function parseArgs(argv) {
  const options = {
    mode: 'api',
    provider: '',
    model: '',
    apiKey: '',
    baseUrl: '',
    task: 'all',
    arms: ['a', 'b', 'c', 'd'],
    maxTokens: 4096,
    repeats: 1,
    output: path.join(ROOT, 'benchmarks', 'results', 'v2'),
    responses: '',
    manifest: '',
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--mode') options.mode = next().toLowerCase();
    else if (arg === '--provider') options.provider = next().toLowerCase();
    else if (arg === '--model') options.model = next();
    else if (arg === '--api-key' || arg === '--key') options.apiKey = next();
    else if (arg === '--base-url') options.baseUrl = next();
    else if (arg === '--task') options.task = next();
    else if (arg === '--arms') options.arms = next().split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
    else if (arg === '--max-tokens') options.maxTokens = Number(next());
    else if (arg === '--repeats') options.repeats = Number(next());
    else if (arg === '--output') options.output = path.resolve(next());
    else if (arg === '--responses') options.responses = path.resolve(next());
    else if (arg === '--manifest') options.manifest = path.resolve(next());
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  if (!['api', 'chat-pack', 'chat-eval'].includes(options.mode)) throw new Error('--mode must be api, chat-pack, or chat-eval');
  if (!Number.isSafeInteger(options.maxTokens) || options.maxTokens < 1) throw new Error('--max-tokens must be a positive integer');
  if (!Number.isSafeInteger(options.repeats) || options.repeats < 1 || options.repeats > 100) throw new Error('--repeats must be an integer from 1 to 100');
  if (options.mode !== 'api' && options.repeats !== 1) throw new Error('--repeats is supported in API mode only');
  if (options.arms.length === 0 || options.arms.some(arm => !ARM_ALIASES[arm])) {
    throw new Error('--arms must contain one or more of a,b,c,d or full arm ids');
  }
  options.arms = [...new Map(options.arms.map(alias => [ARM_ALIASES[alias].id, ARM_ALIASES[alias]])).values()];
  return options;
}

function selectTasks(taskId) {
  if (taskId === 'all') return API_BENCHMARK_TASKS;
  const task = API_BENCHMARK_TASKS.find(item => item.id === taskId);
  if (!task) throw new Error(`Unknown task "${taskId}". Available tasks: ${API_BENCHMARK_TASKS.map(item => item.id).join(', ')}`);
  return [task];
}

function safeSegment(value) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error(`Unsafe path segment: ${value}`);
  return value;
}

function gitCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function writeChatPack(options, tasks) {
  const runId = `chat-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const promptsDir = path.join(options.output, 'prompts');
  fs.mkdirSync(promptsDir, { recursive: true });
  const entries = [];

  for (const task of tasks) {
    for (const arm of options.arms) {
      const file = path.join(promptsDir, `${safeSegment(task.id)}__${safeSegment(arm.id)}.md`);
      const context = buildPromptContext(arm, task);
      const prompt = `SYSTEM INSTRUCTIONS FOR THIS BENCHMARK\n\n${context.systemInstruction}\n\nUSER TASK\n\n${buildTaskPrompt(task)}`;
      const promptFileContent = `${prompt}\n`;
      fs.writeFileSync(file, promptFileContent, 'utf8');
      entries.push({
        taskId: task.id,
        armId: arm.id,
        file: path.relative(options.output, file).replace(/\\/g, '/'),
        sha256: require('crypto').createHash('sha256').update(promptFileContent).digest('hex'),
        context: context.contextMetadata,
      });
    }
  }

  const manifest = {
    schemaVersion: '1.2.0',
    runId,
    mode: 'manual-chat',
    modelRequested: options.model || null,
    generatedAt: new Date().toISOString(),
    taskIds: tasks.map(task => task.id),
    arms: options.arms.map(arm => arm.id),
    prompts: entries,
    responseFormat: 'responses/<taskId>/<armId>.json with promptPackRunId, promptSha256, responseText, and optional usage counts',
    tokenUsage: 'Chat UI usage is unavailable unless the operator can report it. Missing counts remain null.',
    provenance: {
      commit: gitCommit(),
      workingTree: gitWorkingTreeStatus(),
      nodeVersion: process.version,
      platform: process.platform,
      sourceHashes: benchmarkSourceHashes(),
    },
  };
  fs.writeFileSync(path.join(options.output, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  fs.writeFileSync(path.join(options.output, 'README.md'), chatInstructions(options, manifest), 'utf8');
  console.log(`Chat prompt pack written to ${options.output}`);
  console.log(`Run each prompt in a separate fresh chat, then use --mode chat-eval --responses <folder> --manifest ${path.join(options.output, 'manifest.json')}.`);
}

function chatInstructions(options, manifest) {
  const hashRows = manifest.prompts.map(item => `| \`${item.taskId}\` | \`${item.armId}\` | \`${item.sha256}\` |`).join('\n');
  return `# ContextOS manual chat benchmark\n\nRun ID: \`${manifest.runId}\`\n\n## Procedure\n\n1. Open a new, empty chat for every prompt file. Do not run two arms in the same conversation.\n2. Paste the entire prompt file as one message and save the full assistant response. Use the same model and settings for every arm.\n3. Save each response as \`responses/<taskId>/<armId>.json\`. Copy the run ID above and the exact prompt hash from this table:\n\n| Task | Arm | Prompt SHA-256 |\n| --- | --- | --- |\n${hashRows}\n\nUse this response shape:\n\n\`\`\`json\n{\n  "promptPackRunId": "${manifest.runId}",\n  "promptSha256": "<copy the matching hash from the table above>",\n  "model": "model name shown by the chat UI",\n  "responseText": "full assistant response",\n  "usage": {\n    "promptTokens": null,\n    "completionTokens": null,\n    "totalTokens": null,\n    "source": "unavailable"\n  }\n}\n\`\`\`\n\nIf the UI exposes token counts, enter those numbers and set \`source\` to \`user_reported\`. Do not estimate hidden system-prompt tokens. The evaluator records missing chat usage as unavailable.\n\nEvaluate the collected outputs with:\n\n\`\`\`powershell\nnode benchmarks/v2/run.js --mode chat-eval --task ${options.task} --arms ${options.arms.map(arm => arm.id).join(',')} --responses ./responses --manifest "${path.join(options.output, 'manifest.json')}" --output ./chat-report\n\`\`\`\n\nThe same local runtime oracle is used for API and chat outputs. The chat arm is a manual comparison: platform system instructions, project context, and exact UI token usage are outside the runner's visibility.\n`;
}

function loadChatResponses(options, tasks) {
  if (!options.responses) throw new Error('--responses is required in chat-eval mode');
  if (!options.manifest) throw new Error('--manifest is required in chat-eval mode; pass the manifest.json from the prompt pack used for these answers');
  const manifest = JSON.parse(fs.readFileSync(options.manifest, 'utf8'));
  if (manifest.schemaVersion !== '1.2.0' || manifest.mode !== 'manual-chat' || typeof manifest.runId !== 'string' || !Array.isArray(manifest.prompts)) {
    throw new Error('Invalid or unsupported manual-chat prompt manifest');
  }
  const packDirectory = path.dirname(options.manifest);
  const entries = new Map();
  for (const entry of manifest.prompts) {
    if (!entry || typeof entry.taskId !== 'string' || typeof entry.armId !== 'string' || typeof entry.file !== 'string') {
      throw new Error('Invalid prompt manifest entry');
    }
    const key = `${entry.taskId}/${entry.armId}`;
    if (entries.has(key) || !/^[a-f0-9]{64}$/i.test(entry.sha256 || '')) throw new Error(`Invalid or duplicate prompt manifest entry: ${key}`);
    const promptPath = path.resolve(packDirectory, entry.file);
    const relative = path.relative(packDirectory, promptPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Prompt path escapes its pack directory: ${entry.file}`);
    if (!fs.existsSync(promptPath)) throw new Error(`Missing prompt pack file: ${promptPath}`);
    const promptText = fs.readFileSync(promptPath, 'utf8');
    const digest = require('crypto').createHash('sha256').update(promptText).digest('hex');
    if (digest !== entry.sha256) throw new Error(`Prompt hash mismatch for ${key}`);
    entries.set(key, { ...entry, promptText });
  }
  const responses = {};
  for (const task of tasks) {
    responses[task.id] = {};
    for (const arm of options.arms) {
      const file = path.join(options.responses, safeSegment(task.id), `${safeSegment(arm.id)}.json`);
      if (!fs.existsSync(file)) throw new Error(`Missing chat response file: ${file}`);
      const item = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof item.responseText !== 'string' || !item.responseText.trim()) throw new Error(`Invalid or empty responseText in ${file}`);
      const key = `${task.id}/${arm.id}`;
      const promptEntry = entries.get(key);
      if (!promptEntry) throw new Error(`Prompt pack does not contain ${key}`);
      if (item.promptPackRunId !== manifest.runId || item.promptSha256 !== promptEntry.sha256) {
        throw new Error(`Chat response provenance mismatch for ${key}; expected prompt pack ${manifest.runId} and sha256 ${promptEntry.sha256}`);
      }
      let usage;
      if (item.usage) {
        const source = item.usage.source === 'unavailable' ? 'unavailable' : 'user_reported';
        usage = normalizeUsage(item.usage, source);
      }
      responses[task.id][arm.id] = {
        responseText: item.responseText,
        model: typeof item.model === 'string' ? item.model : 'unknown',
        usage,
        durationMs: Number.isFinite(item.durationMs) ? item.durationMs : null,
        promptProvenance: {
          runId: manifest.runId,
          promptSha256: promptEntry.sha256,
          promptText: promptEntry.promptText,
          context: promptEntry.context || null,
        },
      };
    }
  }
  return { responses, promptPack: manifest };
}

function markdownReport(report) {
  const lines = [
    '# ContextOS v2 Benchmark Report',
    '',
    `- Mode: \`${report.mode}\``,
    `- Provider: \`${report.provider}\``,
    `- Model: \`${report.model}\``,
    `- Tasks: ${report.methodology.taskCount}`,
    `- Completed runs: ${report.summary.completedRuns}/${report.summary.requestedRuns}`,
    `- API errors: ${report.summary.apiErrors}; evaluator errors: ${report.summary.evaluatorErrors}`,
    `- Complete task/repetition pairs: ${report.summary.completePairs}`,
    '',
    '| Arm | Harness successes / completed | Success rate (95% Wilson CI) | Input tokens | Output tokens | Total tokens | Usage source | Unreported retries | Cost / success |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
  ];
  for (const arm of report.methodology.arms) {
    const stats = report.summary.arms[arm];
    const usage = stats.usage;
    const total = usage.totalTokens === null
      ? (usage.knownTotalTokens > 0 ? `incomplete (known ${usage.knownTotalTokens})` : 'unavailable')
      : usage.totalTokens;
    const ci = `[${stats.ci95[0]}%, ${stats.ci95[1]}%]`;
    const cost = stats.costPerVerifiedSuccess === null ? 'N/A (v2 has no price input)' : `$${stats.costPerVerifiedSuccess}`;
    lines.push(`| ${arm} | ${stats.successfulRuns}/${stats.totalRuns} | ${stats.successRate}% ${ci} | ${usage.promptTokens ?? 'N/A'} | ${usage.completionTokens ?? 'N/A'} | ${total} | ${usage.source} | ${usage.unreportedRetryRequests} | ${cost} |`);
  }
  lines.push('', '## Runs', '', '| Task | Repeat | Arm | Status | Harness verified success | Tokens |', '| --- | ---: | --- | --- | --- | ---: |');
  for (const run of report.runs) {
    const tokens = run.usage.totalTokens === null ? 'N/A' : run.usage.totalTokens;
    lines.push(`| ${run.taskId} | ${run.repetition || 1} | ${run.armId} | ${run.status} | ${run.evaluation?.harness_verified_success ? 'yes' : 'no'} | ${tokens} |`);
  }
  if (report.methodology.generationSettings) {
    lines.push('', `Generation settings: \`${JSON.stringify(report.methodology.generationSettings)}\`.`);
  }
  if (report.promptPack) lines.push(`Manual prompt pack: \`${report.promptPack.runId}\` (prompts hash-verified).`);
  lines.push('', 'API token totals use provider usage fields when available; token usage from retry attempts without a provider usage response is marked unavailable and the aggregate is incomplete. Harness success requires reported completion tokens and generation time to check the budgets. Chat UI runs may show unavailable usage; these counts are not inferred from text length.', '');
  return lines.join('\n');
}

function saveReport(report, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  report.provenance = {
    commit: gitCommit(),
    workingTree: gitWorkingTreeStatus(),
    nodeVersion: process.version,
    platform: process.platform,
    sourceHashes: benchmarkSourceHashes(),
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const json = JSON.stringify(report, null, 2);
  fs.writeFileSync(path.join(outputDir, `run-${stamp}.json`), json, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'latest.json'), json, 'utf8');
  fs.writeFileSync(path.join(outputDir, 'latest.md'), markdownReport(report), 'utf8');
  console.log(markdownReport(report));
  console.log(`\nReport saved to ${outputDir}`);
}

function gitWorkingTreeStatus() {
  try {
    const output = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return output.trim() ? 'dirty' : 'clean';
  } catch {
    return 'unknown';
  }
}

function benchmarkSourceHashes() {
  const files = [
    'benchmarks/v2/run.js',
    'benchmarks/v2/tasks.js',
    'benchmarks/v2/harness/api-runner.js',
    'benchmarks/v2/harness/prompts.js',
    'benchmarks/v2/arms/arm-definitions.js',
    'benchmarks/v2/evaluators/verified-success.js',
    'benchmarks/v2/analysis/statistics.js',
    'benchmarks/lib/evaluator.js',
    '.agents/AGENTS.md',
    'benchmarks/lib/runtime-suites.js',
    'benchmarks/lib/runtime-runner.js',
    'benchmarks/lib/runtime-worker.js',
    'benchmarks/lib/usage.js',
    'benchmarks/lib/llm-client.js',
  ];
  return Object.fromEntries(files.map(file => [
    file,
    require('crypto').createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex'),
  ]));
}

function printHelp() {
  console.log(`ContextOS Benchmark v2 — real API and manual chat modes\n\nUsage:\n  node benchmarks/v2/run.js [options]\n\nOptions:\n  --mode api|chat-pack|chat-eval  Execution mode (default: api)\n  --provider <name>               openai, gemini, anthropic, or custom\n  --model <name>                  Provider model id\n  --api-key <key>                 Prefer provider environment variables instead\n  --base-url <url>                OpenAI-compatible endpoint for custom providers\n  --task <id|all>                 Runtime task id (default: all)\n  --arms a,b,c,d                  Arms to run (default: all four)\n  --repeats <n>                   Generations per task/arm in API mode (default: 1)\n  --max-tokens <n>                Maximum generated tokens (default: 4096)\n  --output <directory>            Report or prompt-pack directory\n  --responses <directory>         Chat response directory for chat-eval\n  --manifest <file>               Exact manifest.json from the used chat prompt pack\n  --help                          Show this help\n\nEnvironment keys: OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY.\nChat UI usage is recorded only when manually supplied; exact per-chat counts are not exposed by most chat interfaces.`);
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return printHelp();
  const tasks = selectTasks(options.task);

  if (options.mode === 'chat-pack') return writeChatPack(options, tasks);
  if (options.mode === 'chat-eval') {
    const { responses, promptPack } = loadChatResponses(options, tasks);
    const report = await evaluateChatResponses({ tasks, arms: options.arms, responses, promptPack, model: options.model || 'user-reported' });
    return saveReport(report, options.output);
  }

  const client = new LLMClient(options);
  if (!client.apiKey && client.provider !== 'custom') {
    throw new Error(`No API key configured for ${client.provider}. Set the matching environment variable or pass --api-key.`);
  }
  const report = await runApiBenchmark({
    client,
    tasks,
    arms: options.arms,
    maxTokens: options.maxTokens,
    repeats: options.repeats,
    onProgress: ({ task, arm, repetition, phase }) => {
      if (phase === 'generate') console.log(`[${task.id}] repeat ${repetition}: ${arm.id} calling ${client.provider}/${client.model}`);
    },
  });
  return saveReport(report, options.output);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`[Benchmark v2] ${String(error.message || error).replace(/(?:sk-[A-Za-z0-9_-]{8,}|AIza[A-Za-z0-9_-]{20,})/g, '[REDACTED]')}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, selectTasks, writeChatPack, loadChatResponses, markdownReport, saveReport, main };
