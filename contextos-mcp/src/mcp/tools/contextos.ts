/**
 * ContextOS MCP tools — the API surface exposed to Antigravity.
 *
 * Tools:
 *   - contextos_delegate:  Spawn parallel agents with ContextOS rules
 *   - contextos_status:    Get task/thread state
 *   - contextos_compare:   High-level summary (no huge diffs)
 *   - contextos_diff:      Full diff for a specific thread
 *   - contextos_merge:     Merge a specific thread branch (dumb merge)
 *   - contextos_cleanup:   Destroy session and worktrees
 *
 * IMPORTANT: Never use console.log() — stdout is the MCP protocol stream.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { buildContextPrompt } from "../../contextos/loader.js";
import type { ThreadState } from "../../core/types.js";
import {
	cancelThreads,
	cleanupSession,
	getBudgetState,
	getSession,
	getThreads,
	mergeThreads,
	spawnThread,
} from "../session.js";
import { mergeThreadBranch } from "../../worktree/merge.js";

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

function log(msg: string): void {
	process.stderr.write(`[contextos-mcp] ${msg}\n`);
}

// ── Tool Registration ──────────────────────────────────────────────────────

export function registerContextosTools(server: McpServer, defaultDir?: string): void {

	function resolveDir(dir?: string): string | null {
		const resolved = dir || defaultDir;
		if (!resolved) return null;
		const abs = resolve(resolved);
		if (!existsSync(abs)) return null;
		return abs;
	}

	// ── contextos_delegate ─────────────────────────────────────────────────
	// Spawn parallel coding agents, each in its own worktree.
	// Loads ContextOS rules before sending the task to agents.

	server.registerTool(
		"contextos_delegate",
		{
			title: "Delegate Task to Agents",
			description:
				"Delegate a coding task to multiple AI agents running in parallel. " +
				"Each agent works in an isolated git worktree. ContextOS rules from " +
				".agents/ are automatically injected into agent prompts. " +
				"Returns task_id and thread IDs for tracking.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository"),
				task: z.string().describe("The coding task to accomplish"),
				agents: z.array(z.object({
					provider: z.string().describe("LLM provider: 'openai', 'anthropic', or 'gemini'"),
					model: z.string().optional().describe("Model ID override (e.g., 'gpt-4o', 'claude-sonnet-4-6')"),
				})).min(1).max(5).describe("List of agents to run in parallel"),
				files: z.array(z.string()).optional().describe("File paths to focus on"),
				mode: z.enum(["parallel", "sequential"]).optional().describe("Execution mode (default: parallel)"),
			}),
		},
		async (args) => {
			const resolvedDir = resolveDir(args.dir);
			if (!resolvedDir) {
				if (!args.dir && !defaultDir) return errorResult("'dir' is required — specify the repo path");
				return errorResult(`Directory does not exist: ${resolve(args.dir || defaultDir || "")}`);
			}

			try {
				// Load ContextOS rules
				const contextPrompt = buildContextPrompt(resolvedDir, args.task);
				log(`ContextOS prompt: ${contextPrompt.length} chars`);

				const session = await getSession(resolvedDir);
				const taskId = `ctx_${Date.now().toString(36)}`;
				const results: Array<{
					thread_id: string;
					provider: string;
					model: string;
					status: string;
				}> = [];

				// Spawn agents
				const spawnPromises = args.agents.map(async (agentConfig) => {
					const model = agentConfig.model || getDefaultModel(agentConfig.provider);
					const threadId = `${taskId}_${agentConfig.provider}`;

					try {
						const result = await spawnThread(session, {
							task: args.task,
							files: args.files,
							agent: "direct-llm",
							model: model,
							context: contextPrompt,
						});

						return {
							thread_id: threadId,
							provider: agentConfig.provider,
							model: model,
							status: result.success ? "completed" : "failed",
							summary: result.summary,
							files_changed: result.filesChanged,
							duration_ms: result.durationMs,
							cost_usd: result.estimatedCostUsd,
						};
					} catch (err) {
						return {
							thread_id: threadId,
							provider: agentConfig.provider,
							model: model,
							status: "failed",
							error: err instanceof Error ? err.message : String(err),
						};
					}
				});

				// Run parallel or sequential
				let threadResults;
				if (args.mode === "sequential") {
					threadResults = [];
					for (const promise of spawnPromises) {
						threadResults.push(await promise);
					}
				} else {
					threadResults = await Promise.all(spawnPromises);
				}

				return jsonResult({
					task_id: taskId,
					status: "completed",
					contextos_rules_loaded: contextPrompt.length > 0,
					agents: threadResults,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Delegation failed: ${msg}`);
			}
		},
	);

	// ── contextos_status ───────────────────────────────────────────────────
	// Get status of all threads and budget for a session.

	server.registerTool(
		"contextos_status",
		{
			title: "Session Status",
			description:
				"Get the current status of a ContextOS session — all threads with their " +
				"status, worktree paths, branch names, budget spent, and cost breakdown.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required");

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
					worktree_path: t.worktreePath || null,
					branch: t.branchName || null,
					files_changed: t.result?.filesChanged || [],
					duration_ms:
						t.completedAt && t.startedAt ? t.completedAt - t.startedAt :
						t.startedAt ? Date.now() - t.startedAt : 0,
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
					},
					budget: {
						spent_usd: budget.totalSpentUsd,
						limit_usd: budget.sessionLimitUsd,
						tokens: budget.totalTokens,
					},
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Status check failed: ${msg}`);
			}
		},
	);

	// ── contextos_compare ──────────────────────────────────────────────────
	// High-level comparison WITHOUT full diffs (prevents context bloat).

	server.registerTool(
		"contextos_compare",
		{
			title: "Compare Agent Results",
			description:
				"Compare results from multiple agents at a high level. Returns files changed, " +
				"insertions/deletions count, and potential conflicts — WITHOUT full diffs. " +
				"Use contextos_diff to get the full diff for a specific thread.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required");

			try {
				const session = await getSession(dir);
				const threads = getThreads(session);
				const completed = threads.filter((t) => t.status === "completed" && t.result?.success);

				if (completed.length === 0) {
					return jsonResult({ message: "No completed threads to compare", threads: [] });
				}

				const summaries = completed.map((t) => ({
					id: t.id,
					model: t.config.agent.model,
					files_changed: t.result?.filesChanged || [],
					files_count: (t.result?.filesChanged || []).length,
					diff_stats: t.result?.diffStats || "(no stats)",
					duration_ms: t.result?.durationMs || 0,
					cost_usd: t.result?.estimatedCostUsd || 0,
				}));

				// Detect potential conflicts: files changed by multiple agents
				const fileToAgents = new Map<string, string[]>();
				for (const s of summaries) {
					for (const file of s.files_changed) {
						const agents = fileToAgents.get(file) || [];
						agents.push(s.id);
						fileToAgents.set(file, agents);
					}
				}
				const conflicts = [...fileToAgents.entries()]
					.filter(([, agents]) => agents.length > 1)
					.map(([file, agents]) => ({ file, modified_by: agents }));

				return jsonResult({
					agents: summaries,
					potential_conflicts: conflicts,
					recommendation: conflicts.length > 0
						? "Some files were modified by multiple agents. Use contextos_diff to review each agent's changes before merging."
						: "No conflicts detected. You can safely merge any agent's changes.",
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Compare failed: ${msg}`);
			}
		},
	);

	// ── contextos_diff ─────────────────────────────────────────────────────
	// Full diff for a specific thread (on-demand, not in compare).

	server.registerTool(
		"contextos_diff",
		{
			title: "Get Thread Diff",
			description:
				"Get the full git diff for a specific thread. Call this after contextos_compare " +
				"to inspect a particular agent's changes in detail.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository"),
				thread_id: z.string().describe("Thread ID to get diff for"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required");

			try {
				const session = await getSession(dir);
				const threads = getThreads(session);
				const thread = threads.find((t) => t.id === args.thread_id);

				if (!thread) {
					return errorResult(`Thread ${args.thread_id} not found. Available: ${threads.map(t => t.id).join(", ")}`);
				}

				if (!thread.worktreePath) {
					return errorResult(`Thread ${args.thread_id} has no worktree (status: ${thread.status})`);
				}

				// Get diff from the worktree manager through the session
				const worktreeManager = session.threadManager.getWorktreeManager();
				const diff = await worktreeManager.getDiff(thread.id);

				return jsonResult({
					thread_id: thread.id,
					model: thread.config.agent.model,
					status: thread.status,
					diff: diff,
					files_changed: thread.result?.filesChanged || [],
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Diff failed: ${msg}`);
			}
		},
	);

	// ── contextos_merge ────────────────────────────────────────────────────
	// Dumb merge: Antigravity decides, ContextOS just executes git merge.

	server.registerTool(
		"contextos_merge",
		{
			title: "Merge Thread Branch",
			description:
				"Merge a specific thread's branch into the main branch. This is a 'dumb' merge — " +
				"ContextOS does not decide which agent is better. Antigravity (you) make that decision " +
				"and tell ContextOS which thread to merge.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository"),
				thread_id: z.string().describe("Thread ID whose branch to merge"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required");

			try {
				const session = await getSession(dir);
				const threads = getThreads(session);
				const thread = threads.find((t) => t.id === args.thread_id);

				if (!thread) {
					return errorResult(`Thread ${args.thread_id} not found`);
				}

				if (!thread.branchName) {
					return errorResult(`Thread ${args.thread_id} has no branch (status: ${thread.status})`);
				}

				if (thread.status !== "completed") {
					return errorResult(`Thread ${args.thread_id} is ${thread.status}, not completed`);
				}

				const result = await mergeThreadBranch(session.dir, thread.branchName, thread.id);

				return jsonResult({
					merged: result.success,
					branch: result.branch,
					message: result.message,
					conflicts: result.conflicts,
				});
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				return errorResult(`Merge failed: ${msg}`);
			}
		},
	);

	// ── contextos_cleanup ──────────────────────────────────────────────────
	// Destroy session and worktrees.

	server.registerTool(
		"contextos_cleanup",
		{
			title: "Cleanup Session",
			description:
				"Clean up a ContextOS session — cancels all running threads, removes " +
				"worktrees, and frees resources. Call this when done with a task.",
			inputSchema: z.object({
				dir: z.string().optional().describe("Path to the git repository"),
			}),
		},
		async (args) => {
			const dir = args.dir || defaultDir;
			if (!dir) return errorResult("'dir' is required");

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

// ── Helpers ────────────────────────────────────────────────────────────────

/** Get default model ID for a provider. */
function getDefaultModel(provider: string): string {
	switch (provider.toLowerCase()) {
		case "openai": return "gpt-4o";
		case "anthropic": return "claude-sonnet-4-6";
		case "gemini": case "google": return "gemini-2.5-pro";
		default: return "claude-sonnet-4-6";
	}
}
