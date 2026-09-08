/**
 * Claude Code agent backend.
 *
 * Runs tasks via `claude -p --output-format json "prompt"` subprocess.
 * Parses structured JSON output for results, cost, and file changes.
 */

import * as os from "node:os";
import type { AgentProvider, AgentResult, AgentRunOptions } from "../core/types.js";
import { commandExists } from "../utils/command-exists.js";
import { RollingBuffer } from "../utils/rolling-buffer.js";
import { safeSpawn } from "../utils/safe-spawn.js";
import { registerAgent } from "./provider.js";

interface ClaudeCodeJsonOutput {
	type: "result";
	subtype: "success" | string;
	is_error: boolean;
	duration_ms: number;
	duration_api_ms?: number;
	num_turns: number;
	result: string;
	session_id: string;
	cost_usd: number;
	total_cost_usd?: number;
	model?: string;
	usage?: {
		input_tokens: number;
		output_tokens: number;
		cache_read_input_tokens?: number;
		cache_creation_input_tokens?: number;
	};
}

/** Extract JSON result from output (may contain non-JSON lines from debug/stderr bleed). */
function extractJson(raw: string): ClaudeCodeJsonOutput | null {
	// Try direct parse first
	try {
		return JSON.parse(raw) as ClaudeCodeJsonOutput;
	} catch {
		/* mixed output */
	}

	// Try last line (claude outputs JSON as final line)
	const lines = raw.trim().split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (line.startsWith("{")) {
			try {
				const parsed = JSON.parse(line) as ClaudeCodeJsonOutput;
				if (parsed.type === "result") return parsed;
			} catch {}
		}
	}

	// Fallback: find first { to last }
	const firstBrace = raw.indexOf("{");
	const lastBrace = raw.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		try {
			return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as ClaudeCodeJsonOutput;
		} catch {
			/* give up */
		}
	}

	return null;
}

/** Whitelist of env vars safe to pass to agent subprocess. */
function buildAgentEnv(): Record<string, string | undefined> {
	const homeDir = os.homedir();
	return {
		PATH: process.env.PATH,
		HOME: homeDir,
		USERPROFILE: homeDir,
		SHELL: process.env.SHELL,
		TERM: process.env.TERM,
		LANG: process.env.LANG,
		// Claude Code uses ANTHROPIC_API_KEY
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		// Git config
		GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
		GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
		GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
		GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
		// XDG dirs (claude may use for config)
		XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME,
		XDG_DATA_HOME: process.env.XDG_DATA_HOME,
		// Windows
		...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
		...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
	};
}

/** Map provider/model format to claude model flag. */
function resolveModel(model: string): string {
	// Strip provider prefix if present (e.g., "anthropic/claude-sonnet-4-6" → "claude-sonnet-4-6")
	const modelName = model.includes("/") ? model.split("/").pop()! : model;

	// Claude Code accepts short aliases
	const aliases: Record<string, string> = {
		"claude-sonnet-4-6": "sonnet",
		"claude-opus-4-6": "opus",
		"claude-haiku-4-5": "haiku",
	};

	return aliases[modelName] || modelName;
}

const claudeCodeProvider: AgentProvider = {
	name: "claude-code",

	async isAvailable(): Promise<boolean> {
		return commandExists("claude");
	},

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const { task, workDir, model, files, signal } = options;
		const startTime = Date.now();
		// SECURITY NOTICE & TRUST BOUNDARY:
		// --dangerously-skip-permissions is REQUIRED for non-interactive/headless Claude Code execution.
		// Trust model & isolation boundaries:
		//   1. Git Worktree Isolation: Agent runs in a dedicated git worktree branch, preventing concurrent
		//      edits or corruption in the user's primary working directory.
		//   2. Pre-Commit Filtering: Changed files are filtered before commit (isBlockedPath, isPathAllowed).
		//   3. Environment Sanitization: Child process environment is stripped of sensitive tokens via buildAgentEnv.
		//   4. OS Sandbox Notice: The child process runs with host OS user privileges and is NOT sandboxed
		//      at the kernel/syscall level. For untrusted code execution or multi-tenant hosting, ContextOS
		//      must be wrapped in an OS-level container (Docker, Podman) or OS sandbox (e.g. bubblewrap).
		const args = ["-p", "--output-format", "json", "--dangerously-skip-permissions", "--no-session-persistence"];

		if (model) {
			args.push("--model", resolveModel(model));
		}

		// Build the prompt — include file hints if provided
		let prompt = task;
		if (files && files.length > 0) {
			prompt += `\n\nRelevant files to focus on:\n${files.map((f) => `- ${f}`).join("\n")}`;
		}
		args.push(prompt);

		let proc;
		try {
			proc = await safeSpawn("claude", args, {
				cwd: workDir,
				stdio: ["ignore", "pipe", "pipe"],
				env: buildAgentEnv(),
			});
		} catch (err) {
			return {
				success: false,
				output: "",
				filesChanged: [],
				diff: "",
				error: `Failed to spawn claude: ${err instanceof Error ? err.message : String(err)}`,
				durationMs: 0,
			};
		}

		return new Promise<AgentResult>((resolve) => {
			const stdoutBuf = new RollingBuffer(2 * 1024 * 1024); // 2MB
			const stderrBuf = new RollingBuffer(512 * 1024); // 512KB
			let resolved = false;

			const doResolve = (result: AgentResult) => {
				if (resolved) return;
				resolved = true;
				resolve(result);
			};

			proc.stdout?.on("data", (chunk: Buffer) => {
				const text = chunk.toString();
				stdoutBuf.append(text);
				options.onOutput?.(text);
			});

			proc.stderr?.on("data", (chunk: Buffer) => {
				stderrBuf.append(chunk.toString());
			});

			if (signal) {
				const onAbort = () => {
					proc.kill("SIGTERM");
					const killTimer = setTimeout(() => {
						try {
							if (proc.exitCode === null) proc.kill("SIGKILL");
						} catch {
							/* already dead */
						}
					}, 3000);
					proc.on("exit", () => clearTimeout(killTimer));
				};
				if (signal.aborted) {
					onAbort();
				} else {
					signal.addEventListener("abort", onAbort, { once: true });
					proc.on("exit", () => signal.removeEventListener("abort", onAbort));
				}
			}

			proc.on("close", (code) => {
				const stdout = stdoutBuf.toString();
				const stderr = stderrBuf.toString();
				const durationMs = Date.now() - startTime;

				const parsed = extractJson(stdout);
				if (parsed) {
					// Extract token usage from Claude Code's structured output
					let usage: import("../core/types.js").TokenUsage | undefined;
					if (parsed.usage) {
						const inputTokens = parsed.usage.input_tokens ?? 0;
						const outputTokens = parsed.usage.output_tokens ?? 0;
						if (inputTokens > 0 || outputTokens > 0) {
							usage = {
								inputTokens,
								outputTokens,
								totalTokens: inputTokens + outputTokens,
							};
						}
					}

					if (parsed.is_error) {
						doResolve({
							success: false,
							output: parsed.result || stderr,
							filesChanged: [],
							diff: "",
							durationMs: parsed.duration_ms || durationMs,
							error: parsed.result || `Claude Code error: ${parsed.subtype}`,
							usage,
						});
						return;
					}

					doResolve({
						success: true,
						output: parsed.result || "",
						filesChanged: [], // Diff is captured separately by worktree manager
						diff: "",
						durationMs: parsed.duration_ms || durationMs,
						usage,
					});
					return;
				}

				// Fallback: no JSON parsed — use raw output
				doResolve({
					success: code === 0,
					output: stdout || stderr,
					filesChanged: [],
					diff: "",
					durationMs,
					error: code !== 0 ? `claude exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}` : undefined,
				});
			});

			proc.on("error", (err) => {
				doResolve({
					success: false,
					output: "",
					filesChanged: [],
					diff: "",
					durationMs: Date.now() - startTime,
					error: `Failed to spawn claude: ${err.message}`,
				});
			});
		});
	},
};

registerAgent(claudeCodeProvider);
export default claudeCodeProvider;
