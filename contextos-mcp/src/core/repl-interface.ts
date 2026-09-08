/**
 * Common REPL interface and execution primitives for ContextOS / Swarm.
 */

/** Result of executing a code snippet in the REPL. */
export interface ExecResult {
	stdout: string;
	stderr: string;
	hasFinal: boolean;
	finalValue: string | null;
}

/** Callback the host provides to handle llm_query() calls. */
export type LlmQueryHandler = (subContext: string, instruction: string) => Promise<string>;

/** Callback the host provides to handle thread() calls. */
export type ThreadHandler = (
	task: string,
	context: string,
	agentBackend: string,
	model: string,
	files: string[],
) => Promise<{ result: string; success: boolean; filesChanged: string[]; durationMs: number }>;

/** Callback the host provides to handle merge_threads() calls. */
export type MergeHandler = () => Promise<{ result: string; success: boolean }>;

/**
 * Common execution engine interface implemented by PythonRepl (legacy/optional Python subprocess).
 */
export interface Repl {
	readonly isAlive: boolean;

	/** Start/initialize the execution runtime. */
	start(signal?: AbortSignal): Promise<void>;

	/** Gracefully shut down and release resources. */
	shutdown(): void;

	/** Register callback for llm_query() calls. */
	setLlmQueryHandler(handler: LlmQueryHandler): void;

	/** Register callback for thread() calls. */
	setThreadHandler(handler: ThreadHandler): void;

	/** Register callback for merge_threads() calls. */
	setMergeHandler(handler: MergeHandler): void;

	/** Inject context string into the execution environment. */
	setContext(text: string): Promise<void>;

	/** Reset the FINAL sentinel flag. */
	resetFinal(): Promise<void>;

	/** Execute a code snippet and return captured output. */
	execute(code: string): Promise<ExecResult>;

	/** Execution language target ('javascript' or 'python'). */
	getLanguage(): "javascript" | "python";
}
