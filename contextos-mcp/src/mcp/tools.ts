/**
 * MCP tool definitions and handlers for swarm-code.
 *
 * Tools:
 *   - swarm_run:     Full orchestrated swarm execution (subprocess)
 *   - swarm_thread:  Spawn a single coding agent thread in a worktree
 *   - swarm_status:  Get current session status (threads, budget)
 *   - swarm_merge:   Merge completed thread branches
 *   - swarm_cancel:  Cancel running thread(s)
 *   - swarm_cleanup: Destroy session and worktrees
 */

import { type ChildProcess, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	cancelThreads,
	cleanupSession,
	getBudgetState,
	getSession,
	getThreads,
	mergeThreads,
	spawnThread,
} from "./session.js";

// ── Helpers ────────────────────────────────────────────────────────────────

function _textResult(text: string) {
	return { content: [{ type: "text" as const, text }] };
}

function errorResult(text: string) {
	return { content: [{ type: "text" as const, text }], isError: true as const };
}

function jsonResult(data: unknown) {
	return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Track active subprocesses so they can be killed on shutdown. */
const activeSubprocesses = new Set<ChildProcess>();

/** Kill all tracked subprocesses. Called during server shutdown. */
export function killActiveSubprocesses(): void {
	for (const child of activeSubprocesses) {
		try {
			child.kill("SIGTERM");
		} catch {
			/* already dead */
		}
	}
	activeSubprocesses.clear();
}

// ── Tool Registration ──────────────────────────────────────────────────────

export function registerTools(server: McpServer, defaultDir?: string): void {
	// Helper: resolve dir from tool args or default, validate existence
	function resolveDir(dir?: string): string | null {
		const resolved = dir || defaultDir;
		if (!resolved) return null;
		const abs = resolve(resolved);
		if (!existsSync(abs)) return null;
		return abs;
	}

	// ── swarm_run ──────────────────────────────────────────────────────────
	// Full swarm orchestration — runs the entire RLM loop as a subprocess.
	// This is the high-level "do everything" tool.

	server.registerTool(
		"swarm_run",
		{
			title: "Run Swarm",
			description:
				"Run the full swarm orchestrator on a repository. Decomposes a task into " +
				"parallel coding agent threads, executes them in isolated git worktrees, " +
				"and merges results. Returns a JSON summary with success status, answer, " +
				"thread stats, and cost breakdown.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository (uses server default if not specified)"),
				task: z.string().describe("The coding task to accomplish (e.g., 'add error handling to all API routes')"),
				agent: z
					.string()
					.optional()
					.describe("Agent backend: opencode (default), claude-code, codex, aider, direct-llm"),
				model: z.string().optional().describe("Orchestrator model override (e.g., claude-sonnet-4-6, gpt-4o)"),
				max_budget: z
					.number()
					.min(0)
					.max(50)
					.optional()
					.describe("Maximum budget in USD (default: 5.00, hard cap: 50.00)"),
				auto_route: z.boolean().optional().describe("Enable auto model/agent routing per thread (default: false)"),
			}),
		},
		async (args) => {
			const resolvedDir = resolveDir(args.dir);
			if (!resolvedDir) {
				if (!args.dir && !defaultDir) return errorResult("'dir' is required — specify the repo path");
				return errorResult(`Directory does not exist: ${resolve(args.dir || defaultDir || "")}`);
			}

			// Build CLI args
			const cliArgs = ["--dir", resolvedDir, "--json", "--quiet"];
			if (args.agent) cliArgs.push("--agent", args.agent);
			if (args.model) cliArgs.push("--orchestrator", args.model);
			if (args.max_budget != null) cliArgs.push("--max-budget", String(args.max_budget));
			if (args.auto_route) cliArgs.push("--auto-route");
			cliArgs.push(args.task);

			// Run swarm as subprocess
			try {
				const result = await runSwarmSubprocess(cliArgs);
				return jsonResult(result);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Swarm execution failed: ${msg}`);
			}
		},
	);

	// ── swarm_thread ──────────────────────────────────────────────────────
	// Spawn a single coding agent thread — the low-level building block.
	// The calling agent (Claude Code, Cursor) can orchestrate multiple threads.

	server.registerTool(
		"swarm_thread",
		{
			title: "Spawn Thread",
			description:
				"Spawn a single coding agent in an isolated git worktree. The agent " +
				"executes the task, and the result (files changed, diff, summary) is " +
				"returned. Use this for fine-grained control — call multiple times for " +
				"parallel work, then use swarm_merge to integrate.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository (uses server default if not specified)"),
				task: z.string().describe("Task for the coding agent (e.g., 'fix the auth bug in src/auth.ts')"),
				files: z.array(z.string()).optional().describe("File paths to focus on (hints for the agent)"),
				agent: z
					.string()
					.optional()
					.describe("Agent backend: opencode (default), claude-code, codex, aider, direct-llm"),
				model: z.string().optional().describe("Model override (e.g., anthropic/claude-sonnet-4-6)"),
				context: z.string().optional().describe("Additional context to pass to the agent"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required — specify the repo path");

			try {
				const session = await getSession(dir);
				const result = await spawnThread(session, {
					task: args.task,
					files: args.files,
					agent: args.agent,
					model: args.model,
					context: args.context,
				});

				return jsonResult({
					success: result.success,
					summary: result.summary,
					files_changed: result.filesChanged,
					diff_stats: result.diffStats,
					duration_ms: result.durationMs,
					cost_usd: result.estimatedCostUsd,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Thread failed: ${msg}`);
			}
		},
	);

	// ── swarm_status ──────────────────────────────────────────────────────
	// Get status of all threads and budget for a session.

	server.registerTool(
		"swarm_status",
		{
			title: "Session Status",
			description:
				"Get the current status of a swarm session — all threads with their " +
				"status (pending/running/completed/failed), budget spent, and cost breakdown.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository (uses server default if not specified)"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required — specify the repo path");

			try {
				const session = await getSession(dir);
				const threads = getThreads(session);
				const budget = getBudgetState(session);

				const threadSummaries = threads.map((t) => ({
					id: t.id,
					task: t.config.task,
					status: t.status,
					phase: t.phase,
					agent: t.config.agent.backend,
					model: t.config.agent.model,
					files_changed: t.result?.filesChanged || [],
					duration_ms:
						t.completedAt && t.startedAt ? t.completedAt - t.startedAt : t.startedAt ? Date.now() - t.startedAt : 0,
					cost_usd: t.result?.estimatedCostUsd ?? t.estimatedCostUsd,
					error: t.error,
				}));

				return jsonResult({
					dir: session.dir,
					threads: threadSummaries,
					counts: {
						total: threads.length,
						running: threads.filter((t) => t.status === "running").length,
						completed: threads.filter((t) => t.status === "completed").length,
						failed: threads.filter((t) => t.status === "failed").length,
						pending: threads.filter((t) => t.status === "pending").length,
					},
					budget: {
						spent_usd: budget.totalSpentUsd,
						limit_usd: budget.sessionLimitUsd,
						per_thread_limit_usd: budget.perThreadLimitUsd,
						tokens: budget.totalTokens,
					},
					session_age_ms: Date.now() - session.createdAt,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Status check failed: ${msg}`);
			}
		},
	);

	// ── swarm_merge ───────────────────────────────────────────────────────
	// Merge completed thread branches back to main.

	server.registerTool(
		"swarm_merge",
		{
			title: "Merge Threads",
			description:
				"Merge all completed thread branches back into the main branch. " +
				"Threads that are still running or failed are skipped. Returns " +
				"per-branch merge results including any conflicts.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository (uses server default if not specified)"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required — specify the repo path");

			try {
				const session = await getSession(dir);
				const results = await mergeThreads(session);

				return jsonResult({
					merged: results.length,
					results: results.map((r) => ({
						branch: r.branch,
						success: r.success,
						message: r.message,
						conflicts: r.conflicts,
					})),
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Merge failed: ${msg}`);
			}
		},
	);

	// ── swarm_cancel ──────────────────────────────────────────────────────
	// Cancel a specific thread or all threads.

	server.registerTool(
		"swarm_cancel",
		{
			title: "Cancel Threads",
			description:
				"Cancel running threads. Specify a thread_id to cancel a specific " +
				"thread, or omit to cancel all running threads in the session.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository (uses server default if not specified)"),
				thread_id: z.string().optional().describe("Specific thread ID to cancel (omit to cancel all)"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required — specify the repo path");

			try {
				const session = await getSession(dir);
				const result = cancelThreads(session, args.thread_id);
				return jsonResult(result);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Cancel failed: ${msg}`);
			}
		},
	);

	// ── swarm_cleanup ─────────────────────────────────────────────────────
	// Destroy a session — cancels threads, removes worktrees.

	server.registerTool(
		"swarm_cleanup",
		{
			title: "Cleanup Session",
			description:
				"Clean up a swarm session — cancels all running threads, removes " +
				"worktrees, and frees resources. Call this when you're done with a " +
				"directory to avoid leftover worktrees.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository (uses server default if not specified)"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required — specify the repo path");

			try {
				const message = await cleanupSession(dir);
				return jsonResult({ cleaned_up: true, message });
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Cleanup failed: ${msg}`);
			}
		},
	);
}

// ── Subprocess runner ──────────────────────────────────────────────────────

/**
 * Run swarm as a subprocess with --json --quiet flags.
 * Tracks the child process so it can be killed on server shutdown.
 */
function runSwarmSubprocess(args: string[]): Promise<Record<string, unknown>> {
	return new Promise((resolve, reject) => {
		const { bin, binArgs } = findSwarmEntrypoint();

		const child = execFile(
			bin,
			[...binArgs, ...args],
			{
				encoding: "utf-8",
				maxBuffer: 50 * 1024 * 1024,
				timeout: 30 * 60 * 1000,
				env: { ...process.env },
			},
			(err, stdout, stderr) => {
				activeSubprocesses.delete(child);

				if (err) {
					// Try to parse JSON from stdout even on error
					const parsed = tryParseSwarmJson(stdout);
					if (parsed) {
						resolve(parsed);
						return;
					}
					reject(new Error(stderr || err.message));
					return;
				}

				const parsed = tryParseSwarmJson(stdout);
				if (parsed) {
					resolve(parsed);
				} else {
					reject(new Error(`Could not parse swarm output: ${stdout.slice(0, 500)}`));
				}
			},
		);

		activeSubprocesses.add(child);
	});
}

/**
 * Find the swarm entrypoint — prefers compiled dist/ over source.
 * Returns the binary and args needed to run it.
 */
function findSwarmEntrypoint(): { bin: string; binArgs: string[] } {
	const __dir = dirname(fileURLToPath(import.meta.url));
	const root = join(__dir, "..", "..");

	const distEntry = join(root, "dist", "main.js");
	if (existsSync(distEntry)) {
		return { bin: "node", binArgs: [distEntry] };
	}

	// Fallback: use npx tsx to run TypeScript source
	const srcEntry = join(root, "src", "main.ts");
	if (existsSync(srcEntry)) {
		return { bin: "npx", binArgs: ["tsx", srcEntry] };
	}

	throw new Error("swarm-code entrypoint not found. Run 'npm run build' or install swarm-code globally.");
}

function tryParseSwarmJson(stdout: string): Record<string, unknown> | null {
	if (!stdout) return null;
	const trimmed = stdout.trim();

	// Try single-line JSON (last line that starts with {)
	const lines = trimmed.split("\n");
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i].trim();
		if (line.startsWith("{")) {
			try {
				const parsed = JSON.parse(line);
				if (typeof parsed === "object" && parsed !== null && "success" in parsed) {
					return parsed;
				}
			} catch {
				/* not JSON */
			}
		}
	}

	// Fallback: first { to last }
	const firstBrace = trimmed.indexOf("{");
	const lastBrace = trimmed.lastIndexOf("}");
	if (firstBrace !== -1 && lastBrace > firstBrace) {
		try {
			const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
			if (typeof parsed === "object" && parsed !== null) {
				return parsed;
			}
		} catch {
			/* give up */
		}
	}

	return null;
}
