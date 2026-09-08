/**
 * Compatibility stub for the removed in-process JavaScript runtime.
 *
 * `node:vm` is not a security boundary when host functions are injected into
 * the context. Production orchestration uses ActionDispatcher instead.
 */

import type { ExecResult, LlmQueryHandler, MergeHandler, Repl, ThreadHandler } from "./repl-interface.js";

const DISABLED_MESSAGE =
	"NodeVmRepl is disabled because in-process generated-code execution is not a security boundary; use ActionDispatcher";

/** @deprecated Use ActionDispatcher for typed orchestration actions. */
export class NodeVmRepl implements Repl {
	get isAlive(): boolean {
		return false;
	}

	getLanguage(): "javascript" {
		return "javascript";
	}

	async start(_signal?: AbortSignal): Promise<void> {
		throw new Error(DISABLED_MESSAGE);
	}

	shutdown(): void {}

	setLlmQueryHandler(_handler: LlmQueryHandler): void {}

	setThreadHandler(_handler: ThreadHandler): void {}

	setMergeHandler(_handler: MergeHandler): void {}

	async setContext(_text: string): Promise<void> {
		throw new Error(DISABLED_MESSAGE);
	}

	async resetFinal(): Promise<void> {
		throw new Error(DISABLED_MESSAGE);
	}

	async execute(_code: string): Promise<ExecResult> {
		throw new Error(DISABLED_MESSAGE);
	}
}
