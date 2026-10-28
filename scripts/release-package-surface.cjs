'use strict';

// Packaging policy is self-contained: MCP release tooling does not load core.
const path = require('node:path');
const privateNames = new Set([
  '.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test',
  '.netrc', '.git-credentials', '.npmrc', 'credentials.json', 'service-account.json',
  'serviceaccountkey.json', 'id_rsa', 'id_ed25519', 'mcp_config.json',
]);
const privateExtensions = new Set(['.key', '.pem', '.pfx', '.p12', '.pkcs12']);
function privateFile(file) {
  return file.split('/').some(part => (/^\.env(?:\.|$)/i.test(part) && part !== '.env.example') || privateNames.has(part.toLowerCase()))
    || privateExtensions.has(path.extname(file).toLowerCase()) || /\.(?:log|tgz|zip|bak|tmp)$/i.test(file);
}
function validatePackagePaths(files, kind) {
  if (!['core', 'mcp'].includes(kind)) throw new Error('Unknown package surface');
  const required = kind === 'core' ? ['package.json', 'README.md', 'LICENSE', 'NOTICE', 'bin/index.js', '.agents/AGENTS.md', '.agents/resolver/canonical-resolver.js']
    : ['package.json', 'README.md', 'bin/mcp.mjs', 'dist/contextos/loader.js', 'dist/mcp/server.js'];
  const permitted = kind === 'core' ? /^(?:bin|catalog|\.agents)\// : /^(?:dist|bin)\//;
  const metadata = /^(?:package\.json|README(?:\.md)?|LICENSE(?:\..+)?|NOTICE|registry(?:\.v2)?(?:\.schema)?\.json)$/i;
  return [...files.filter(file => privateFile(file) || (!permitted.test(file) && !metadata.test(file))
    || /^\.agents\/(?:state|cache|transactions|project|mcp)\//.test(file)),
  ...required.filter(file => !files.includes(file)).map(file => `Missing required file: ${file}`)];
}
module.exports = { privateFile, validatePackagePaths };
