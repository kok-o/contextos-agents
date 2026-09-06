/**
 * Persistent session and thread state storage for ContextOS MCP server.
 *
 * Ensures that thread execution states, worktree locations, and results
 * survive MCP server process restarts and can be recovered or cleaned up.
 */

import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import type { ThreadState } from "../core/types.js";

const execFileAsync = promisify(execFile);

export interface AsyncTaskRecord {
	taskId: string;
	agentCount: number;
	startedAt: number;
	status: "running" | "completed" | "failed" | "unknown_after_restart";
}

export interface PersistedSessionState {
	dir: string;
	createdAt: number;
	lastUpdatedAt: number;
	threads: Record<string, ThreadState>;
	asyncTasks?: Record<string, AsyncTaskRecord>;
}

export interface OrphanReport {
	worktreeDirs: string[];
	swarmBranches: string[];
}

const STATE_FILE_NAME = "session-state.json";
const DEFAULT_WORKTREE_BASE_DIR = ".swarm-worktrees";

function getStatePath(dir: string, worktreeBaseDir?: string): string {
	const baseDir = path.join(dir, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	return path.join(baseDir, STATE_FILE_NAME);
}

/**
 * Safely writes JSON content atomically using a temporary file.
 */
function atomicWriteJson(filePath: string, data: unknown): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
	const content = JSON.stringify(data, null, 2);

	try {
		fs.writeFileSync(tempPath, content, "utf-8");
		fs.renameSync(tempPath, filePath);
	} catch {
		// Fallback for Windows if rename fails due to transient file locks
		try {
			fs.writeFileSync(filePath, content, "utf-8");
		} finally {
			if (fs.existsSync(tempPath)) {
				try {
					fs.unlinkSync(tempPath);
				} catch {
					// Ignore temp cleanup errors
				}
			}
		}
	}
}

/**
 * Loads persisted session state from disk.
 */
export function loadPersistedState(dir: string, worktreeBaseDir?: string): PersistedSessionState | null {
	const statePath = getStatePath(dir, worktreeBaseDir);
	if (!fs.existsSync(statePath)) {
		return null;
	}

	try {
		const raw = fs.readFileSync(statePath, "utf-8");
		const parsed = JSON.parse(raw) as PersistedSessionState;
		if (parsed && typeof parsed.threads === "object") {
			return parsed;
		}
	} catch {
		// Ignore corrupted state files
	}
	return null;
}

/**
 * Saves or updates entire persisted session state.
 */
export function savePersistedState(dir: string, state: PersistedSessionState, worktreeBaseDir?: string): void {
	state.lastUpdatedAt = Date.now();
	atomicWriteJson(getStatePath(dir, worktreeBaseDir), state);
}

/**
 * Records or updates an individual thread state in the persisted storage.
 */
export function recordThreadState(dir: string, thread: ThreadState, worktreeBaseDir?: string): void {
	let state = loadPersistedState(dir, worktreeBaseDir);
	if (!state) {
		state = {
			dir,
			createdAt: Date.now(),
			lastUpdatedAt: Date.now(),
			threads: {},
		};
	}

	state.threads[thread.id] = thread;
	state.lastUpdatedAt = Date.now();
	savePersistedState(dir, state, worktreeBaseDir);
}

/**
 * Records or updates an async task execution in persisted storage.
 */
export function recordAsyncTask(dir: string, task: AsyncTaskRecord, worktreeBaseDir?: string): void {
	let state = loadPersistedState(dir, worktreeBaseDir);
	if (!state) {
		state = {
			dir,
			createdAt: Date.now(),
			lastUpdatedAt: Date.now(),
			threads: {},
		};
	}

	if (!state.asyncTasks) {
		state.asyncTasks = {};
	}
	state.asyncTasks[task.taskId] = task;
	state.lastUpdatedAt = Date.now();
	savePersistedState(dir, state, worktreeBaseDir);
}

/**
 * Retrieves all persisted threads for a directory.
 */
export function getPersistedThreads(dir: string, worktreeBaseDir?: string): ThreadState[] {
	const state = loadPersistedState(dir, worktreeBaseDir);
	if (!state) return [];
	return Object.values(state.threads);
}

/**
 * Retrieves all persisted async tasks for a directory.
 */
export function getPersistedAsyncTasks(dir: string, worktreeBaseDir?: string): Record<string, AsyncTaskRecord> {
	const state = loadPersistedState(dir, worktreeBaseDir);
	if (!state || !state.asyncTasks) return {};
	return state.asyncTasks;
}

/**
 * Clears the persisted state file.
 */
export function clearPersistedState(dir: string, worktreeBaseDir?: string): void {
	const statePath = getStatePath(dir, worktreeBaseDir);
	if (fs.existsSync(statePath)) {
		try {
			fs.unlinkSync(statePath);
		} catch {
			// Ignore unlink failure
		}
	}
}

/**
 * Scans for orphan worktrees and git branches created by dead or terminated threads.
 */
export async function scanOrphanWorktrees(repoRoot: string, worktreeBaseDir?: string): Promise<OrphanReport> {
	const baseDir = path.join(repoRoot, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	const worktreeDirs: string[] = [];
	const swarmBranches: string[] = [];

	if (fs.existsSync(baseDir)) {
		try {
			const entries = fs.readdirSync(baseDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && entry.name !== "." && entry.name !== "..") {
					worktreeDirs.push(path.join(baseDir, entry.name));
				}
			}
		} catch {
			// Ignore directory read failure
		}
	}

	try {
		const { stdout } = await execFileAsync("git", ["branch", "--list", "swarm/*"], { cwd: repoRoot });
		const branches = stdout
			.split("\n")
			.map((b) => b.replace(/^[*+]\s+/, "").trim())
			.filter((b) => b.length > 0 && b.startsWith("swarm/"));
		swarmBranches.push(...branches);
	} catch {
		// Ignore git errors if not a repo or git not found
	}

	return { worktreeDirs, swarmBranches };
}

/**
 * Purges orphan worktrees and git branches.
 * @param repoRoot - Root of the git repository.
 * @param dryRun - If true, report what would be deleted without actually deleting.
 */
export async function purgeOrphans(
	repoRoot: string,
	dryRun = false,
	worktreeBaseDir?: string,
): Promise<{ prunedWorktrees: number; deletedBranches: number; report: string[] }> {
	let prunedWorktrees = 0;
	let deletedBranches = 0;
	const report: string[] = [];

	// 1. Tell git to prune worktrees first
	if (!dryRun) {
		try {
			await execFileAsync("git", ["worktree", "prune"], { cwd: repoRoot });
		} catch {
			// Ignore
		}
	}

	const { worktreeDirs, swarmBranches } = await scanOrphanWorktrees(repoRoot, worktreeBaseDir);

	// 2. Remove lingering directories
	for (const wtDir of worktreeDirs) {
		if (dryRun) {
			report.push(`[DRY RUN] Would remove worktree: ${wtDir}`);
			prunedWorktrees++;
			continue;
		}
		try {
			// Try git worktree remove first
			await execFileAsync("git", ["worktree", "remove", "--force", wtDir], { cwd: repoRoot });
			prunedWorktrees++;
			report.push(`Removed worktree: ${wtDir}`);
		} catch {
			// If git fails, force remove directory
			try {
				if (fs.existsSync(wtDir)) {
					fs.rmSync(wtDir, { recursive: true, force: true });
					prunedWorktrees++;
					report.push(`Force-removed worktree dir: ${wtDir}`);
				}
			} catch {
				// Ignore
			}
		}
	}

	// 3. Delete swarm branches
	for (const branch of swarmBranches) {
		if (dryRun) {
			report.push(`[DRY RUN] Would delete branch: ${branch}`);
			deletedBranches++;
			continue;
		}
		try {
			await execFileAsync("git", ["branch", "-D", branch], { cwd: repoRoot });
			deletedBranches++;
			report.push(`Deleted branch: ${branch}`);
		} catch {
			// Ignore branch deletion failure
		}
	}

	if (!dryRun) {
		clearPersistedState(repoRoot);
	}

	return { prunedWorktrees, deletedBranches, report };
}
