/**
 * Persistent Python REPL manager for swarm-code.
 *
 * Spawns a single Python subprocess running `runtime.py` and keeps it alive
 * across multiple RLM iterations. Communication uses line-delimited JSON
 * over stdin/stdout.
 *
 * Extended from rlm-cli with thread_request and merge_request handlers.
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";

/**
 * Verify Python 3 is available. Throws a clear error if not found.
 */
function ensurePython(cmd: string): void {
	try {
		const version = execFileSync(cmd, ["--version"], {
			encoding: "utf-8",
			timeout: 5000,
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		const major = Number.parseInt(version.replace(/^Python\s*/, "").split(".")[0], 10);
		if (major < 3) {
			throw new Error(`swarm-code requires Python 3 but found ${version}. Install Python 3.x from https://python.org`);
		}
	} catch (err: any) {
		if (err.code === "ENOENT") {
			throw new Error(
				`swarm-code requires Python 3 but "${cmd}" was not found on PATH. Install Python 3.x from https://python.org`,
			);
		}
		throw err;
	}
}

// ── Types ───────────────────────────────────────────────────────────────────

/** Result of executing a code snippet in the REPL. */
export interface ExecResult {
	stdout: string;
	stderr: string;
	hasFinal: boolean;
	finalValue: string | null;
}

/** Callback the host provides to handle llm_query() calls from Python. */
export type LlmQueryHandler = (subContext: string, instruction: string) => Promise<string>;

/** Callback the host provides to handle thread() calls from Python. */
export type ThreadHandler = (
	task: string,
	context: string,
	agentBackend: string,
	model: string,
	files: string[],
) => Promise<{ result: string; success: boolean; filesChanged: string[]; durationMs: number }>;

/** Callback the host provides to handle merge_threads() calls from Python. */
export type MergeHandler = () => Promise<{ result: string; success: boolean }>;

// ── Inbound message types from Python ───────────────────────────────────────

interface ReadyMessage {
	type: "ready";
}

interface ExecDoneMessage {
	type: "exec_done";
	stdout: string;
	stderr: string;
	has_final: boolean;
	final_value: string | null;
}

interface LlmQueryMessage {
	type: "llm_query";
	sub_context: string;
	instruction: string;
	id: string;
}

interface ThreadRequestMessage {
	type: "thread_request";
	id: string;
	task: string;
	context: string;
	agent_backend: string;
	model: string;
	files: string[];
}

interface MergeRequestMessage {
	type: "merge_request";
	id: string;
}

interface ContextSetMessage {
	type: "context_set";
}

interface FinalResetMessage {
	type: "final_reset";
}

type InboundMessage =
	| ReadyMessage
	| ExecDoneMessage
	| LlmQueryMessage
	| ThreadRequestMessage
	| MergeRequestMessage
	| ContextSetMessage
	| FinalResetMessage;

// ── REPL class ──────────────────────────────────────────────────────────────

export class PythonRepl {
	private proc: ChildProcess | null = null;
	private rl: readline.Interface | null = null;
	private llmQueryHandler: LlmQueryHandler | null = null;
	private threadHandler: ThreadHandler | null = null;
	private mergeHandler: MergeHandler | null = null;

	/**
	 * Pending resolvers for messages we're waiting on from Python.
	 * Each entry maps a message type to a one-shot resolve/reject pair.
	 */
	private pending: Map<string, { resolve: (msg: InboundMessage) => void; reject: (err: Error) => void }> = new Map();

	/** Whether the REPL subprocess is alive. */
	get isAlive(): boolean {
		return this.proc !== null && this.proc.exitCode === null;
	}

	/**
	 * Start the Python subprocess and wait for it to signal readiness.
	 */
	async start(signal?: AbortSignal): Promise<void> {
		if (this.isAlive) return;

		const runtimePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "runtime.py");

		const pythonCmd = process.platform === "win32" ? "python" : "python3";
		ensurePython(pythonCmd);

		const homeDir = os.homedir();
		this.proc = spawn(pythonCmd, [runtimePath], {
			stdio: ["pipe", "pipe", "pipe"],
			env: {
				// Only pass what Python actually needs — not API keys or secrets
				PATH: process.env.PATH,
				HOME: homeDir,
				USERPROFILE: homeDir, // Windows uses USERPROFILE
				PYTHONUNBUFFERED: "1",
				// Windows needs SystemRoot/SYSTEMROOT for Python to find DLLs
				...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
				...(process.env.SYSTEMROOT ? { SYSTEMROOT: process.env.SYSTEMROOT } : {}),
			},
		});

		this.rl = readline.createInterface({ input: this.proc.stdout! });
		this.rl.on("line", (line: string) => this.handleLine(line));

		this.proc.stderr!.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			if (text.trim()) {
				process.stderr.write(`[swarm-repl-python] ${text}`);
			}
		});

		this.proc.on("close", () => {
			this.cleanup();
		});

		if (signal) {
			signal.addEventListener(
				"abort",
				() => {
					this.shutdown();
				},
				{ once: true },
			);
		}

		await this.waitForMessage("ready");
	}

	/** Register the callback that handles llm_query() calls from Python. */
	setLlmQueryHandler(handler: LlmQueryHandler): void {
		this.llmQueryHandler = handler;
	}

	/** Register the callback that handles thread() calls from Python. */
	setThreadHandler(handler: ThreadHandler): void {
		this.threadHandler = handler;
	}

	/** Register the callback that handles merge_threads() calls from Python. */
	setMergeHandler(handler: MergeHandler): void {
		this.mergeHandler = handler;
	}

	/** Inject the full context string into the Python REPL. */
	async setContext(text: string): Promise<void> {
		this.send({ type: "set_context", value: text });
		await this.waitForMessage("context_set");
	}

	/** Reset the Final sentinel variable. */
	async resetFinal(): Promise<void> {
		this.send({ type: "reset_final" });
		await this.waitForMessage("final_reset");
	}

	/** Execute a code snippet and return the result. */
	async execute(code: string): Promise<ExecResult> {
		this.send({ type: "exec", code });
		const msg = (await this.waitForMessage("exec_done")) as ExecDoneMessage;
		return {
			stdout: msg.stdout,
			stderr: msg.stderr,
			hasFinal: msg.has_final,
			finalValue: msg.final_value,
		};
	}

	/** Gracefully shut down the Python subprocess. */
	shutdown(): void {
		if (this.proc && this.proc.exitCode === null) {
			const proc = this.proc;
			try {
				this.send({ type: "shutdown" });
			} catch {
				// stdin may already be closed
			}
			if (process.platform === "win32") {
				// Windows: SIGTERM is ignored, kill immediately
				try {
					proc.kill("SIGKILL");
				} catch {
					/* already dead */
				}
			} else {
				// Unix: give Python 500ms to exit gracefully, then force kill
				const killTimer = setTimeout(() => {
					try {
						if (proc.exitCode === null) proc.kill("SIGKILL");
					} catch {}
				}, 500);
				proc.on("exit", () => clearTimeout(killTimer));
				try {
					proc.kill("SIGTERM");
				} catch {
					/* already dead */
				}
			}
		}
		this.cleanup();
	}

	// ── Internal ─────────────────────────────────────────────────────────────

	private send(msg: Record<string, unknown>): void {
		if (!this.proc || !this.proc.stdin || this.proc.stdin.destroyed) {
			throw new Error("REPL subprocess is not running");
		}
		try {
			this.proc.stdin.write(`${JSON.stringify(msg)}\n`);
		} catch {
			throw new Error("REPL subprocess stdin write failed");
		}
	}

	private handleLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;

		let msg: InboundMessage;
		try {
			msg = JSON.parse(trimmed) as InboundMessage;
		} catch {
			return;
		}

		// Handle async message types (don't go through pending)
		if (msg.type === "llm_query") {
			this.handleLlmQueryMessage(msg as LlmQueryMessage).catch((err) => {
				process.stderr.write(`[swarm] llm_query handler error: ${err?.message || err}\n`);
			});
			return;
		}

		if (msg.type === "thread_request") {
			this.handleThreadRequestMessage(msg as ThreadRequestMessage).catch((err) => {
				process.stderr.write(`[swarm] thread_request handler error: ${err?.message || err}\n`);
			});
			return;
		}

		if (msg.type === "merge_request") {
			this.handleMergeRequestMessage(msg as MergeRequestMessage).catch((err) => {
				process.stderr.write(`[swarm] merge_request handler error: ${err?.message || err}\n`);
			});
			return;
		}

		const entry = this.pending.get(msg.type);
		if (entry) {
			this.pending.delete(msg.type);
			entry.resolve(msg);
		}
	}

	private async handleLlmQueryMessage(msg: LlmQueryMessage): Promise<void> {
		if (!this.llmQueryHandler) {
			this.send({
				type: "llm_result",
				id: msg.id,
				result: "[ERROR] No LLM query handler registered",
			});
			return;
		}

		try {
			const result = await this.llmQueryHandler(msg.sub_context, msg.instruction);
			this.send({ type: "llm_result", id: msg.id, result });
		} catch (err) {
			const errorText = err instanceof Error ? err.message : String(err);
			this.send({
				type: "llm_result",
				id: msg.id,
				result: `[ERROR] LLM query failed: ${errorText}`,
			});
		}
	}

	private async handleThreadRequestMessage(msg: ThreadRequestMessage): Promise<void> {
		if (!this.threadHandler) {
			this.send({
				type: "thread_result",
				id: msg.id,
				result: "[ERROR] No thread handler registered. Run in swarm mode to use thread().",
				success: false,
				files_changed: [],
				duration_ms: 0,
			});
			return;
		}

		try {
			const result = await this.threadHandler(msg.task, msg.context, msg.agent_backend, msg.model, msg.files || []);
			this.send({
				type: "thread_result",
				id: msg.id,
				result: result.result,
				success: result.success,
				files_changed: result.filesChanged,
				duration_ms: result.durationMs,
			});
		} catch (err) {
			const errorText = err instanceof Error ? err.message : String(err);
			this.send({
				type: "thread_result",
				id: msg.id,
				result: `[ERROR] Thread failed: ${errorText}`,
				success: false,
				files_changed: [],
				duration_ms: 0,
			});
		}
	}

	private async handleMergeRequestMessage(msg: MergeRequestMessage): Promise<void> {
		if (!this.mergeHandler) {
			this.send({
				type: "merge_result",
				id: msg.id,
				result: "[ERROR] No merge handler registered. Run in swarm mode to use merge_threads().",
				success: false,
			});
			return;
		}

		try {
			const result = await this.mergeHandler();
			this.send({
				type: "merge_result",
				id: msg.id,
				result: result.result,
				success: result.success,
			});
		} catch (err) {
			const errorText = err instanceof Error ? err.message : String(err);
			this.send({
				type: "merge_result",
				id: msg.id,
				result: `[ERROR] Merge failed: ${errorText}`,
				success: false,
			});
		}
	}

	private waitForMessage(type: string): Promise<InboundMessage> {
		return new Promise((resolve, reject) => {
			if (!this.isAlive) {
				reject(new Error(`REPL subprocess is not running (waiting for "${type}")`));
				return;
			}

			const timeout = setTimeout(() => {
				if (this.pending.has(type)) {
					this.pending.delete(type);
					reject(new Error(`Timeout waiting for "${type}" from Python REPL`));
				}
			}, 300_000);

			this.pending.set(type, {
				resolve: (msg) => {
					clearTimeout(timeout);
					resolve(msg);
				},
				reject: (err) => {
					clearTimeout(timeout);
					reject(err);
				},
			});
		});
	}

	private cleanup(): void {
		this.rl?.close();
		this.rl = null;
		this.proc = null;
		// Reject all pending promises so callers unblock immediately
		const abortError = new Error("REPL shut down");
		for (const [, entry] of this.pending) {
			entry.reject(abortError);
		}
		this.pending.clear();
	}
}
