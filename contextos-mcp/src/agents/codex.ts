/**
 * Codex CLI agent backend (OpenAI).
 *
 * Runs tasks via `codex exec --json --full-auto "prompt"` subprocess.
 * Codex CLI is OpenAI's open-source coding agent.
 *
 * Output format: JSONL events streamed to stdout, with event types:
 *   - thread.started, turn.started, turn.completed, turn.failed
 *   - item.started, item.updated, item.completed
 * Item types: assistant_message, command_execution, file_change, etc.
 */

import { spawn } from "node:child_process";
import * as os from "node:os";
import type { AgentProvider, AgentResult, AgentRunOptions } from "../core/types.js";
import { registerAgent } from "./provider.js";

async function commandExists(cmd: string): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("which", [cmd], { stdio: "pipe" });
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
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
		// Codex uses CODEX_API_KEY or OPENAI_API_KEY
		CODEX_API_KEY: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
		// Codex config home
		CODEX_HOME: process.env.CODEX_HOME,
		// Git config
		GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
		GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
		GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
		GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
		// Windows
		...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
		...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
	};
}

/** Map provider/model format to codex model flag. */
function resolveModel(model: string): string {
	// Strip provider prefix (e.g., "openai/o3" → "o3")
	return model.includes("/") ? model.split("/").pop()! : model;
}

interface CodexJsonEvent {
	type: string;
	item_type?: string;
	message?: { content?: string };
	content?: string;
	error?: string;
	usage?: { input_tokens?: number; output_tokens?: number };
	file_path?: string;
}

/** Parse JSONL output to extract result, file changes, and token usage. */
function parseCodexJsonl(stdout: string): {
	output: string;
	filesChanged: string[];
	success: boolean;
	error?: string;
	usage?: import("../core/types.js").TokenUsage;
} {
	const lines = stdout.trim().split("\n").filter(Boolean);
	let output = "";
	const filesChanged: string[] = [];
	let success = true;
	let error: string | undefined;
	let totalInput = 0;
	let totalOutput = 0;

	for (const line of lines) {
		try {
			const event: CodexJsonEvent = JSON.parse(line);

			if (event.type === "turn.failed") {
				success = false;
				error = event.error || "Turn failed";
			}

			if (event.type === "item.completed") {
				if (event.item_type === "assistant_message") {
					// Capture assistant messages
					const content = event.message?.content || event.content || "";
					if (content) output += (output ? "\n" : "") + content;
				}
				if (event.item_type === "file_change" && event.file_path) {
					filesChanged.push(event.file_path);
				}
			}

			// Accumulate token usage from events
			if (event.usage) {
				totalInput += event.usage.input_tokens ?? 0;
				totalOutput += event.usage.output_tokens ?? 0;
			}
		} catch {
			// Non-JSON line — ignore
		}
	}

	let usage: import("../core/types.js").TokenUsage | undefined;
	if (totalInput > 0 || totalOutput > 0) {
		usage = {
			inputTokens: totalInput,
			outputTokens: totalOutput,
			totalTokens: totalInput + totalOutput,
		};
	}

	return { output, filesChanged: [...new Set(filesChanged)], success, error, usage };
}

const codexProvider: AgentProvider = {
	name: "codex",

	async isAvailable(): Promise<boolean> {
		return commandExists("codex");
	},

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const { task, workDir, model, files, signal } = options;
		const startTime = Date.now();

		const args = ["exec", "--json", "--full-auto", "--ephemeral", "--skip-git-repo-check", "--cd", workDir];

		if (model) {
			args.push("--model", resolveModel(model));
		}

		// Build the prompt — include file hints if provided
		let prompt = task;
		if (files && files.length > 0) {
			prompt += `\n\nRelevant files to focus on:\n${files.map((f) => `- ${f}`).join("\n")}`;
		}
		args.push(prompt);

		return new Promise<AgentResult>((resolve) => {
			const proc = spawn("codex", args, {
				cwd: workDir,
				stdio: ["ignore", "pipe", "pipe"],
				env: buildAgentEnv(),
			});

			let stdout = "";
			let stderr = "";
			let resolved = false;

			const doResolve = (result: AgentResult) => {
				if (resolved) return;
				resolved = true;
				resolve(result);
			};

			proc.stdout?.on("data", (chunk: Buffer) => {
				const text = chunk.toString();
				stdout += text;
				options.onOutput?.(text);
			});

			proc.stderr?.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
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
				const durationMs = Date.now() - startTime;

				// Parse JSONL events
				const parsed = parseCodexJsonl(stdout);

				doResolve({
					success: code === 0 && parsed.success,
					output: parsed.output || stdout || stderr,
					filesChanged: parsed.filesChanged,
					diff: "", // Diff is captured separately by worktree manager
					durationMs,
					error:
						parsed.error ||
						(code !== 0 ? `codex exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}` : undefined),
					usage: parsed.usage,
				});
			});

			proc.on("error", (err) => {
				doResolve({
					success: false,
					output: "",
					filesChanged: [],
					diff: "",
					durationMs: Date.now() - startTime,
					error: `Failed to spawn codex: ${err.message}`,
				});
			});
		});
	},
};

registerAgent(codexProvider);
export default codexProvider;
