'use strict';

// Controlled regressions in actual repository modules. These are not a dataset
// of historical issue fixes, and must never be reported as one.
const GROUPS = {
  resolver: { file: '.agents/resolver/resolve-args.js', dependencies: [] },
  usage: { file: 'benchmarks/lib/usage.js', dependencies: [] },
  paths: { file: '.agents/filesystem/safe-path.js', dependencies: ['.agents/filesystem/platform-hardening.js'] },
  workspace: { file: '.agents/workspace/workspace-graph.js', dependencies: [] },
};

function entry(id, group, title, contract, from, to, occurrences = 1) {
  return { id, group, title, category: group === 'paths' ? 'Security: untrusted filesystem paths' : 'Repository maintenance',
    description: `Repair a regression in ${GROUPS[group].file}. Read the existing implementation and preserve its public exports and other behavior.`,
    contract, file: GROUPS[group].file, dependencies: GROUPS[group].dependencies,
    mutation: { from, to, occurrences }, datasetKind: 'seeded-repository-regression' };
}

const CASES = [
  entry('resolve-json', 'resolver', 'Restore JSON output option', 'The --json flag enables json; --explain enables explain. Neither becomes task text.', "if (arg === '--json') result.json = true;", "if (arg === '--json') result.json = false;"),
  entry('resolve-files', 'resolver', 'Normalize comma separated file paths', 'Trim each --files item and discard empty entries, preserving order. Consumed values must not become task text.', "value.split(',').map(file => file.trim()).filter(Boolean)", "value.split(',')"),
  entry('resolve-budget', 'resolver', 'Validate context budget input', 'Accept only positive safe integer budgets. Reject zero, negatives, fractions, exponent notation, and overflow.', "/^[1-9]\\d*$/.test(value)", "/^\\d+$/.test(value)"),
  entry('resolve-missing-value', 'resolver', 'Reject missing option values', 'A --files, --phase, or --budget option must have a nonempty value; another --option is not a value. Reject unknown flags.', "!value || value.startsWith('--')", "!value"),
  entry('resolve-delimiter', 'resolver', 'Keep task text after option delimiter', 'After -- treat every remaining token, including flag shaped tokens, as task text. Preserve spaces between tokens.', 'task.push(...args.slice(i + 1));', 'task.push(...args.slice(i + 2));'),
  entry('usage-missing', 'usage', 'Preserve unavailable usage', 'Missing, null, and empty usage fields are unknown (null), not zero. An absent provider usage object has source unavailable.', "(typeof value === 'string' && value.trim() === '')) return null;", "(typeof value === 'string' && value.trim() === '')) return 0;"),
  entry('usage-responses', 'usage', 'Read Responses API usage fields', 'Map input_tokens, output_tokens and their cached/reasoning detail fields. Compute total when not supplied; reasoning is already part of output.', 'raw.prompt_tokens ?? raw.input_tokens', 'raw.prompt_tokens'),
  entry('usage-anthropic', 'usage', 'Include cache creation and reads in input totals', 'Anthropic prompt tokens include ordinary input, cache creation and cache reads. Unknown ordinary input remains unknown.', 'input + cacheWrite + cacheRead', 'input + cacheRead'),
  entry('usage-invalid', 'usage', 'Reject invalid token counts', 'Counts must be nonnegative safe integers. Negative, fractional, unsafe, NaN, and empty values are unknown; numeric integer strings remain accepted.', 'Number.isSafeInteger(parsed) && parsed >= 0', 'Number.isFinite(parsed)'),
  entry('usage-summary', 'usage', 'Preserve unknown aggregate totals', 'If any request has unknown input/output/total, the corresponding aggregate is null. Preserve knownTotalTokens, request counts, and completeness separately.', 'totalComplete ? totalTokens : null', 'totalTokens'),
  entry('paths-nul', 'paths', 'Reject NUL bytes in managed paths', 'Reject NUL bytes in root or target with CTX_PATH_INVALID before resolving. Ordinary relative paths remain valid.', "relativePath.includes('\\0') || projectRoot.includes('\\0')", 'false'),
  entry('paths-ads', 'paths', 'Reject alternate data streams', 'A relative path containing colon is invalid (CTX_PATH_INVALID). Drive qualified paths retain CTX_PATH_OUTSIDE_PROJECT.', "if (relativePath.includes(':'))", 'if (false)'),
  entry('paths-devices', 'paths', 'Reject Windows device names with extensions', 'Device names are case insensitive and forbidden with extensions in every segment; con.txt and nested/aux.json are reserved. Ordinary names remain valid.', "segment.split('.')[0].toUpperCase()", 'segment.toUpperCase()'),
  entry('paths-root', 'paths', 'Disallow mutation of the root itself', 'A managed target cannot resolve to the project root itself (CTX_PATH_INVALID), including . and child/..; descendants remain valid.', " || relFromRoot === ''", ''),
  entry('paths-traversal', 'paths', 'Enforce project containment', 'Parent and sibling paths outside the root must be rejected even when realpath checks are disabled. Descendant paths remain permitted.', "relFromRoot.startsWith('..')", "relFromRoot.startsWith('../../../never')"),
  entry('workspace-external', 'workspace', 'Exclude cloned skill repositories', 'Default discovery excludes .external-skills and managed worktrees; keep normal application packages.', "  '.external-skills',", "  '.unused-external-directory',"),
  entry('workspace-nested', 'workspace', 'Respect nested repository opt in', 'A nested .git repository is excluded by default without workspace declarations. includeNestedRepositories true explicitly includes it.', '!this.includeNestedRepositories && !(workspaceGlobs.length > 0 && isDeclared)', 'false'),
  entry('workspace-declarations', 'workspace', 'Scope packages to declared workspaces', 'When workspaces are declared, only matching package directories plus the root become packages; unrelated examples are excluded.', 'const pkg = isDeclared ? this._inspectDirectoryForPackage(fullPath, relPath, realRoot) : null;', 'const pkg = this._inspectDirectoryForPackage(fullPath, relPath, realRoot);'),
  entry('workspace-limit', 'workspace', 'Enforce a global package bound', 'maxPackages includes the root and is a strict global bound over nested and sibling packages; truncated discovery reports partial true.', 'packages.length >= this.maxPackages', 'packages.length > this.maxPackages', 3),
  entry('workspace-dependencies', 'workspace', 'Exclude self edges from internal dependencies', 'Internal dependencies contain only other discovered packages; self references and external dependencies must not become internal edges.', 'packageIdSet.has(dep) && dep !== pkg.id', 'packageIdSet.has(dep)'),
];

function mutate(source, task) {
  const { from, to, occurrences } = task.mutation;
  const found = source.split(from).length - 1;
  if (found !== occurrences) throw new Error(`Dataset drift: ${task.id} expected ${occurrences} source matches, found ${found}`);
  return source.split(from).join(to);
}

module.exports = { GROUPS, CASES, mutate };
