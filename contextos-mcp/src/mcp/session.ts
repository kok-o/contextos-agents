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

import * as fs from "node:fs";
import * as path from "node:path";
import type { SwarmConfig } from "../config.js";
import { loadConfig } from "../config.js";
import type { BudgetState, CompressedResult, MergeResult, ThreadConfig, ThreadState } from "../core/types.js";
import { ThreadManager } from "../threads/manager.js";
import { mergeAllThreads } from "../worktree/merge.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SwarmSession {
	dir: string;
	config: SwarmConfig;
	threadManager: ThreadManager;
	abortController: AbortController;
	createdAt: number;
}

export interface ThreadSpawnParams {
	task: string;
	files?: string[];
	agent?: string;
	model?: string;
	context?: string;
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

	// Return existing session
	const existing = sessions.get(absDir);
	if (existing) return existing;

	// Deduplicate concurrent init for the same dir
	const pending = pendingSessions.get(absDir);
	if (pending) return pending;

	const initPromise = initSession(absDir);
	pendingSessions.set(absDir, initPromise);

	try {
		const session = await initPromise;
		return session;
	} finally {
		pendingSessions.delete(absDir);
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
		// Progress callback — log to stderr (stdout is MCP protocol)
		(threadId, phase, detail) => {
			const msg = detail ? `[${threadId}] ${phase}: ${detail}` : `[${threadId}] ${phase}`;
			process.stderr.write(`[swarm-mcp] ${msg}\n`);
		},
		abortController.signal,
	);
	await threadManager.init();

	const session: SwarmSession = {
		dir: absDir,
		config,
		threadManager,
		abortController,
		createdAt: Date.now(),
	};

	sessions.set(absDir, session);
	return session;
}

/**
 * Spawn a thread in a session.
 */
export async function spawnThread(session: SwarmSession, params: ThreadSpawnParams): Promise<CompressedResult> {
	const threadId = `mcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

	const threadConfig: ThreadConfig = {
		id: threadId,
		task: params.task,
		context: params.context || "",
		agent: {
			backend: params.agent || session.config.default_agent,
			model: params.model || session.config.default_model,
		},
		files: params.files || [],
	};

	return session.threadManager.spawnThread(threadConfig);
}

/**
 * Get all threads in a session.
 */
export function getThreads(session: SwarmSession): ThreadState[] {
	return session.threadManager.getThreads();
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
 */
export async function cleanupSession(dir: string): Promise<string> {
	const absDir = path.resolve(dir);
	const session = sessions.get(absDir);
	if (!session) return "No active session for this directory";

	session.abortController.abort();
	await session.threadManager.cleanup();
	sessions.delete(absDir);

	return `Session cleaned up for ${absDir}`;
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
