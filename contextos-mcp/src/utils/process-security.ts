/**
 * Process isolation and security utilities:
 * - Environment sanitation (strips credentials, tokens, secrets)
 * - Sensitive output redaction (API keys, passwords, bearer tokens)
 * - Cross-platform bounded process tree termination (Windows taskkill, Unix process groups)
 */

import { execFileSync } from "node:child_process";

export const STRICT_ENV_ALLOWLIST = new Set([
	"PATH",
	"HOME",
	"USERPROFILE",
	"SYSTEMROOT",
	"WINDIR",
	"TEMP",
	"TMP",
	"NODE_ENV",
	"LANG",
	"LC_ALL",
	"CI",
]);

/**
 * Strips high-privilege credentials and tokens from process environment.
 */
export function getSanitizedEnv(customEnv: Record<string, string> = {}): NodeJS.ProcessEnv {
	const sanitized: NodeJS.ProcessEnv = {
		CI: "true",
		NODE_ENV: "test",
	};
	for (const key of STRICT_ENV_ALLOWLIST) {
		if (process.env[key] !== undefined) {
			sanitized[key] = process.env[key];
		}
	}
	for (const [k, v] of Object.entries(customEnv)) {
		if (!/TOKEN|SECRET|KEY|PASSWORD|AUTH|CREDENTIAL/i.test(k)) {
			sanitized[k] = v;
		}
	}
	return sanitized;
}

/**
 * Masks API keys, bearer tokens, passwords, and sensitive credentials in command outputs.
 */
export function redactSensitiveOutput(text = ""): string {
	if (!text) return "";
	return (
		text
			// Secret tokens and API keys
			.replace(/(?:sk-[a-zA-Z0-9]{20,}|gh[pousr]-[a-zA-Z0-9]{30,}|AIza[a-zA-Z0-9_-]{30,45})/g, "[REDACTED_API_KEY]")
			// Bearer / Authorization headers
			.replace(/(?:Authorization:\s*)?(Bearer\s+)[^\s\n]+/gi, "$1[REDACTED_TOKEN]")
			// Password fields
			.replace(/(password[\s:=]+)[^\s\n&]+/gi, "$1[REDACTED_PASSWORD]")
			// Generic high-entropy hex/base64 tokens (32+ chars)
			.replace(
				/(["']?[a-zA-Z0-9_-]*(?:token|secret|password|key)["']?\s*[:=]\s*["']?)[a-zA-Z0-9_.+/=-]{32,}(["']?)/gi,
				"$1[REDACTED]$2",
			)
			.replace(
				/-----BEGIN (?:RSA|OPENSSH|DSA|EC)? ?PRIVATE KEY-----[\s\S]*?-----END (?:RSA|OPENSSH|DSA|EC)? ?PRIVATE KEY-----/g,
				"[REDACTED_PRIVATE_KEY]",
			)
	);
}

/**
 * Recursively terminates a process and all its children across Windows, macOS, and Linux.
 */
export function killProcessTree(pid: number | undefined): void {
	if (!pid) return;

	if (process.platform === "win32") {
		try {
			execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
				stdio: "ignore",
				windowsHide: true,
			});
		} catch {
			// Process might have already exited
		}
	} else {
		try {
			// Kill entire process group
			process.kill(-pid, "SIGKILL");
		} catch {
			try {
				process.kill(pid, "SIGKILL");
			} catch {
				// Process already exited
			}
		}
	}
}
