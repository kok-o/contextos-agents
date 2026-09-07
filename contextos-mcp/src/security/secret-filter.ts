/**
 * Secret Filter — prevents sensitive data from leaking to external LLM agents.
 *
 * Scans file contents and paths before they are included in agent prompts.
 * Blocks files that likely contain secrets (API keys, credentials, SSH keys).
 */

import * as path from "node:path";

/** File patterns that MUST NEVER be sent to external agents. */
const BLOCKED_FILENAMES: string[] = [
	".env",
	".env.local",
	".env.production",
	".env.staging",
	".env.development",
	".env.test",
	"credentials",
	"credentials.json",
	"service-account.json",
	"serviceAccountKey.json",
	".netrc",
	".git-credentials",
	".npmrc",
];

/** File extensions that should never be sent. */
const BLOCKED_EXTENSIONS: string[] = [".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"];

/** Directory names that should be blocked entirely. */
const BLOCKED_DIRS: string[] = [".ssh", ".gnupg", ".aws", ".azure", ".gcp", ".kube"];

/** Patterns in file content that indicate secrets. */
const SECRET_CONTENT_PATTERNS: RegExp[] = [
	/(?:API[_-]?KEY|SECRET[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)\s*[=:]\s*['"]?[A-Za-z0-9+/=_-]{20,}/i,
	/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/,
	/-----BEGIN\s+CERTIFICATE-----/,
	/ghp_[A-Za-z0-9]{36}/, // GitHub personal access token
	/gho_[A-Za-z0-9]{36}/, // GitHub OAuth token
	/github_pat_[A-Za-z0-9_]{82}/, // GitHub fine-grained PAT
	/sk-[A-Za-z0-9]{32,}/, // OpenAI API key
	/sk-ant-[A-Za-z0-9-]{90,}/, // Anthropic API key
	/AIza[A-Za-z0-9_-]{35}/, // Google API key
	/npm_[A-Za-z0-9]{32,36}/, // npm access token
	/xox[baprs]-[A-Za-z0-9_-]{10,48}/, // Slack token
];

/**
 * Check if a file path should be blocked from agent access.
 *
 * @param filePath - Relative or absolute path to check
 * @returns true if the file should be BLOCKED (not sent to agents)
 */
export function isBlockedPath(filePath: string): boolean {
	const normalized = path.normalize(filePath);
	const basename = path.basename(normalized).toLowerCase();
	const ext = path.extname(normalized).toLowerCase();
	const parts = normalized.split(/[/\\]/).map((p) => p.toLowerCase());

	// Check blocked filenames
	if (BLOCKED_FILENAMES.some((f) => basename === f.toLowerCase())) {
		return true;
	}

	// Check blocked extensions
	if (BLOCKED_EXTENSIONS.includes(ext)) {
		return true;
	}

	// Check blocked directory segments
	if (parts.some((p) => BLOCKED_DIRS.includes(p))) {
		return true;
	}

	// Check id_rsa, id_ed25519, etc.
	if (basename.startsWith("id_") && !basename.includes(".pub")) {
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
	return SECRET_CONTENT_PATTERNS.some((pattern) => pattern.test(sample));
}

/**
 * Sanitize a string by redacting any detected secret patterns.
 * Useful for logging or partial context where we want to include the file
 * but redact any inline secrets.
 *
 * @param text - Text to sanitize
 * @returns Text with secrets replaced by [REDACTED]
 */
export function redactSecrets(text: string): string {
	let result = text;
	for (const pattern of SECRET_CONTENT_PATTERNS) {
		result = result.replace(new RegExp(pattern.source, "gi"), "[REDACTED]");
	}
	return result;
}
