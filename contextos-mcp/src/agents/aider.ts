/**
 * Aider agent backend.
 *
 * Runs tasks via `aider --yes-always --no-auto-commits --message "prompt"` subprocess.
 * Aider is a git-aware AI coding assistant that makes targeted edits.
 *
 * Output format: Plain text (no JSON mode available).
 * Edit confirmations appear as "Applied edit to <file>" lines.
 */

import * as os from "node:os";
import type { AgentProvider, AgentResult, AgentRunOptions } from "../core/types.js";
import { commandExists } from "../utils/command-exists.js";
import { RollingBuffer } from "../utils/rolling-buffer.js";
import { safeSpawn } from "../utils/safe-spawn.js";
import { registerAgent } from "./provider.js";

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
		// Aider supports multiple providers via these keys
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		GEMINI_API_KEY: process.env.GEMINI_API_KEY,
		// Aider-specific env vars
		AIDER_MODEL: process.env.AIDER_MODEL,
		AIDER_DARK_MODE: process.env.AIDER_DARK_MODE,
		// Git config
		GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
		GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
		GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
		GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
		// Python (aider is Python-based)
		VIRTUAL_ENV: process.env.VIRTUAL_ENV,
		CONDA_DEFAULT_ENV: process.env.CONDA_DEFAULT_ENV,
		PYTHONPATH: process.env.PYTHONPATH,
		// Windows
		...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
		...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
	};
}

/** Map provider/model format to aider model flag. */
function resolveModel(model: string): string {
	// Aider accepts provider/model format natively (e.g., "anthropic/claude-sonnet-4-6")
	// It also has short aliases: sonnet, opus, haiku, 4o, etc.
	return model;
}

/** Parse aider output to extract edited file paths. */
function extractFilesChanged(output: string): string[] {
	const files: string[] = [];

	// Aider outputs lines like:
	//   "Applied edit to src/auth.ts"
	//   "Wrote src/auth.ts"
	//   "Committing src/auth.ts ..."
	//   "Created new file src/utils.ts"
	const patterns = [
		/Applied edit to\s+(.+?)(?:\s*$)/gm,
		/Wrote\s+(.+?)(?:\s*$)/gm,
		/Committing\s+(.+?)(?:\s+\.\.\.|\s*$)/gm,
		/(?:Created|Added)\s+new file\s+(.+?)(?:\s*$)/gm,
	];

	for (const pattern of patterns) {
		let match;
		while ((match = pattern.exec(output)) !== null) {
			const file = match[1].trim();
			if (file) {
				files.push(file);
			}
		}
	}

	return [...new Set(files)];
}

const aiderProvider: AgentProvider = {
	name: "aider",

	async isAvailable(): Promise<boolean> {
		return commandExists("aider");
	},

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const { task, workDir, model, files, signal } = options;
		const startTime = Date.now();

		const args = [
			"--yes-always", // Auto-confirm all prompts (except shell commands)
			"--no-auto-commits", // Don't auto-commit (worktree manager handles commits)
			"--no-pretty", // Disable ANSI colors for clean parsing
			"--no-stream", // Don't stream (capture full output)
			"--no-fancy-input", // Disable prompt toolkit input
			"--no-suggest-shell-commands", // Suppress shell command suggestions
			"--no-detect-urls", // Suppress URL detection prompts
		];

		if (model) {
			args.push("--model", resolveModel(model));
		}

		// Pass the task via --message (non-interactive mode)
		args.push("--message", task);

		// Add specific files to edit if provided
		if (files && files.length > 0) {
			for (const file of files) {
				args.push("--file", file);
			}
		}

		let proc;
		try {
			proc = await safeSpawn("aider", args, {
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
				error: `Failed to spawn aider: ${err instanceof Error ? err.message : String(err)}`,
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
				const filesChanged = extractFilesChanged(stdout);

				doResolve({
					success: code === 0,
					output: stdout || stderr,
					filesChanged,
					diff: "", // Diff is captured separately by worktree manager
					durationMs,
					error: code !== 0 ? `aider exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}` : undefined,
				});
			});

			proc.on("error", (err) => {
				doResolve({
					success: false,
					output: "",
					filesChanged: [],
					diff: "",
					durationMs: Date.now() - startTime,
					error: `Failed to spawn aider: ${err.message}`,
				});
			});
		});
	},
};

registerAgent(aiderProvider);
export default aiderProvider;
