/**
 * Worktree test command execution engine with strict security guards and lifecycle hardening.
 *
 * Implements Section 16 & Milestones W5.1 and W5.2:
 * - Structured VerificationSpec with validation and legacy reader
 * - Command trust validation (bans npx in host mode, whitelist, forbidden eval args)
 * - Cross-platform process tree termination (Windows taskkill /T /F, POSIX process groups)
 * - Sensitive output redaction (API keys, tokens, passwords)
 * - Post-execution candidate immutability verification (HEAD and dirty working tree checks)
 */

import { execFileSync, spawn } from "node:child_process";
import * as path from "node:path";
import type { VerificationSpec, VerificationStatus } from "../core/types.js";
import { ExecutionSandbox, type SandboxMode } from "../sandbox/execution.js";
import { resolveExecutablePath } from "../utils/command-exists.js";
import {
	getSanitizedEnv,
	killProcessTree,
	redactSensitiveOutput,
	STRICT_ENV_ALLOWLIST,
} from "../utils/process-security.js";

export { getSanitizedEnv, killProcessTree, redactSensitiveOutput, STRICT_ENV_ALLOWLIST };

export const ALLOWED_VERIFY_TOOLS = new Set(["npm", "pnpm", "yarn", "node", "pytest", "cargo", "go", "vitest", "jest"]);

export const FORBIDDEN_VERIFY_ARGS = new Set(["-e", "-c", "--eval", "--print", "-p", "--input-type"]);

/**
 * Parses a string command or object into a canonical VerificationSpec (Section 16.1).
 */
export function parseVerificationSpec(input: unknown): VerificationSpec {
	if (!input) {
		throw new Error("Verification specification cannot be empty");
	}

	if (typeof input === "object" && input !== null) {
		const obj = input as Record<string, any>;
		if (!obj.executable || typeof obj.executable !== "string" || !obj.executable.trim()) {
			throw new Error("Invalid verification specification: executable must be a non-empty string");
		}
		if (/[&|;`$><%]/.test(obj.executable)) {
			const err = new Error(
				"Security error: Shell metacharacters and command chaining are prohibited in verification commands",
			);
			(err as any).code = "CTX_COMMAND_CHAINING_PROHIBITED";
			throw err;
		}
		if (!Array.isArray(obj.args)) {
			throw new Error("Invalid verification specification: args must be an array of strings");
		}
		for (const arg of obj.args) {
			if (typeof arg !== "string") {
				throw new Error("Invalid verification specification: every arg must be a string");
			}
		}

		const timeoutMs = typeof obj.timeoutMs === "number" && obj.timeoutMs > 0 ? obj.timeoutMs : 60000;
		const required = obj.required !== false;
		const network = obj.network === "allow" ? "allow" : "deny";
		const allowedOutputPaths = Array.isArray(obj.allowedOutputPaths) ? obj.allowedOutputPaths : [];

		return {
			schemaVersion: typeof obj.schemaVersion === "number" ? obj.schemaVersion : 1,
			executable: obj.executable
				.trim()
				.toLowerCase()
				.replace(/\.(cmd|bat|exe)$/i, ""),
			args: [...obj.args],
			timeoutMs,
			required,
			network,
			allowedOutputPaths,
			cwd: typeof obj.cwd === "string" ? obj.cwd : undefined,
			env: typeof obj.env === "object" && obj.env !== null ? { ...obj.env } : undefined,
			trusted: obj.trusted === true,
			isLegacyString: false,
		};
	}

	if (typeof input === "string") {
		const trimmed = input.trim();
		if (!trimmed) {
			throw new Error("Verification command cannot be empty string");
		}

		// Ban shell metacharacters and chaining
		if (/[&|;`$><%]/.test(trimmed)) {
			const err = new Error(
				"Security error: Shell metacharacters and command chaining are not permitted in verify_command",
			);
			(err as any).code = "CTX_COMMAND_CHAINING_PROHIBITED";
			throw err;
		}

		const parts = trimmed.split(/\s+/);
		const rawExe = parts[0].toLowerCase().replace(/\.(cmd|bat|exe)$/i, "");
		const args = parts.slice(1);

		return {
			schemaVersion: 1,
			executable: rawExe,
			args,
			timeoutMs: 60000,
			required: true,
			network: "deny",
			isLegacyString: true,
		};
	}

	throw new Error("Invalid verification specification format: expected VerificationSpec object or command string");
}

/**
 * Enforces command trust policy (Section 16.2).
 */
export function validateCommandTrust(
	spec: VerificationSpec,
	options: { runnerMode?: "host-unsafe" | "oci"; trusted?: boolean } = {},
): void {
	const runnerMode = options.runnerMode || "host-unsafe";

	// Rule 1: npx is forbidden in host mode (Section 16.2: "npx запрещён в host mode")
	if (spec.executable === "npx" && runnerMode === "host-unsafe") {
		const err = new Error(
			'Security error: "npx" execution is strictly forbidden in host mode. Use OCI sandbox or local package runner.',
		);
		(err as any).code = "CTX_COMMAND_UNTRUSTED";
		throw err;
	}

	// Rule 2: Unlisted tools require OCI runner or explicit local trust
	if (!ALLOWED_VERIFY_TOOLS.has(spec.executable)) {
		if (runnerMode === "host-unsafe" && !options.trusted && !spec.trusted) {
			const err = new Error(
				`Security error: Command "${spec.executable}" is not in the trusted tools whitelist (${Array.from(ALLOWED_VERIFY_TOOLS).join(", ")}). Arbitrary commands require OCI sandbox or explicit user trust.`,
			);
			(err as any).code = "CTX_COMMAND_UNTRUSTED";
			throw err;
		}
	}

	// Rule 3: Inline evaluation arguments prohibited
	for (const arg of spec.args) {
		if (FORBIDDEN_VERIFY_ARGS.has(arg.toLowerCase())) {
			const err = new Error(`Security error: Argument "${arg}" is not permitted in verify_command`);
			(err as any).code = "CTX_FORBIDDEN_ARGUMENT";
			throw err;
		}
	}
}

/**
 * Checks that the working tree and candidate commit remained immutable (Section 16.3).
 */
export function verifyCandidateImmutability(
	worktreePath: string,
	expectedHeadSha?: string,
): { clean: boolean; mutatedHead?: boolean; dirtyFiles?: string[] } {
	try {
		const currentHead = execFileSync("git", ["rev-parse", "HEAD"], {
			cwd: worktreePath,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		}).trim();

		if (expectedHeadSha && currentHead !== expectedHeadSha) {
			return { clean: false, mutatedHead: true };
		}

		const statusOutput = execFileSync("git", ["status", "--porcelain"], {
			cwd: worktreePath,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		}).trim();

		if (statusOutput.length > 0) {
			const internal = new Set([".contextos-owner", ".contextos-session"]);
			const dirtyFiles = statusOutput
				.split("\n")
				.map((l) => l.trim().slice(3).trim())
				.filter((f) => f && !internal.has(f));
			if (dirtyFiles.length > 0) {
				return { clean: false, mutatedHead: false, dirtyFiles };
			}
		}

		return { clean: true };
	} catch (e: any) {
		// Non-git directory or git failure: fail closed
		return { clean: false, mutatedHead: false, dirtyFiles: [`git-failure: ${e.message || "unknown"}`] };
	}
}

export interface VerificationOptions {
	expectedHeadSha?: string;
	runnerMode?: "host-unsafe" | "oci";
	sandboxMode?: SandboxMode;
	sandbox?: ExecutionSandbox;
	trusted?: boolean;
	signal?: AbortSignal;
}

/**
 * Executes worktree verification with strict security guards and lifecycle management.
 */
export async function runWorktreeVerification(
	worktreePath: string,
	commandOrSpec: string | VerificationSpec,
	options: VerificationOptions = {},
): Promise<{
	verdict: VerificationStatus;
	verified: boolean;
	output: string;
	exitCode: number | null;
	runnerMode?: "oci" | "host-unsafe";
}> {
	let spec: VerificationSpec;
	try {
		spec = parseVerificationSpec(commandOrSpec);
	} catch (err: unknown) {
		return {
			verdict: "ERROR",
			verified: false,
			output: err instanceof Error ? err.message : String(err),
			exitCode: null,
			runnerMode: "host-unsafe",
		};
	}

	try {
		validateCommandTrust(spec, options);
	} catch (err: unknown) {
		return {
			verdict: "ERROR",
			verified: false,
			output: err instanceof Error ? err.message : String(err),
			exitCode: null,
			runnerMode: "host-unsafe",
		};
	}

	const exePath = await resolveExecutablePath(spec.executable);
	const targetExecutable = exePath || spec.executable;
	const executionCwd = spec.cwd ? path.resolve(worktreePath, spec.cwd) : worktreePath;

	if (!executionCwd.startsWith(path.resolve(worktreePath))) {
		return {
			verdict: "ERROR",
			verified: false,
			output: `Security Violation: execution cwd "${executionCwd}" escapes worktree root.`,
			exitCode: null,
			runnerMode: "host-unsafe",
		};
	}

	// OCI Execution Sandbox Path (Milestones W5.3 and W5.4)
	if (options.sandbox || options.sandboxMode || options.runnerMode === "oci") {
		const sandbox =
			options.sandbox ||
			new ExecutionSandbox({
				mode: options.sandboxMode || (options.runnerMode === "oci" ? "oci-required" : "oci-preferred"),
			});

		try {
			const res = await sandbox.execute(executionCwd, [targetExecutable, ...spec.args], {
				signal: options.signal,
				timeoutMs: spec.timeoutMs,
			});

			if (res.exitCode === 0) {
				const immutability = verifyCandidateImmutability(worktreePath, options.expectedHeadSha);
				if (!immutability.clean) {
					if (immutability.mutatedHead) {
						return {
							verdict: "STALE",
							verified: false,
							output: "Security violation: Verification test command mutated candidate branch commit HEAD",
							exitCode: res.exitCode,
							runnerMode: res.runnerMode,
						};
					}
					if (immutability.dirtyFiles && immutability.dirtyFiles.length > 0) {
						return {
							verdict: "STALE",
							verified: false,
							output: `Security violation: Verification test left uncommitted dirty files in worktree (${immutability.dirtyFiles.join(", ")})`,
							exitCode: res.exitCode,
							runnerMode: res.runnerMode,
						};
					}
				}
			}

			return {
				verdict: res.success ? "PASS" : "FAIL",
				verified: res.success,
				output: res.redactedOutput.trim().slice(0, 1500),
				exitCode: res.exitCode,
				runnerMode: res.runnerMode,
			};
		} catch (err: any) {
			const isOciUnavailable = err?.code === "CTX_SANDBOX_OCI_UNAVAILABLE";
			const isDigestMismatch = err?.code === "CTX_SANDBOX_DIGEST_MISMATCH";
			const isSecurityViolation = err?.code?.startsWith?.("SEC-") || err?.code === "CTX_SECURITY_VIOLATION";

			const verdict: VerificationStatus = isOciUnavailable
				? "UNAVAILABLE"
				: isDigestMismatch || isSecurityViolation
					? "ERROR"
					: "ERROR";

			return {
				verdict,
				verified: false,
				output: err?.message || String(err),
				exitCode: null,
				runnerMode: "host-unsafe",
			};
		}
	}

	return new Promise((resolveResult) => {
		let settled = false;
		const finish = (verdict: VerificationStatus, rawOutput: string, exitCode: number | null) => {
			if (settled) return;
			settled = true;
			const cleanOutput = redactSensitiveOutput(rawOutput).trim().slice(0, 1500);
			resolveResult({
				verdict,
				verified: verdict === "PASS",
				output: cleanOutput,
				exitCode,
				runnerMode: "host-unsafe",
			});
		};

		let child: ReturnType<typeof spawn> | null = null;
		const timeoutMs = spec.timeoutMs || 60000;
		const timeout = setTimeout(() => {
			if (child?.pid) {
				killProcessTree(child.pid);
			}
			finish("TIMEOUT", `Verification timed out after ${timeoutMs}ms`, null);
		}, timeoutMs);

		const onAbort = () => {
			if (child?.pid) {
				killProcessTree(child.pid);
			}
			clearTimeout(timeout);
			finish("CANCELLED" as any, "Verification cancelled by abort signal", null);
		};

		if (options.signal?.aborted) {
			clearTimeout(timeout);
			finish("CANCELLED" as any, "Verification already aborted", null);
			return;
		}

		if (options.signal) {
			options.signal.addEventListener("abort", onAbort, { once: true });
		}

		try {
			child = spawn(targetExecutable, [...spec.args], {
				cwd: executionCwd,
				env: getSanitizedEnv((spec.env as Record<string, string>) || {}),
				shell: false,
				stdio: ["ignore", "pipe", "pipe"],
				windowsHide: true,
			});

			let stdout = "";
			let stderr = "";

			child.stdout?.on("data", (d) => {
				if (stdout.length < 50000) stdout += d.toString();
			});
			child.stderr?.on("data", (d) => {
				if (stderr.length < 50000) stderr += d.toString();
			});

			child.on("close", (code) => {
				clearTimeout(timeout);
				if (options.signal) {
					options.signal.removeEventListener("abort", onAbort);
				}

				if (code === 0) {
					// Post-execution candidate immutability verification (Section 16.3)
					const immutability = verifyCandidateImmutability(worktreePath, options.expectedHeadSha);
					if (!immutability.clean) {
						if (immutability.mutatedHead) {
							finish(
								"STALE",
								"Security violation: Verification test command mutated candidate branch commit HEAD",
								code,
							);
							return;
						}
						if (immutability.dirtyFiles && immutability.dirtyFiles.length > 0) {
							finish(
								"STALE",
								`Security violation: Verification test left uncommitted dirty files in worktree (${immutability.dirtyFiles.join(", ")})`,
								code,
							);
							return;
						}
					}
				}

				const output = `${stdout}\n${stderr}`;
				finish(code === 0 ? "PASS" : "FAIL", output, code);
			});

			child.on("error", (err) => {
				clearTimeout(timeout);
				if (options.signal) {
					options.signal.removeEventListener("abort", onAbort);
				}
				finish("ERROR", `Verification execution failed: ${err.message}`, null);
			});
		} catch (err: unknown) {
			clearTimeout(timeout);
			if (options.signal) {
				options.signal.removeEventListener("abort", onAbort);
			}
			finish("ERROR", err instanceof Error ? err.message : String(err), null);
		}
	});
}
