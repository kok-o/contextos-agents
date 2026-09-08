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
import { assertWithinRepository } from "../security/repository-boundary.js";
import { createRepositoryFingerprint } from "../worktree/manager.js";

const execFileAsync = promisify(execFile);

export interface AsyncTaskRecord {
	taskId: string;
	agentCount: number;
	startedAt: number;
	status: "running" | "completed" | "failed" | "unknown_after_restart";
}

export interface PersistedSessionState {
	dir: string;
	sessionId?: string;
	ownerPid?: number;
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
const STATE_LOCK_NAME = "session-state.lock";
const DEFAULT_WORKTREE_BASE_DIR = ".swarm-worktrees";
const LOCK_TIMEOUT_MS = 30_000;

export interface StateLockData {
	pid: number;
	sessionId?: string;
	lockedAt: number;
}

export function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (err: any) {
		return err.code === "EPERM";
	}
}

function getStatePath(dir: string, worktreeBaseDir?: string): string {
	const canonicalDir = assertWithinRepository(dir, dir);
	const targetBase = path.isAbsolute(worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		? (worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		: path.join(canonicalDir, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	const canonicalBaseDir = assertWithinRepository(targetBase, canonicalDir);
	const statePath = path.join(canonicalBaseDir, STATE_FILE_NAME);
	return assertWithinRepository(statePath, canonicalDir);
}

export function getStateLockPath(dir: string, worktreeBaseDir?: string): string {
	const canonicalDir = assertWithinRepository(dir, dir);
	const targetBase = path.isAbsolute(worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		? (worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		: path.join(canonicalDir, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	const canonicalBaseDir = assertWithinRepository(targetBase, canonicalDir);
	const lockPath = path.join(canonicalBaseDir, STATE_LOCK_NAME);
	return assertWithinRepository(lockPath, canonicalDir);
}

/**
 * Attempts to acquire an advisory state lock with stale lock timeout & dead-owner recovery.
 */
export function acquireStateLock(dir: string, sessionId?: string, worktreeBaseDir?: string): (() => void) | null {
	const lockPath = getStateLockPath(dir, worktreeBaseDir);
	const lockDir = path.dirname(lockPath);
	if (!fs.existsSync(lockDir)) {
		fs.mkdirSync(lockDir, { recursive: true });
	}

	if (fs.existsSync(lockPath)) {
		try {
			const raw = fs.readFileSync(lockPath, "utf-8");
			const lock: StateLockData = JSON.parse(raw);
			const isExpired = Date.now() - lock.lockedAt > LOCK_TIMEOUT_MS;
			const isOwnerDead = !isProcessAlive(lock.pid);
			if (isExpired || isOwnerDead) {
				try {
					fs.unlinkSync(lockPath);
				} catch {}
			} else if (lock.pid !== process.pid) {
				return null;
			}
		} catch {
			try {
				fs.unlinkSync(lockPath);
			} catch {}
		}
	}

	const lockData: StateLockData = {
		pid: process.pid,
		sessionId,
		lockedAt: Date.now(),
	};

	try {
		fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: "wx" });
	} catch {
		return null;
	}

	let released = false;
	return () => {
		if (released) return;
		released = true;
		try {
			if (fs.existsSync(lockPath)) {
				fs.unlinkSync(lockPath);
			}
		} catch {}
	};
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
 * Loads persisted session state from disk with crash/restart recovery.
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
			// Crash/Restart recovery: if state was owned by a dead process or previous process instance
			const isRecoveredSession = parsed.ownerPid && (parsed.ownerPid !== process.pid || !isProcessAlive(parsed.ownerPid));
			if (isRecoveredSession) {
				for (const thread of Object.values(parsed.threads)) {
					if (thread.status === "running" || thread.phase === "agent_running") {
						thread.status = "interrupted";
						thread.phase = "interrupted";
						thread.error = thread.error || "Thread interrupted by process restart or crash";
						// Conservative cost retention: do not reset estimatedCostUsd
					}
				}
				if (parsed.asyncTasks) {
					for (const task of Object.values(parsed.asyncTasks)) {
						if (task.status === "running") {
							task.status = "unknown_after_restart";
						}
					}
				}
			}
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
	state.ownerPid = state.ownerPid || process.pid;
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
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);
	const targetBase = path.isAbsolute(worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		? (worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		: path.join(canonicalRoot, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	const baseDir = assertWithinRepository(targetBase, canonicalRoot);
	const worktreeDirs: string[] = [];
	const swarmBranches: string[] = [];

	if (fs.existsSync(baseDir)) {
		try {
			const entries = fs.readdirSync(baseDir, { withFileTypes: true });
			for (const entry of entries) {
				if (entry.isDirectory() && entry.name !== "." && entry.name !== "..") {
					const entryPath = path.join(baseDir, entry.name);
					const canonicalEntry = assertWithinRepository(entryPath, canonicalRoot);
					const sessionMarkerPath = path.join(canonicalEntry, ".contextos-session");
					if (fs.existsSync(sessionMarkerPath)) {
						try {
							const marker = JSON.parse(fs.readFileSync(sessionMarkerPath, "utf-8"));
							const expectedFingerprint = createRepositoryFingerprint(canonicalRoot);
							if (marker.repositoryFingerprint && marker.repositoryFingerprint !== expectedFingerprint) {
								continue;
							}
						} catch {
							// Corrupt marker
						}
					}
					worktreeDirs.push(canonicalEntry);
				}
			}
		} catch {
			// Ignore directory read failure
		}
	}

	try {
		const { stdout } = await execFileAsync("git", ["branch", "--list", "swarm/*"], { cwd: canonicalRoot });
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
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);
	let prunedWorktrees = 0;
	let deletedBranches = 0;
	const report: string[] = [];

	// 1. Tell git to prune worktrees first
	if (!dryRun) {
		try {
			await execFileAsync("git", ["worktree", "prune"], { cwd: canonicalRoot });
		} catch {
			// Ignore
		}
	}

	const { worktreeDirs, swarmBranches } = await scanOrphanWorktrees(canonicalRoot, worktreeBaseDir);

	// 2. Remove lingering directories
	for (const wtDir of worktreeDirs) {
		assertWithinRepository(wtDir, canonicalRoot);
		const sessionMarkerPath = path.join(wtDir, ".contextos-session");
		if (fs.existsSync(sessionMarkerPath)) {
			try {
				const marker = JSON.parse(fs.readFileSync(sessionMarkerPath, "utf-8"));
				const expectedFingerprint = createRepositoryFingerprint(canonicalRoot);
				if (marker.repositoryFingerprint && marker.repositoryFingerprint !== expectedFingerprint) {
					report.push(`[SKIP] Mismatched repository fingerprint: ${wtDir}`);
					continue;
				}
			} catch {}
		}

		if (dryRun) {
			report.push(`[DRY RUN] Would remove worktree: ${wtDir}`);
			prunedWorktrees++;
			continue;
		}
		try {
			// Try git worktree remove first
			await execFileAsync("git", ["worktree", "remove", "--force", wtDir], { cwd: canonicalRoot });
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
			await execFileAsync("git", ["branch", "-D", branch], { cwd: canonicalRoot });
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
