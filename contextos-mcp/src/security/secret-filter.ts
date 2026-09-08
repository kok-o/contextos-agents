/**
 * Secret Filter — prevents sensitive data from leaking to external LLM agents.
 *
 * Scans file contents and paths before they are included in agent prompts.
 * Blocks files that likely contain secrets (API keys, credentials, SSH keys).
 */

import * as path from "node:path";

/** Exact filenames that MUST NEVER be sent to external agents. */
const BLOCKED_EXACT_FILENAMES = new Set([
	"credentials",
	"credentials.json",
	"service-account.json",
	"serviceaccountkey.json",
	".netrc",
	".git-credentials",
	".npmrc",
	".pypirc",
]);

/** File extensions that should never be sent. */
const BLOCKED_EXTENSIONS = new Set([".pem", ".key", ".p12", ".pfx", ".jks", ".keystore", ".pkcs12", ".crt", ".der"]);

/** Directory names that should be blocked entirely. */
const BLOCKED_DIRS = new Set([".ssh", ".gnupg", ".aws", ".azure", ".gcp", ".kube", ".credentials"]);

export interface SecretPatternDef {
	name: string;
	pattern: RegExp;
}

/** Structured secret pattern definitions with deterministic category names. */
export const SECRET_PATTERN_DEFS: SecretPatternDef[] = [
	{
		name: "AWS_KEY",
		pattern: /\b(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[0-9A-Z]{16}\b/,
	},
	{
		name: "GITHUB_FINE_GRAINED_PAT",
		pattern: /\bgithub_pat_[0-9a-zA-Z_]{60,}\b/,
	},
	{
		name: "GITHUB_PAT",
		pattern: /\bghp_[0-9a-zA-Z]{36}\b/,
	},
	{
		name: "GITHUB_OAUTH",
		pattern: /\bgho_[0-9a-zA-Z]{36}\b/,
	},
	{
		name: "SLACK_TOKEN",
		pattern: /\bxox[baprs]-[0-9a-zA-Z-]{10,48}\b/,
	},
	{
		name: "OPENAI_KEY",
		pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/,
	},
	{
		name: "ANTHROPIC_KEY",
		pattern: /\bsk-ant-[A-Za-z0-9-]{90,}\b/,
	},
	{
		name: "GOOGLE_KEY",
		pattern: /\bAIza[A-Za-z0-9_-]{35}\b/,
	},
	{
		name: "NPM_TOKEN",
		pattern: /\bnpm_[A-Za-z0-9]{32,36}\b/,
	},
	{
		name: "PRIVATE_KEY",
		pattern:
			/-----BEGIN\s+(?:[A-Z0-9_-]+\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:[A-Z0-9_-]+\s+)?PRIVATE\s+KEY-----|-----BEGIN\s+(?:[A-Z0-9_-]+\s+)?PRIVATE\s+KEY-----/,
	},
	{
		name: "CERTIFICATE",
		pattern: /-----BEGIN\s+CERTIFICATE-----[\s\S]*?-----END\s+CERTIFICATE-----|-----BEGIN\s+CERTIFICATE-----/,
	},
	{
		name: "JWT_TOKEN",
		pattern: /\beyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*\b/,
	},
	{
		name: "GENERIC_SECRET",
		pattern:
			/(?:API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY|AUTH[_-]?TOKEN|PASSWORD)\s*[=:]\s*['"]?[A-Za-z0-9+/=_-]{16,}['"]?/i,
	},
];

/** Backward-compatible array of RegExps */
export const SECRET_CONTENT_PATTERNS: RegExp[] = SECRET_PATTERN_DEFS.map((d) => d.pattern);

/**
 * Check if a file path should be blocked from agent access.
 *
 * @param filePath - Relative or absolute path to check
 * @returns true if the file should be BLOCKED (not sent to agents)
 */
export function isBlockedPath(filePath: string): boolean {
	if (!filePath) return false;
	const normalized = path.normalize(filePath).replace(/\\/g, "/");
	const basename = path.basename(normalized).toLowerCase();
	const ext = path.extname(normalized).toLowerCase();
	const parts = normalized
		.split("/")
		.map((p) => p.toLowerCase())
		.filter(Boolean);

	// Block all .env variants (.env, .env.local, .env.staging, foo.env)
	if (basename === ".env" || basename.startsWith(".env.") || basename.endsWith(".env")) {
		return true;
	}

	// Check blocked filenames
	if (BLOCKED_EXACT_FILENAMES.has(basename)) {
		return true;
	}

	// Check blocked extensions
	if (BLOCKED_EXTENSIONS.has(ext)) {
		return true;
	}

	// Check blocked directory segments
	if (parts.some((p) => BLOCKED_DIRS.has(p))) {
		return true;
	}

	// Check private SSH keys (id_rsa, id_ed25519, etc., except public keys ending in .pub)
	if (basename.startsWith("id_") && !basename.endsWith(".pub")) {
		return true;
	}

	return false;
}

/**
 * Check if file content contains obvious secrets.
 *
 * @param content - The file content to scan
 * @returns true if secrets were detected (file should NOT be sent to agents)
 */
export function containsSecrets(content: string): boolean {
	if (!content) return false;
	// Scan up to 1MB of content for comprehensive coverage without memory spikes
	const sample = content.length > 1_000_000 ? content.slice(0, 1_000_000) : content;
	return SECRET_PATTERN_DEFS.some(({ pattern }) => pattern.test(sample));
}

/**
 * Sanitize a string by redacting any detected secret patterns.
 * Replaces matched patterns with category-tagged [REDACTED:<NAME>].
 *
 * @param text - Text to sanitize
 * @returns Text with secrets replaced by [REDACTED:<NAME>]
 */
export function redactSecrets(text: string): string {
	if (!text) return text;
	let result = text;
	for (const { name, pattern } of SECRET_PATTERN_DEFS) {
		const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
		const regex = new RegExp(pattern.source, flags);
		result = result.replace(regex, `[REDACTED:${name}]`);
	}
	return result;
}
