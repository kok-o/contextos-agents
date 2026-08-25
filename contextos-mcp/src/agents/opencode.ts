/**
 * OpenCode agent backend.
 *
 * Three execution modes (in priority order):
 *   1. Server mode: Connects to a managed `opencode serve` instance via HTTP API.
 *      Avoids cold-start overhead. Server is shared across threads.
 *   2. Attach mode: Uses `opencode run --attach <url>` to connect to a running server.
 *      Falls back here if direct HTTP API call fails.
 *   3. Subprocess mode: Cold-starts `opencode run --format json` per invocation.
 *      Always-available fallback.
 *
 * The server pool manages lifecycle of `opencode serve` processes, starting them
 * lazily and shutting them down when the session ends.
 */

import { type ChildProcess, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import type { AgentProvider, AgentResult, AgentRunOptions } from "../core/types.js";
import { registerAgent } from "./provider.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensure model string is in `provider/model` format as required by OpenCode.
 * If no provider prefix is present, infer it from the model name.
 */
function normalizeModelForOpenCode(model: string): string {
	if (model.includes("/")) return model;

	// Infer provider from model name prefix patterns
	if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3") || model.startsWith("o4")) {
		return `openai/${model}`;
	}
	if (model.startsWith("claude-")) {
		return `anthropic/${model}`;
	}
	if (model.startsWith("gemini-")) {
		return `google/${model}`;
	}
	if (model.startsWith("deepseek-")) {
		return `deepseek/${model}`;
	}
	if (model.startsWith("llama-") || model.startsWith("codellama-")) {
		return `ollama/${model}`;
	}
	// Can't infer — return as-is and let OpenCode handle it
	return model;
}

async function commandExists(cmd: string): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("which", [cmd], { stdio: "pipe" });
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
}

interface OpenCodeJsonOutput {
	session_id?: string;
	messages?: Array<{
		role: string;
		content: string;
		tool_calls?: Array<{ name: string; input: Record<string, unknown> }>;
		tool_results?: Array<{ name: string; output: string }>;
	}>;
	error?: string;
	/** Token usage reported by OpenCode (if available). */
	usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
		prompt_tokens?: number;
		completion_tokens?: number;
	};
	/** Alternative usage location — some versions report per-message usage. */
	total_usage?: {
		input_tokens?: number;
		output_tokens?: number;
		total_tokens?: number;
	};
}

/** Extract JSON object from mixed stdout (may contain non-JSON lines before/after). */
function extractJson(raw: string): OpenCodeJsonOutput | null {
	try {
		return JSON.parse(raw) as OpenCodeJsonOutput;
	} catch {
		/* mixed output — try extraction */
	}

	const firstBrace = raw.indexOf("{");
	const lastBrace = raw.lastIndexOf("}");
	if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;

	try {
		return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as OpenCodeJsonOutput;
	} catch {
		return null;
	}
}

/** Extract output text, file changes, and token usage from parsed JSON. */
function extractFromParsed(parsed: OpenCodeJsonOutput): {
	output: string;
	filesChanged: string[];
	error?: string;
	usage?: import("../core/types.js").TokenUsage;
} {
	if (parsed.error) {
		return { output: parsed.error, filesChanged: [], error: parsed.error };
	}

	let output = "";
	const filesChanged: string[] = [];

	if (parsed.messages) {
		const assistantMsgs = parsed.messages.filter((m) => m.role === "assistant");
		if (assistantMsgs.length > 0) {
			output = assistantMsgs[assistantMsgs.length - 1].content;
		}

		for (const msg of parsed.messages) {
			if (msg.tool_calls) {
				for (const tc of msg.tool_calls) {
					if (tc.name === "write" || tc.name === "edit") {
						const filePath = tc.input.file_path || tc.input.path;
						if (typeof filePath === "string") {
							filesChanged.push(filePath);
						}
					}
				}
			}
		}
	}

	// Extract token usage from various possible locations
	let usage: import("../core/types.js").TokenUsage | undefined;
	const u = (parsed.usage || parsed.total_usage) as Record<string, number | undefined> | undefined;
	if (u) {
		const inputTokens = u.input_tokens ?? u.prompt_tokens ?? 0;
		const outputTokens = u.output_tokens ?? u.completion_tokens ?? 0;
		if (inputTokens > 0 || outputTokens > 0) {
			usage = {
				inputTokens,
				outputTokens,
				totalTokens: u.total_tokens || inputTokens + outputTokens,
			};
		}
	}

	return { output, filesChanged: [...new Set(filesChanged)], usage };
}

/** Whitelist of env vars safe to pass to agent subprocess. */
function buildAgentEnv(): Record<string, string | undefined> {
	const homeDir = os.homedir();

	// Isolate OpenCode's data dir to prevent stale auth tokens (e.g. expired
	// OAuth) from causing "Model not found" errors on startup.
	const agentDataDir = path.join(homeDir, ".swarm", "agent-data");
	try {
		fs.mkdirSync(agentDataDir, { recursive: true });
	} catch {
		// Non-fatal
	}

	return {
		PATH: process.env.PATH,
		HOME: homeDir,
		USERPROFILE: homeDir,
		SHELL: process.env.SHELL,
		TERM: process.env.TERM,
		LANG: process.env.LANG,
		TMPDIR: process.env.TMPDIR,
		XDG_DATA_HOME: agentDataDir,
		ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		GEMINI_API_KEY: process.env.GEMINI_API_KEY,
		OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
		GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME,
		GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL,
		GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME,
		GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL,
		...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
		...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
	};
}

// ── OpenCode Server Pool ─────────────────────────────────────────────────────

interface ManagedServer {
	process: ChildProcess;
	url: string;
	port: number;
	cwd: string;
	ready: boolean;
	readyPromise: Promise<void>;
}

/**
 * Manages a pool of `opencode serve` processes.
 * One server per unique working directory (worktree).
 * Servers are started lazily and reused across thread invocations.
 */
class OpenCodeServerPool {
	private servers: Map<string, ManagedServer> = new Map();
	private pendingStarts: Map<string, Promise<string | null>> = new Map();
	private nextPort = 14096; // Start from a high port to avoid conflicts
	private shuttingDown = false;

	/**
	 * Get or create a server for the given working directory.
	 * Returns the server URL if successful, null if server mode is unavailable.
	 * Uses pendingStarts to prevent race conditions from concurrent getServer() calls.
	 */
	async getServer(cwd: string): Promise<string | null> {
		if (this.shuttingDown) return null;

		const existing = this.servers.get(cwd);
		if (existing) {
			// Wait for it to be ready
			try {
				await existing.readyPromise;
				// Verify still alive
				if (existing.process.exitCode === null) {
					return existing.url;
				}
				// Dead — clean up and retry
				this.servers.delete(cwd);
			} catch {
				this.servers.delete(cwd);
			}
		}

		// Prevent concurrent startServer for the same cwd
		const pending = this.pendingStarts.get(cwd);
		if (pending) return pending;

		const startPromise = this.startServer(cwd).finally(() => {
			this.pendingStarts.delete(cwd);
		});
		this.pendingStarts.set(cwd, startPromise);
		return startPromise;
	}

	private async startServer(cwd: string): Promise<string | null> {
		const port = this.nextPort++;
		const hostname = "127.0.0.1";

		let resolveReady: () => void;
		let rejectReady: (err: Error) => void;
		const readyPromise = new Promise<void>((resolve, reject) => {
			resolveReady = resolve;
			rejectReady = reject;
		});
		// Prevent unhandled rejection crash — timeout/exit rejections are
		// communicated via the null return from startServer(), not via this promise.
		readyPromise.catch(() => {});

		const proc = spawn("opencode", ["serve", "--port", String(port), "--hostname", hostname], {
			cwd,
			stdio: ["ignore", "pipe", "pipe"],
			env: buildAgentEnv(),
		});

		const server: ManagedServer = {
			process: proc,
			url: `http://${hostname}:${port}`,
			port,
			cwd,
			ready: false,
			readyPromise,
		};

		this.servers.set(cwd, server);

		// Listen for stderr to detect "listening on" or ready signal
		let stderr = "";
		proc.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on("error", () => {
			rejectReady!(new Error("Failed to start opencode serve"));
			this.servers.delete(cwd);
		});

		proc.on("exit", () => {
			if (!server.ready) {
				rejectReady!(new Error(`opencode serve exited early: ${stderr.slice(0, 200)}`));
			}
			this.servers.delete(cwd);
		});

		// Poll for health endpoint readiness (up to 10s)
		const startTime = Date.now();
		const maxWait = 10000;
		const pollInterval = 200;

		while (Date.now() - startTime < maxWait) {
			if (proc.exitCode !== null) {
				rejectReady!(new Error("opencode serve exited during startup"));
				return null;
			}

			try {
				const healthy = await this.healthCheck(server.url);
				if (healthy) {
					server.ready = true;
					resolveReady!();
					return server.url;
				}
			} catch {
				// Not ready yet
			}
			await new Promise((r) => setTimeout(r, pollInterval));
		}

		// Timeout — kill and return null (will fall back to subprocess mode)
		this.killServer(server);
		rejectReady!(new Error("opencode serve startup timeout"));
		return null;
	}

	private healthCheck(baseUrl: string): Promise<boolean> {
		return new Promise((resolve) => {
			const req = http.get(`${baseUrl}/global/health`, { timeout: 2000 }, (res) => {
				let body = "";
				res.on("data", (d) => {
					body += d;
				});
				res.on("end", () => {
					try {
						const data = JSON.parse(body);
						resolve(data.healthy === true);
					} catch {
						resolve(false);
					}
				});
			});
			req.on("error", () => resolve(false));
			req.on("timeout", () => {
				req.destroy();
				resolve(false);
			});
		});
	}

	private killServer(server: ManagedServer): void {
		try {
			server.process.kill("SIGTERM");
			setTimeout(() => {
				try {
					if (server.process.exitCode === null) server.process.kill("SIGKILL");
				} catch {
					/* ok */
				}
			}, 3000);
		} catch {
			/* already dead */
		}
		this.servers.delete(server.cwd);
	}

	/** Shut down all managed servers. */
	async shutdown(): Promise<void> {
		this.shuttingDown = true;
		for (const [, server] of this.servers) {
			this.killServer(server);
		}
		this.servers.clear();
	}

	get activeCount(): number {
		return this.servers.size;
	}
}

// Module-level server pool (shared across all opencode agent invocations)
const serverPool = new OpenCodeServerPool();

// ── HTTP API execution ───────────────────────────────────────────────────────

/**
 * Execute a task via the OpenCode HTTP API (server mode).
 * Creates a session, sends the message, waits for response.
 */
async function runViaHttpApi(
	serverUrl: string,
	task: string,
	model?: string,
	signal?: AbortSignal,
): Promise<{
	output: string;
	filesChanged: string[];
	sessionId?: string;
	usage?: import("../core/types.js").TokenUsage;
} | null> {
	try {
		// 1. Create session
		const sessionRes = await httpPost(`${serverUrl}/session`, {});
		if (!sessionRes || !sessionRes.id) return null;
		const sessionId = sessionRes.id;

		// 2. Send message
		const msgBody: Record<string, unknown> = {
			parts: [{ type: "text", text: task }],
		};
		if (model) msgBody.model = normalizeModelForOpenCode(model);

		const msgRes = await httpPost(`${serverUrl}/session/${sessionId}/message`, msgBody, signal);
		if (!msgRes) return null;

		// 3. Extract output from response
		let output = "";
		const filesChanged: string[] = [];

		if (msgRes.parts) {
			for (const part of msgRes.parts as Array<Record<string, unknown>>) {
				if (part.type === "text" && typeof part.text === "string") {
					output += part.text;
				}
				if (part.type === "tool_use" || part.type === "tool_call") {
					const name = part.name as string;
					const input = part.input as Record<string, unknown> | undefined;
					if ((name === "write" || name === "edit") && input) {
						const fp = input.file_path || input.path;
						if (typeof fp === "string") filesChanged.push(fp);
					}
				}
			}
		}

		// Also check info.content for assistant messages
		const info = msgRes.info as Record<string, unknown> | undefined;
		if (info?.content && typeof info.content === "string") {
			if (!output) output = info.content;
		}

		// Extract token usage from response (may be in usage, total_usage, or info.usage)
		let usage: import("../core/types.js").TokenUsage | undefined;
		const u = (msgRes.usage ?? msgRes.total_usage ?? (info as Record<string, unknown> | undefined)?.usage) as
			| Record<string, number | undefined>
			| undefined;
		if (u) {
			const inputTokens = u.input_tokens ?? u.prompt_tokens ?? 0;
			const outputTokens = u.output_tokens ?? u.completion_tokens ?? 0;
			if (inputTokens > 0 || outputTokens > 0) {
				usage = {
					inputTokens,
					outputTokens,
					totalTokens: u.total_tokens ?? inputTokens + outputTokens,
				};
			}
		}

		return { output, filesChanged: [...new Set(filesChanged)], sessionId: sessionId as string, usage };
	} catch {
		return null;
	}
}

function httpPost(
	url: string,
	body: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<Record<string, unknown> | null> {
	return new Promise((resolve) => {
		const data = JSON.stringify(body);
		const parsed = new URL(url);

		const req = http.request(
			{
				hostname: parsed.hostname,
				port: parsed.port,
				path: parsed.pathname,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(data),
				},
				timeout: 300000, // 5 min for long tasks
			},
			(res) => {
				let responseBody = "";
				res.on("data", (d) => {
					responseBody += d;
				});
				res.on("end", () => {
					// Reject non-2xx status codes
					const status = res.statusCode ?? 0;
					if (status < 200 || status >= 300) {
						resolve(null);
						return;
					}
					try {
						resolve(JSON.parse(responseBody));
					} catch {
						resolve(null);
					}
				});
			},
		);

		req.on("error", () => resolve(null));
		req.on("timeout", () => {
			req.destroy();
			resolve(null);
		});

		if (signal) {
			const onAbort = () => req.destroy();
			if (signal.aborted) {
				req.destroy();
				resolve(null);
				return;
			}
			signal.addEventListener("abort", onAbort, { once: true });
			req.on("close", () => signal.removeEventListener("abort", onAbort));
		}

		req.write(data);
		req.end();
	});
}

// ── Attach mode execution ────────────────────────────────────────────────────

/**
 * Execute via `opencode run --attach <url>` — connects to a running server
 * but uses the CLI's output parsing.
 */
function runViaAttach(
	serverUrl: string,
	task: string,
	workDir: string,
	model?: string,
	signal?: AbortSignal,
	onOutput?: (chunk: string) => void,
): Promise<AgentResult> {
	const startTime = Date.now();
	const args = ["run", "--attach", serverUrl, "--format", "json"];
	if (model) args.push("--model", normalizeModelForOpenCode(model));
	args.push(task);

	return runSubprocess(args, workDir, startTime, signal, onOutput);
}

// ── Subprocess mode execution ────────────────────────────────────────────────

/**
 * Execute via cold-start `opencode run` subprocess.
 * Always-available fallback.
 */
function runViaSubprocess(
	task: string,
	workDir: string,
	model?: string,
	signal?: AbortSignal,
	onOutput?: (chunk: string) => void,
): Promise<AgentResult> {
	const startTime = Date.now();
	const args = ["run", "--format", "json"];
	if (model) args.push("--model", normalizeModelForOpenCode(model));
	args.push(task);

	return runSubprocess(args, workDir, startTime, signal, onOutput);
}

/** Shared subprocess runner for both attach and cold-start modes. */
function runSubprocess(
	args: string[],
	workDir: string,
	startTime: number,
	signal?: AbortSignal,
	onOutput?: (chunk: string) => void,
): Promise<AgentResult> {
	return new Promise<AgentResult>((resolve) => {
		const proc = spawn("opencode", args, {
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
			onOutput?.(text);
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
						/* dead */
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
			let filesChanged: string[] = [];
			let output = stdout;

			const parsed = extractJson(stdout);
			let usage: import("../core/types.js").TokenUsage | undefined;
			if (parsed) {
				const extracted = extractFromParsed(parsed);
				if (extracted.error) {
					doResolve({
						success: false,
						output: extracted.error,
						filesChanged: [],
						diff: "",
						durationMs,
						error: extracted.error,
						usage: extracted.usage,
					});
					return;
				}
				if (extracted.output) output = extracted.output;
				filesChanged = extracted.filesChanged;
				usage = extracted.usage;
			}

			doResolve({
				success: code === 0,
				output,
				filesChanged,
				diff: "",
				durationMs,
				error: code !== 0 ? `opencode exited with code ${code}${stderr ? `: ${stderr.slice(0, 500)}` : ""}` : undefined,
				usage,
			});
		});

		proc.on("error", (err) => {
			doResolve({
				success: false,
				output: "",
				filesChanged: [],
				diff: "",
				durationMs: Date.now() - startTime,
				error: `Failed to spawn opencode: ${err.message}`,
			});
		});
	});
}

// ── Provider ─────────────────────────────────────────────────────────────────

// Whether server mode is enabled (set via enableServerMode)
let _serverModeEnabled = false;

/** Enable server mode for the OpenCode agent. Call before spawning threads. */
export function enableServerMode(): void {
	_serverModeEnabled = true;
}

/** Disable server mode and shut down all managed servers. */
export async function disableServerMode(): Promise<void> {
	_serverModeEnabled = false;
	await serverPool.shutdown();
}

/** Get the number of active server instances. */
export function getActiveServerCount(): number {
	return serverPool.activeCount;
}

const openCodeProvider: AgentProvider = {
	name: "opencode",

	async isAvailable(): Promise<boolean> {
		return commandExists("opencode");
	},

	async run(options: AgentRunOptions): Promise<AgentResult> {
		const { task, workDir, model, signal, onOutput } = options;
		const startTime = Date.now();

		// Strategy 1: Server mode (HTTP API)
		if (_serverModeEnabled) {
			try {
				const serverUrl = await serverPool.getServer(workDir);
				if (serverUrl) {
					const apiResult = await runViaHttpApi(serverUrl, task, model, signal);
					if (apiResult) {
						return {
							success: true,
							output: apiResult.output,
							filesChanged: apiResult.filesChanged,
							diff: "",
							durationMs: Date.now() - startTime,
							usage: apiResult.usage,
						};
					}

					// API call failed — try attach mode with the same server
					try {
						return await runViaAttach(serverUrl, task, workDir, model, signal, onOutput);
					} catch {
						// Fall through to subprocess
					}
				}
			} catch {
				// Server mode unavailable — fall through
			}
		}

		// Strategy 2: Subprocess mode (always-available fallback)
		return runViaSubprocess(task, workDir, model, signal, onOutput);
	},
};

registerAgent(openCodeProvider);
export default openCodeProvider;
