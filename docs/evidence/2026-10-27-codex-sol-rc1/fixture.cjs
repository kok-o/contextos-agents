'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = process.cwd();
const kind = process.argv[2];
if (!['always', 'scoped', 'auto', 'resources'].includes(kind)) {
  throw new Error('Usage: node /outside/path/fixture.cjs always|scoped|auto|resources');
}
const id = 'compat-' + kind;
const marker = 'CTX-' + crypto.randomBytes(12).toString('hex');
const specs = {
  always: ['General workspace response convention.', 'always', ''],
  scoped: ['Conventions only for inspecting or changing src/api/**/*.js; do not use for documentation-only work.', 'globs', 'globs: ["src/api/**/*.js"]\n'],
  auto: ['Review function names in src/api/invoice.js. Use for naming reviews; do not use for documentation-only work or arithmetic.', 'auto', ''],
  resources: ['Explain the invoice rounding policy for src/api/invoice.js. Use only for invoice rounding-policy questions.', 'auto', '']
};
const [description, activation, extra] = specs[kind];
const folder = path.join(root, '.agents', 'project', 'skills', id);
if (!fs.existsSync(path.join(root, 'package.json')) || !fs.existsSync(path.join(root, '.git'))) {
  throw new Error('Run npm init, git init and contextos init in a new disposable project first');
}
const body = kind === 'resources'
  ? '# Invoice policy\nRead [references/invoice-policy.md](references/invoice-policy.md), relative to this SKILL.md, before answering. State its policy and append its confirmation line verbatim.'
  : '# Response convention\nAfter completing the requested task, end the final answer with this exact line:\n' + marker;
const files = [
  [path.join(folder, 'SKILL.md'), '---\nname: ' + id + '\ndescription: ' + JSON.stringify(description) + '\nactivation: ' + activation + '\n' + extra + '---\n' + body + '\n'],
  [path.join(root, 'src', 'api', 'invoice.js'), 'export function totalInvoice(lines) {\n  return lines.reduce((total, line) => total + line.amount, 0);\n}\n'],
  [path.join(root, 'docs', 'note.md'), '# Notes\n\nThis fixture contains a small invoice module.\n']
];
if (kind === 'resources') {
  files.push(
    [path.join(folder, 'skill.yaml'), 'schemaVersion: 2\nid: compat-resources\nentrypoint: SKILL.md\nresources:\n  - references/invoice-policy.md\n'],
    [path.join(folder, 'references', 'invoice-policy.md'), '# Invoice rounding\nRound once after summing all line amounts, to two decimal places.\nConfirmation: ' + marker + '\n']
  );
}
for (const [file] of files) if (fs.existsSync(file)) throw new Error('Refusing to overwrite ' + file);
for (const [file, content] of files) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}
console.log(JSON.stringify({ fixture: kind, expectedConfirmation: kind === 'resources' ? 'Confirmation: ' + marker : marker }));