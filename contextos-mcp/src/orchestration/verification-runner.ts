/**
 * Worktree test command execution engine with strict security guards.
 */

import { spawn } from "node:child_process";
import { resolveExecutablePath } from "../utils/command-exists.js";

const ALLOWED_VERIFY_TOOLS = new Set(["npm", "npx", "pnpm", "yarn", "pytest", "cargo", "go", "vitest", "jest"]);

const FORBIDDEN_VERIFY_ARGS = new Set(["-e", "-c", "--eval", "--print", "-p", "--input-type"]);

const STRICT_ENV_ALLOWLIST = new Set([
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

function getSanitizedEnv(): NodeJS.ProcessEnv {
	const sanitized: NodeJS.ProcessEnv = { CI: "true" };
	for (const key of STRICT_ENV_ALLOWLIST) {
		if (process.env[key] !== undefined) {
			sanitized[key] = process.env[key];
		}
	}
	return sanitized;
}

export async function runWorktreeVerification(
	worktreePath: string,
	command: string,
): Promise<{ verified: boolean; output: string }> {
	const trimmed = command.trim();
	if (!trimmed) {
		return { verified: false, output: "Empty verification command" };
	}

	// Reject shell metacharacters and command chaining
	if (/[&|;`$><%]/.test(trimmed)) {
		return {
			verified: false,
			output: "Security error: Shell metacharacters and command chaining are not permitted in verify_command",
		};
	}

	const parts = trimmed.split(/\s+/);
	const rawTool = parts[0];
	const baseTool = rawTool.toLowerCase().replace(/\.(cmd|bat|exe)$/i, "");

	if (!ALLOWED_VERIFY_TOOLS.has(baseTool)) {
		return {
			verified: false,
			output: `Security error: Command "${rawTool}" is not in the allowed verification tools whitelist (${Array.from(ALLOWED_VERIFY_TOOLS).join(", ")})`,
		};
	}

	const args = parts.slice(1);
	for (const arg of args) {
		if (FORBIDDEN_VERIFY_ARGS.has(arg.toLowerCase())) {
			return {
				verified: false,
				output: `Security error: Argument "${arg}" is not permitted in verify_command`,
			};
		}
	}

	const exePath = await resolveExecutablePath(rawTool);
	const targetExecutable = exePath || rawTool;

	return new Promise((resolveResult) => {
		try {
			const child = spawn(targetExecutable, parts.slice(1), {
				cwd: worktreePath,
				timeout: 60000,
				env: getSanitizedEnv(),
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
			});

			let stdout = "";
			let stderr = "";
			child.stdout?.on("data", (d) => {
				if (stdout.length < 10000) stdout += d.toString();
			});
			child.stderr?.on("data", (d) => {
				if (stderr.length < 10000) stderr += d.toString();
			});

			child.on("close", (code) => {
				const output = `${stdout}\n${stderr}`.trim().slice(0, 1500);
				resolveResult({
					verified: code === 0,
					output,
				});
			});

			child.on("error", (err) => {
				resolveResult({
					verified: false,
					output: `Verification execution failed: ${err.message}`,
				});
			});
		} catch (err: unknown) {
			resolveResult({
				verified: false,
				output: err instanceof Error ? err.message : String(err),
			});
		}
	});
}
