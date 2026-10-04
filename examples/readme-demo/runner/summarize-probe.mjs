import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.argv[2];
if (!root) throw new Error('Usage: node summarize-probe.mjs <probe-output-directory>');
const hash = value => createHash('sha256').update(value).digest('hex');
const rows = ['A', 'B', 'C'].map(condition => {
  const dir = path.join(root, condition);
  const request = JSON.parse(fs.readFileSync(path.join(dir, 'request-1.json'), 'utf8'));
  const visible = request.input.flatMap(item => item.content || []).map(item => item.text || '').join('\n');
  const developerInput = request.input.filter(item => item.role === 'developer')
    .flatMap(item => item.content || []).map(item => item.text || '').join('\n');
  const skillSection = developerInput.split('### Available skills')[1]?.split('</skills_instructions>')[0] || '';
  const skills = [...skillSection.matchAll(/^- ([a-z0-9_-]+): /gm)].map(match => match[1]);
  const diagnostic = JSON.parse(fs.readFileSync(path.join(dir, 'commands.json'), 'utf8'));
  return {
    condition,
    inference: false,
    isolation: 'fresh container; --network none; no credentials; fresh HOME and CODEX_HOME; no host config or history',
    model: request.model,
    reasoning: request.reasoning,
    built_in_instructions_sha256: hash(request.instructions),
    tools_sha256: hash(JSON.stringify(request.tools)),
    tool_names: request.tools.map(tool => tool.name || tool.type),
    skills_in_initial_catalog: skills,
    contextos_mentioned: visible.includes('ContextOS'),
    team_rule_full_body_in_initial_input: visible.includes('Our catalog treats runs of ordinary U+0020 spaces'),
    prompt_input_exit_code: diagnostic[2].exit_code,
    local_capture_exit_code: diagnostic[3].exit_code,
    local_capture_exit_explanation: 'Deliberate local HTTP 418; no model response generated.',
    request_count: diagnostic[3].request_count,
  };
});
const result = {
  interpretation: 'Native instruction discovery and request construction only. This does not demonstrate model activation or compliance.',
  same_built_in_instructions: new Set(rows.map(row => row.built_in_instructions_sha256)).size === 1,
  same_tools: new Set(rows.map(row => row.tools_sha256)).size === 1,
  rows,
};
fs.writeFileSync(path.join(root, 'summary.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
