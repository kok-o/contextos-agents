/**
 * Native Node.js V8 Sandboxed REPL for ContextOS / Swarm.
 *
 * Replaces the Python runtime.py subprocess with a lightweight, secure,
 * in-process V8 execution sandbox (node:vm). Provides full async support
 * for thread(), async_thread(), merge_threads(), llm_query(), and FINAL().
 */

import * as vm from "node:vm";
import type { ExecResult, LlmQueryHandler, MergeHandler, Repl, ThreadHandler } from "./repl-interface.js";

function formatArg(arg: any): string {
	if (arg === null) return "null";
	if (arg === undefined) return "undefined";
	if (typeof arg === "string") return arg;
	if (typeof arg === "object") {
		try {
			return JSON.stringify(arg);
		} catch {
			return String(arg);
		}
	}
	return String(arg);
}

export class NodeVmRepl implements Repl {
	private sandbox: Record<string, any> = {};
	private vmContext: vm.Context | null = null;
	private stdoutBuffer: string[] = [];
	private stderrBuffer: string[] = [];
	private hasFinalFlag = false;
	private finalVal: string | null = null;
	private alive = false;

	private llmQueryHandler: LlmQueryHandler | null = null;
	private threadHandler: ThreadHandler | null = null;
	private mergeHandler: MergeHandler | null = null;
	private timeoutMs = 60_000;

	constructor(timeoutMs = 60_000) {
		this.timeoutMs = timeoutMs;
	}

	get isAlive(): boolean {
		return this.alive;
	}

	getLanguage(): "javascript" | "python" {
		return "javascript";
	}

	async start(signal?: AbortSignal): Promise<void> {
		if (this.alive) return;

		this.stdoutBuffer = [];
		this.stderrBuffer = [];
		this.hasFinalFlag = false;
		this.finalVal = null;

		// Initialize sandbox with safe globals and execution primitives
		this.sandbox = {
			context: "",

			// Output capture
			print: (...args: any[]) => {
				this.stdoutBuffer.push(args.map(formatArg).join(" "));
			},
			console: {
				log: (...args: any[]) => {
					this.stdoutBuffer.push(args.map(formatArg).join(" "));
				},
				error: (...args: any[]) => {
					this.stderrBuffer.push(args.map(formatArg).join(" "));
				},
				warn: (...args: any[]) => {
					this.stderrBuffer.push(args.map(formatArg).join(" "));
				},
				info: (...args: any[]) => {
					this.stdoutBuffer.push(args.map(formatArg).join(" "));
				},
			},

			// Termination sentinel
			FINAL: (value: any) => {
				this.hasFinalFlag = true;
				this.finalVal = typeof value === "string" ? value : formatArg(value);
			},
			FINAL_VAR: (value: any) => {
				this.hasFinalFlag = true;
				this.finalVal = typeof value === "string" ? value : formatArg(value);
			},
			final: (value: any) => {
				this.hasFinalFlag = true;
				this.finalVal = typeof value === "string" ? value : formatArg(value);
			},

			// LLM sub-queries
			llm_query: async (subContext: string, instruction: string) => {
				if (!this.llmQueryHandler) {
					throw new Error("llm_query handler not registered");
				}
				return await this.llmQueryHandler(String(subContext), String(instruction));
			},
			async_llm_query: async (subContext: string, instruction: string) => {
				if (!this.llmQueryHandler) {
					throw new Error("llm_query handler not registered");
				}
				return await this.llmQueryHandler(String(subContext), String(instruction));
			},

			// Swarm thread orchestration
			thread: async (task: any, context?: any, agentBackend?: any, model?: any, files?: any) => {
				if (!this.threadHandler) {
					throw new Error("thread handler not registered");
				}
				let tTask = "";
				let tContext = "";
				let tBackend = "opencode";
				let tModel = "";
				let tFiles: string[] = [];

				if (typeof task === "object" && task !== null) {
					tTask = String(task.task || "");
					tContext = String(task.context || "");
					tBackend = String(task.agent || task.agentBackend || task.backend || "opencode");
					tModel = String(task.model || "");
					tFiles = Array.isArray(task.files) ? task.files : [];
				} else {
					tTask = String(task || "");
					tContext = String(context || "");
					tBackend = String(agentBackend || "opencode");
					tModel = String(model || "");
					tFiles = Array.isArray(files) ? files : [];
				}

				return await this.threadHandler(tTask, tContext, tBackend, tModel, tFiles);
			},
			async_thread: async (...args: any[]) => {
				return await this.sandbox.thread(...args);
			},

			// Merge completed thread branches
			merge_threads: async () => {
				if (!this.mergeHandler) {
					throw new Error("merge handler not registered");
				}
				return await this.mergeHandler();
			},

			// Safe standard built-ins
			JSON,
			Math,
			Date,
			RegExp,
			Array,
			Object,
			String,
			Number,
			Boolean,
			Map,
			Set,
			Promise,
			setTimeout,
			clearTimeout,
			parseInt,
			parseFloat,
			isNaN,
			isFinite,
			encodeURI,
			decodeURI,
			encodeURIComponent,
			decodeURIComponent,
		};

		// Self-referential globals for natural access
		this.sandbox.global = this.sandbox;
		this.sandbox.globalThis = this.sandbox;

		this.vmContext = vm.createContext(this.sandbox);
		this.alive = true;

		if (signal) {
			signal.addEventListener(
				"abort",
				() => {
					this.shutdown();
				},
				{ once: true },
			);
		}
	}

	shutdown(): void {
		this.alive = false;
		this.vmContext = null;
		this.sandbox = {};
		this.stdoutBuffer = [];
		this.stderrBuffer = [];
	}

	setLlmQueryHandler(handler: LlmQueryHandler): void {
		this.llmQueryHandler = handler;
	}

	setThreadHandler(handler: ThreadHandler): void {
		this.threadHandler = handler;
	}

	setMergeHandler(handler: MergeHandler): void {
		this.mergeHandler = handler;
	}

	async setContext(text: string): Promise<void> {
		if (this.sandbox) {
			this.sandbox.context = text;
		}
	}

	async resetFinal(): Promise<void> {
		this.hasFinalFlag = false;
		this.finalVal = null;
	}

	async execute(code: string): Promise<ExecResult> {
		if (!this.alive || !this.vmContext) {
			await this.start();
		}

		this.stdoutBuffer = [];
		this.stderrBuffer = [];

		// Strip markdown code fences if present
		let cleanCode = code.trim();
		const fenceMatch = cleanCode.match(/^```(?:javascript|js|typescript|ts|repl)?\s*\n([\s\S]*?)```$/);
		if (fenceMatch) {
			cleanCode = fenceMatch[1].trim();
		}

		// Transform top-level const/let/var and function declarations to attach to global context
		const transformedCode = cleanCode
			.replace(/^\s*(?:const|let|var)\s+([\w$]+)\s*=/gm, "globalThis.$1 =")
			.replace(/^\s*function\s+([\w$]+)\s*\(/gm, "globalThis.$1 = function $1(");

		// Wrap in an async function invocation so top-level await works seamlessly
		const wrappedScript = `(async function() {\n${transformedCode}\n}).call(globalThis);`;

		try {
			const script = new vm.Script(wrappedScript, {
				filename: "repl-eval.js",
			});

			const executionPromise = script.runInContext(this.vmContext!, {
				timeout: this.timeoutMs,
				breakOnSigint: true,
			});

			await executionPromise;
		} catch (err: any) {
			const errMsg = err?.stack || err?.message || String(err);
			this.stderrBuffer.push(errMsg);
		}

		return {
			stdout: this.stdoutBuffer.join("\n"),
			stderr: this.stderrBuffer.join("\n"),
			hasFinal: this.hasFinalFlag,
			finalValue: this.finalVal,
		};
	}
}
