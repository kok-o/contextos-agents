/**
 * MCP session manager — maintains per-directory swarm state.
 *
 * Each directory gets its own session with:
 *   - ThreadManager (spawning/tracking threads)
 *   - SwarmConfig (loaded from the project dir)
 *   - AbortController (for cancellation)
 *   - BudgetState (cost tracking)
 *
 * Sessions are lazily initialized on first tool call and persist
 * across multiple MCP tool invocations.
 *
 * Concurrency:
 *   - pendingSessions deduplicates concurrent init for the same dir
 *   - loadConfig(cwd) avoids process.chdir() race conditions
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { SwarmConfig } from "../config.js";
import { loadConfig } from "../config.js";
import { ActionDispatcher } from "../core/action-dispatcher.js";
import type {
	FinishAction,
	InspectDiffAction,
	MergeAction,
	ReviewAction,
	SpawnAction,
	WaitAction,
} from "../core/action-schema.js";
import type { BudgetState, CompressedResult, MergeResult, ThreadConfig, ThreadState } from "../core/types.js";
import { assertWithinRepository } from "../security/repository-boundary.js";
import { ThreadManager } from "../threads/manager.js";
import { mergeAllThreads, mergeThreadBranch } from "../worktree/merge.js";
import {
	type AsyncTaskRecord,
	clearPersistedState,
	getPersistedAsyncTasks,
	getPersistedThreads,
	purgeOrphans,
	recordAsyncTask,
	recordThreadState,
} from "./state.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SwarmSession {
	dir: string;
	config: SwarmConfig;
	threadManager: ThreadManager;
	abortController: AbortController;
	createdAt: number;
	dispatcher?: ActionDispatcher;
}

export interface ThreadSpawnParams {
	id?: string;
	task: string;
	files?: string[];
	agent?: string;
	model?: string;
	context?: string;
	testCommand?: string;
	expectedResult?: string;
	maxAttempts?: number;
}

// ── Session Manager ────────────────────────────────────────────────────────

const sessions = new Map<string, SwarmSession>();

/** Deduplicates concurrent getSession() calls for the same directory. */
const pendingSessions = new Map<string, Promise<SwarmSession>>();

/**
 * Lazily init agent backends (only once).
 * Agent modules self-register when imported.
 * The flag is set eagerly to prevent duplicate imports even if
 * the first call hasn't finished awaiting yet.
 */
let agentsRegistered = false;
async function ensureAgentsRegistered(): Promise<void> {
	if (agentsRegistered) return;
	agentsRegistered = true;

	// Each agent module calls registerAgent() at module level on import
	const modules = [
		import("../agents/opencode.js"),
		import("../agents/claude-code.js"),
		import("../agents/codex.js"),
		import("../agents/aider.js"),
		import("../agents/direct-llm.js"),
	];

	// Import all, ignoring individual failures
	await Promise.allSettled(modules);
}

/**
 * Get or create a session for a directory.
 * The directory is resolved to an absolute path and used as the session key.
 * Concurrent calls for the same directory are deduplicated.
 */
export async function getSession(dir: string): Promise<SwarmSession> {
	const absDir = path.resolve(dir);

	if (!fs.existsSync(absDir)) {
		throw new Error(`Directory does not exist: ${absDir}`);
	}

	const canonicalDir = assertWithinRepository(absDir, absDir);

	// Return existing session
	const existing = sessions.get(canonicalDir);
	if (existing) return existing;

	// Deduplicate concurrent init for the same dir
	const pending = pendingSessions.get(canonicalDir);
	if (pending) return pending;

	const initPromise = initSession(canonicalDir);
	pendingSessions.set(canonicalDir, initPromise);

	try {
		const session = await initPromise;
		return session;
	} finally {
		pendingSessions.delete(canonicalDir);
	}
}

/**
 * Initialize a new session for a directory.
 * Uses loadConfig(cwd) to avoid process.chdir() race conditions.
 */
async function initSession(absDir: string): Promise<SwarmSession> {
	await ensureAgentsRegistered();

	// Load config from project dir without chdir (concurrency-safe)
	const config = loadConfig(absDir);

	const abortController = new AbortController();

	// ThreadManager creates its own WorktreeManager internally,
	// so we don't need a separate one at the session level.
	const threadManager = new ThreadManager(
		absDir,
		config,
		// Progress callback — log to stderr (stdout is MCP protocol) and persist to disk
		(threadId, phase, detail) => {
			const msg = detail ? `[${threadId}] ${phase}: ${detail}` : `[${threadId}] ${phase}`;
			process.stderr.write(`[swarm-mcp] ${msg}\n`);
			const current = threadManager.getThreads();
			const t = current.find((item) => item.id === threadId);
			if (t) {
				recordThreadState(absDir, t, config.worktree_base_dir);
			}
		},
		abortController.signal,
	);
	await threadManager.init();

	// Rehydrate threads from persisted state (survives server restart)
	const persisted = getPersistedThreads(absDir, config.worktree_base_dir);
	for (const thread of persisted) {
		if (thread.status === "completed" || thread.status === "failed" || thread.status === "verification_failed") {
			threadManager.restoreThread(thread);
		}
	}

	// Mark lingering running async tasks as unknown_after_restart
	const asyncTasks = getPersistedAsyncTasks(absDir, config.worktree_base_dir);
	for (const task of Object.values(asyncTasks)) {
		if (task.status === "running") {
			recordAsyncTask(absDir, { ...task, status: "unknown_after_restart" }, config.worktree_base_dir);
		}
	}

	const session: SwarmSession = {
		dir: absDir,
		config,
		threadManager,
		abortController,
		createdAt: Date.now(),
	};
	session.dispatcher = createSessionDispatcher(session);

	sessions.set(absDir, session);
	return session;
}

/**
 * Spawn a thread in a session.
 */
export async function spawnThread(session: SwarmSession, params: ThreadSpawnParams): Promise<CompressedResult> {
	const threadId = params.id || `mcp-${randomUUID()}`;

	if (params.files) {
		for (const file of params.files) {
			assertWithinRepository(path.resolve(session.dir, file), session.dir);
		}
	}

	const threadConfig: ThreadConfig = {
		id: threadId,
		task: params.task,
		context: params.context || "",
		agent: {
			backend: params.agent || session.config.default_agent,
			model: params.model || session.config.default_model,
		},
		files: params.files || [],
		taskBrief:
			params.testCommand || params.expectedResult || params.maxAttempts
				? {
						taskId: threadId,
						baseSha: "",
						objective: params.task,
						writeScope: params.files?.length ? params.files : ["."],
						testCommand: params.testCommand || "",
						expectedResult: params.expectedResult || "Task completes successfully",
						maxAttempts: params.maxAttempts || session.config.thread_retries + 1,
					}
				: undefined,
	};

	const resultPromise = session.threadManager.spawnThread(threadConfig);
	const initialThread = session.threadManager.getThreads().find((t) => t.id === threadId);
	if (initialThread) {
		recordThreadState(session.dir, initialThread, session.config.worktree_base_dir);
	}
	const result = await resultPromise;
	const finalThread = session.threadManager.getThreads().find((t) => t.id === threadId);
	if (finalThread) {
		recordThreadState(session.dir, finalThread, session.config.worktree_base_dir);
	}
	return result;
}

/**
 * Get all threads in a session (merging memory with persisted state).
 */
export function getThreads(session: SwarmSession): ThreadState[] {
	const memoryThreads = session.threadManager.getThreads();
	const persisted = getPersistedThreads(session.dir, session.config.worktree_base_dir);
	const map = new Map<string, ThreadState>();
	for (const t of persisted) map.set(t.id, t);
	for (const t of memoryThreads) map.set(t.id, t);
	return Array.from(map.values());
}

/**
 * Record an async job into persistent state.
 */
export function recordAsyncJob(
	session: SwarmSession,
	taskId: string,
	agentCount: number,
	status: "running" | "completed" | "failed" | "unknown_after_restart" = "running",
): void {
	recordAsyncTask(session.dir, { taskId, agentCount, startedAt: Date.now(), status }, session.config.worktree_base_dir);
}

/**
 * Get all async jobs from persistent state.
 */
export function getAsyncJobs(session: SwarmSession): Record<string, AsyncTaskRecord> {
	return getPersistedAsyncTasks(session.dir, session.config.worktree_base_dir);
}

/**
 * Get budget state for a session.
 */
export function getBudgetState(session: SwarmSession): BudgetState {
	return session.threadManager.getBudgetState();
}

/**
 * Merge completed threads.
 */
export async function mergeThreads(session: SwarmSession): Promise<MergeResult[]> {
	const threads = session.threadManager.getThreads();
	return mergeAllThreads(session.dir, threads, { continueOnConflict: true });
}

/**
 * Cancel a specific thread or all threads.
 * Per-thread cancellation uses ThreadManager.cancelThread() which
 * aborts the thread's individual AbortController.
 */
export function cancelThreads(session: SwarmSession, threadId?: string): { cancelled: boolean; message: string } {
	if (threadId) {
		const cancelled = session.threadManager.cancelThread(threadId);
		if (!cancelled) {
			const threads = session.threadManager.getThreads();
			const thread = threads.find((t) => t.id === threadId);
			if (!thread) return { cancelled: false, message: `Thread ${threadId} not found` };
			return { cancelled: false, message: `Thread ${threadId} is ${thread.status}, cannot cancel` };
		}
		return { cancelled: true, message: `Thread ${threadId} cancelled` };
	}

	// Cancel all — abort the session controller
	session.abortController.abort();
	return { cancelled: true, message: "All threads cancelled" };
}

/**
 * Cleanup a session — destroy worktrees, remove session.
 * @param dryRun - If true, report what would be cleaned without actually deleting.
 */
export async function cleanupSession(dir: string, purgeAllOrphans = false, dryRun = false): Promise<string> {
	const absDir = path.resolve(dir);
	const canonicalDir = fs.existsSync(absDir) ? assertWithinRepository(absDir, absDir) : absDir;
	const session = sessions.get(canonicalDir) || sessions.get(absDir);
	const worktreeBaseDir = session?.config.worktree_base_dir;
	if (!session && !purgeAllOrphans) {
		if (!dryRun && fs.existsSync(canonicalDir)) clearPersistedState(canonicalDir, worktreeBaseDir);
		return "No active session for this directory";
	}

	if (session && !dryRun) {
		session.abortController.abort();
		await session.threadManager.cleanup();
		sessions.delete(canonicalDir);
		sessions.delete(absDir);
	}

	if (!dryRun && fs.existsSync(canonicalDir)) {
		clearPersistedState(canonicalDir, worktreeBaseDir);
	}

	if (purgeAllOrphans) {
		const { prunedWorktrees, deletedBranches, report } = await purgeOrphans(canonicalDir, dryRun, worktreeBaseDir);
		const prefix = dryRun ? "[DRY RUN] " : "";
		const reportStr = report.length > 0 ? `\n${report.join("\n")}` : "";
		return `${prefix}Session cleaned up for ${canonicalDir} (purged ${prunedWorktrees} orphan worktree dirs, ${deletedBranches} branches)${reportStr}`;
	}

	return `Session cleaned up for ${canonicalDir}`;
}

/**
 * Cleanup all sessions. Snapshots keys first to avoid
 * mutating the map during iteration.
 */
export async function cleanupAllSessions(): Promise<void> {
	const dirs = [...sessions.keys()];
	for (const dir of dirs) {
		await cleanupSession(dir);
	}
}

/**
 * Creates an ActionDispatcher wired to a SwarmSession for declarative orchestration.
 */
export function createSessionDispatcher(session: SwarmSession): ActionDispatcher {
	return new ActionDispatcher({
		async spawn(action: SpawnAction) {
			const threadId = `mcp-${randomUUID()}`;
			const result = await spawnThread(session, {
				id: threadId,
				task: action.task,
				files: action.writeScope,
				model: action.model,
			});
			return {
				threadId,
				success: result.success,
				summary: result.summary,
				filesChanged: result.filesChanged,
				durationMs: result.durationMs,
			};
		},

		async wait(action: WaitAction) {
			const threads = getThreads(session);
			const matched = threads.filter((t) => action.threadIds.includes(t.id));
			return {
				threads: matched.map((t) => ({
					id: t.id,
					status: t.status,
					phase: t.phase,
					success: t.result?.success,
				})),
			};
		},

		async inspectDiff(action: InspectDiffAction) {
			const threads = getThreads(session);
			const thread = threads.find((t) => t.id === action.threadId);
			if (!thread) {
				return { error: `Thread ${action.threadId} not found` };
			}
			let diff = "";
			if (thread.worktreePath) {
				const wm = session.threadManager.getWorktreeManager();
				diff = await wm.getDiff(action.threadId);
			}
			return {
				threadId: action.threadId,
				diff,
				diffStats: thread.result?.diffStats || "",
				filesChanged: thread.result?.filesChanged || [],
			};
		},

		async review(action: ReviewAction) {
			const threads = getThreads(session);
			const thread = threads.find((t) => t.id === action.threadId);
			if (!thread) {
				return { error: `Thread ${action.threadId} not found` };
			}
			return {
				threadId: action.threadId,
				status: thread.status,
				reviewed: true,
			};
		},

		async merge(action: MergeAction) {
			const threads = getThreads(session);
			const thread = threads.find((t) => t.id === action.threadId);
			if (!thread) {
				return { error: `Thread ${action.threadId} not found` };
			}
			if (!thread.branchName) {
				return { error: `Thread ${action.threadId} has no branch` };
			}
			const result = await mergeThreadBranch(session.dir, thread.branchName, action.threadId);
			return {
				threadId: action.threadId,
				merged: result.success,
				branch: result.branch,
				message: result.message,
				conflicts: result.conflicts,
			};
		},

		async finish(action: FinishAction) {
			return {
				finished: true,
				summary: action.summary,
			};
		},
	});
}
