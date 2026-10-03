'use strict';

// This controller-owned file is never present in the model-readable fixture.
// Each group checks all five contracts, including behavior unrelated to the
// single seeded fault. Assertions are passed to the worker through stdin.
const ORACLES = {
  resolver: `
const parse = subject.parseResolveArgs;
assert.equal(parse(['fix', '--json', '--explain']).json, true);
assert.equal(parse(['fix', '--json', '--explain']).explain, true);
assert.equal(parse(['fix', '--json', '--explain']).task, 'fix');
assert.deepEqual(parse(['fix', '--files', ' a.js, ,b.js, ']).files, ['a.js', 'b.js']);
assert.equal(parse(['--budget', '512', 'repair']).contextBudgetTokens, 512);
for (const value of ['0', '-1', '1.5', '1e2', '9007199254740992']) assert.throws(() => parse(['--budget', value]));
for (const flag of ['--files', '--phase', '--budget']) {
  assert.throws(() => parse([flag]));
  assert.throws(() => parse([flag, '--json']));
}
assert.throws(() => parse(['--unknown']));
assert.equal(parse(['repair', '--', '--json', 'literally']).task, 'repair --json literally');
assert.equal(parse(['--phase', 'Build', 'fix']).explicitPhase, 'Build');
`,
  usage: `
assert.equal(subject.normalizeOpenAIUsage(null).promptTokens, null);
assert.equal(subject.normalizeOpenAIUsage(null).source, 'unavailable');
assert.equal(subject.normalizeUsage({ promptTokens: '', completionTokens: null }).totalTokens, null);
const responses = subject.normalizeOpenAIUsage({ input_tokens: 100, output_tokens: 30, input_tokens_details: { cached_tokens: 40 }, output_tokens_details: { reasoning_tokens: 20 } });
assert.equal(responses.promptTokens, 100); assert.equal(responses.completionTokens, 30);
assert.equal(responses.totalTokens, 130); assert.equal(responses.reasoningTokens, 20); assert.equal(responses.cachedPromptTokens, 40);
const anthropic = subject.normalizeAnthropicUsage({ input_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30, output_tokens: 5 });
assert.equal(anthropic.promptTokens, 60); assert.equal(anthropic.totalTokens, 65);
assert.equal(subject.normalizeAnthropicUsage({ output_tokens: 1 }).promptTokens, null);
for (const value of [-1, 1.2, Number.MAX_SAFE_INTEGER + 1, NaN]) assert.equal(subject.normalizeUsage({ promptTokens: value }).promptTokens, null);
assert.equal(subject.normalizeUsage({ promptTokens: '12' }).promptTokens, 12);
const sum = subject.sumUsage([subject.normalizeOpenAIUsage({ input_tokens: 10, output_tokens: 5 }), subject.normalizeOpenAIUsage(null)]);
assert.equal(sum.totalTokens, null); assert.equal(sum.promptTokens, null); assert.equal(sum.knownTotalTokens, 15);
assert.equal(sum.complete, false); assert.equal(sum.requestCount, 2);
assert.equal(subject.sumUsage([]).requestCount, 0);
`,
  paths: `
const resolve = (target, root = dataRoot) => subject.resolveManagedPath(root, target, { checkRealpathAncestors: false });
const code = (target, expected, root = dataRoot) => assert.throws(() => resolve(target, root), error => error.code === expected);
code('file' + String.fromCharCode(0) + 'x', 'CTX_PATH_INVALID');
code('file.txt', 'CTX_PATH_INVALID', dataRoot + String.fromCharCode(0));
code('file.txt:stream', 'CTX_PATH_INVALID'); code('file.txt::$DATA', 'CTX_PATH_INVALID');
code('C:relative.txt', 'CTX_PATH_OUTSIDE_PROJECT');
for (const value of ['con.txt', 'nested/aux.json', 'PRN', 'Lpt9.log']) code(value, 'CTX_PATH_RESERVED_DEVICE');
for (const value of ['.', 'child/..']) code(value, 'CTX_PATH_INVALID');
for (const value of ['../escape.txt', '../sibling/file.txt', '../../escape']) code(value, 'CTX_PATH_OUTSIDE_PROJECT');
assert.equal(resolve('nested/normal.txt').relativePosixPath, 'nested/normal.txt');
assert.equal(subject.isReservedDeviceName('console.txt'), false);
`,
  workspace: `
function fixture(name, manifest, packages) {
  const root = path.join(dataRoot, name); fs.mkdirSync(path.join(root, '.git'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest));
  for (const [directory, pkg] of Object.entries(packages)) {
    const dir = path.join(root, directory); fs.mkdirSync(dir, { recursive: true });
    const { git, ...body } = pkg; if (git) fs.mkdirSync(path.join(dir, '.git'));
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(body));
  }
  return root;
}
const Builder = subject.WorkspaceGraphBuilder;
const ids = graph => graph.packages.map(pkg => pkg.id).sort();
const ignored = fixture('ignored', { name: 'owner' }, { '.external-skills/clone': { name: 'foreign' }, '.contextos-worktrees/copy': { name: 'copy' }, 'app': { name: 'app' } });
assert.deepEqual(ids(new Builder().build(ignored)), ['app', 'owner']);
const nested = fixture('nested', { name: 'owner' }, { 'clone': { name: 'foreign', git: true } });
assert.deepEqual(ids(new Builder().build(nested)), ['owner']);
assert.deepEqual(ids(new Builder({ includeNestedRepositories: true }).build(nested)), ['foreign', 'owner']);
const declared = fixture('declared', { name: 'owner', workspaces: ['packages/*'] }, { 'packages/real': { name: 'real', git: true }, 'examples/unrelated': { name: 'unrelated' } });
assert.deepEqual(ids(new Builder().build(declared)), ['owner', 'real']);
const limited = fixture('limited', { name: 'owner' }, { 'a/one': { name: 'one' }, 'a/two': { name: 'two' }, 'z': { name: 'z' } });
const capped = new Builder({ maxPackages: 2 }).build(limited); assert.equal(capped.packages.length, 2); assert.equal(capped.partial, true);
const deps = fixture('deps', { name: 'owner', dependencies: { owner: '*', child: '*', external: '*' } }, { 'child': { name: 'child' } });
assert.deepEqual(new Builder().build(deps).packages.find(pkg => pkg.id === 'owner').internalDependencies, ['child']);
`,
};

module.exports = { ORACLES };
