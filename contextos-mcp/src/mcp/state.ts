/**
 * Persistent session and thread state storage for ContextOS MCP server.
 *
 * Ensures that thread execution states, worktree locations, and results
 * survive MCP server process restarts and can be recovered or cleaned up.
 *
 * Integrates with ContextOS Runtime v2 ThreadStore.
 */

import { execFile } from "node:child_process";
// @ts-ignore
import { ThreadStore } from "../runtime/thread-store.cjs";
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

export interface OrphanReport {
	worktreeDirs: string[];
	swarmBranches: string[];
}

const ASYNC_TASKS_FILE_NAME = "async-tasks.json";
const ASYNC_TASKS_LOCK_NAME = "async-tasks.lock";
const DEFAULT_WORKTREE_BASE_DIR = ".swarm-worktrees";
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_ACQUIRE_TIMEOUT_MS = 2_000;

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

function getThreadStore(dir: string) {
	const canonicalDir = assertWithinRepository(dir, dir);
	return new ThreadStore({ baseDir: canonicalDir });
}

function getAsyncTasksPath(dir: string): string {
	const canonicalDir = assertWithinRepository(dir, dir);
	const targetBase = path.join(canonicalDir, ".agents", ".contextos", "runtime");
	if (!fs.existsSync(targetBase)) {
		fs.mkdirSync(targetBase, { recursive: true });
	}
	return path.join(targetBase, ASYNC_TASKS_FILE_NAME);
}

function getAsyncTasksLockPath(dir: string): string {
	const canonicalDir = assertWithinRepository(dir, dir);
	const targetBase = path.join(canonicalDir, ".agents", ".contextos", "runtime");
	if (!fs.existsSync(targetBase)) {
		fs.mkdirSync(targetBase, { recursive: true });
	}
	return path.join(targetBase, ASYNC_TASKS_LOCK_NAME);
}

let LeaseLockClass: any = null;

function getLeaseLockClass(dir: string) {
	const canonicalDir = assertWithinRepository(dir, dir);
	if (!LeaseLockClass) {
		let current = canonicalDir;
		while (current !== path.dirname(current)) {
			const p = path.join(current, ".agents", "runtime", "ipc-lock.js");
			if (fs.existsSync(p)) {
				try {
					LeaseLockClass = require(p).LeaseLock;
					break;
				} catch (e) {
					console.error("Failed to load LeaseLock:", e);
				}
			}
			current = path.dirname(current);
		}
	}
	return LeaseLockClass;
}

export function acquireStateLock(dir: string, sessionId?: string): (() => void) | null {
	const lockPath = getAsyncTasksLockPath(dir);
	const lockDir = path.dirname(lockPath);
	if (!fs.existsSync(lockDir)) {
		fs.mkdirSync(lockDir, { recursive: true });
	}

	const LL = getLeaseLockClass(dir);
	if (LL) {
		const lock = new LL({
			lockFilePath: lockPath,
			ttlMs: LOCK_TIMEOUT_MS,
			instanceId: sessionId || "mcp-session",
		});
		if (lock.tryAcquire()) {
			return () => {
				lock.release();
			};
		}
		return null;
	}

	// Fallback to naive lock if LeaseLock not available
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

function acquireStateLockOrThrow(dir: string, sessionId?: string): () => void {
	const startedAt = Date.now();
	const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
	do {
		const release = acquireStateLock(dir, sessionId);
		if (release) return release;
		Atomics.wait(waitBuffer, 0, 0, 10);
	} while (Date.now() - startedAt < LOCK_ACQUIRE_TIMEOUT_MS);
	throw new Error(`Timed out acquiring state lock after ${LOCK_ACQUIRE_TIMEOUT_MS}ms`);
}

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
		try {
			fs.writeFileSync(filePath, content, "utf-8");
		} finally {
			if (fs.existsSync(tempPath)) {
				try {
					fs.unlinkSync(tempPath);
				} catch {}
			}
		}
	}
}

/**
 * Perform schema migration from legacy session-state.json to ThreadStore
 */
function migrateLegacySessionState(repoRoot: string, worktreeBaseDir?: string) {
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);
	const targetBase = path.isAbsolute(worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		? worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR
		: path.join(canonicalRoot, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	const legacyPath = path.join(assertWithinRepository(targetBase, canonicalRoot), "session-state.json");

	if (!fs.existsSync(legacyPath)) {
		return;
	}

	const store = getThreadStore(canonicalRoot);
	try {
		const raw = fs.readFileSync(legacyPath, "utf-8");
		const parsed = JSON.parse(raw);

		if (store && parsed && typeof parsed.threads === "object") {
			for (const [_id, thread] of Object.entries(parsed.threads) as [string, any][]) {
				if (!thread.verification && thread.verificationAttestation?.status) {
					thread.verification = thread.verificationAttestation.status;
				}
				if (!thread.review && thread.reviewAttestation?.llmVerdict) {
					thread.review = {
						specCompliance: thread.reviewAttestation.llmVerdict.specCompliance,
						codeQuality: thread.reviewAttestation.llmVerdict.codeQuality,
						summary: thread.reviewAttestation.llmVerdict.summary,
						reviewerId: thread.reviewAttestation.reviewerExecutionId || "reviewer",
						reviewedAt: thread.completedAt || Date.now(),
					};
				}
				store.save(thread);
			}
		}

		if (parsed?.asyncTasks) {
			const release = acquireStateLockOrThrow(canonicalRoot);
			try {
				const tasksPath = getAsyncTasksPath(canonicalRoot);
				let existingTasks: Record<string, AsyncTaskRecord> = {};
				if (fs.existsSync(tasksPath)) {
					existingTasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
				}
				atomicWriteJson(tasksPath, { ...existingTasks, ...parsed.asyncTasks });
			} finally {
				release();
			}
		}

		// Mark as migrated
		fs.renameSync(legacyPath, `${legacyPath}.migrated`);
	} catch (e) {
		console.error("Migration failed:", e);
	}
}

export async function reconcileSessionStateWithGit(repoRoot: string, worktreeBaseDir?: string) {
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);

	// Ensure migration runs before we read states
	migrateLegacySessionState(canonicalRoot, worktreeBaseDir);

	const store = getThreadStore(canonicalRoot);
	if (!store) return null;

	const threads = store.list() as ThreadState[];

	const gitWorktrees: Map<string, { branch?: string; bare?: boolean }> = new Map();
	try {
		const { stdout } = await execFileAsync("git", ["worktree", "list", "--porcelain"], {
			cwd: canonicalRoot,
			maxBuffer: 10 * 1024 * 1024,
		});
		const entries = stdout.trim().split("\n\n").filter(Boolean);
		for (const entry of entries) {
			const lines = entry.split("\n");
			let worktreePath = "";
			let branch = "";
			let bare = false;
			for (const line of lines) {
				if (line.startsWith("worktree ")) {
					worktreePath = path.normalize(line.slice("worktree ".length).trim());
				} else if (line.startsWith("branch refs/heads/")) {
					branch = line.slice("branch refs/heads/".length).trim();
				} else if (line === "bare") {
					bare = true;
				}
			}
			if (worktreePath) {
				gitWorktrees.set(worktreePath.toLowerCase(), { branch, bare });
			}
		}
	} catch {
		// Non-fatal if git is unavailable
	}

	for (const thread of threads) {
		let modified = false;
		if (thread.status === "running" || thread.status === "pending") {
			thread.status = "interrupted";
			thread.phase = "interrupted";
			thread.error = thread.error || "Thread interrupted by process restart or crash";
			modified = true;
		}

		if (thread.worktreePath) {
			const normWt = path.normalize(thread.worktreePath).toLowerCase();
			const registered = gitWorktrees.get(normWt);
			const existsOnDisk = fs.existsSync(thread.worktreePath);

			if (!existsOnDisk || !registered) {
				if (thread.status === "interrupted") {
					thread.status = "needs_recovery";
					thread.phase = "needs_recovery";
					thread.error = "Worktree directory or git registration missing after restart";
					modified = true;
				}
			} else {
				if (registered.branch && !thread.branchName) {
					thread.branchName = registered.branch;
					modified = true;
				}
			}
		}

		if (modified) {
			store.save(thread);
		}
	}

	// Reconcile async tasks
	const release = acquireStateLockOrThrow(canonicalRoot);
	try {
		const tasksPath = getAsyncTasksPath(canonicalRoot);
		if (fs.existsSync(tasksPath)) {
			let modified = false;
			const tasks: Record<string, AsyncTaskRecord> = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
			for (const task of Object.values(tasks)) {
				if (task.status === "running") {
					task.status = "unknown_after_restart";
					modified = true;
				}
			}
			if (modified) {
				atomicWriteJson(tasksPath, tasks);
			}
		}
	} finally {
		release();
	}

	return { threads }; // return some dummy state so callers know we survived
}

export function recordThreadState(dir: string, thread: ThreadState, _worktreeBaseDir?: string): void {
	const store = getThreadStore(dir);
	if (store) {
		store.save(thread);
	}
}

export function savePersistedState(dir: string, state: any, worktreeBaseDir: string = DEFAULT_WORKTREE_BASE_DIR): void {
	const canonicalDir = assertWithinRepository(dir, dir);
	const targetBase = path.isAbsolute(worktreeBaseDir) ? worktreeBaseDir : path.join(canonicalDir, worktreeBaseDir);
	const validBase = assertWithinRepository(targetBase, canonicalDir);
	fs.mkdirSync(validBase, { recursive: true });
	const legacyPath = path.join(validBase, "session-state.json");
	fs.writeFileSync(legacyPath, JSON.stringify(state, null, 2), "utf-8");
}

export function loadPersistedState(dir: string, worktreeBaseDir?: string): any {
	const canonicalDir = assertWithinRepository(dir, dir);
	const targetBase = path.isAbsolute(worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		? worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR
		: path.join(canonicalDir, worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR);
	const validBase = assertWithinRepository(targetBase, canonicalDir);
	const legacyPath = path.join(validBase, "session-state.json");
	if (fs.existsSync(legacyPath)) {
		try {
			return JSON.parse(fs.readFileSync(legacyPath, "utf-8"));
		} catch {
			return null;
		}
	}
	const store = getThreadStore(canonicalDir);
	if (store) {
		const threads = store.list();
		const threadMap: Record<string, any> = {};
		for (const t of threads) {
			threadMap[t.id] = t;
		}
		return { threads: threadMap, sequence: threads.length };
	}
	return null;
}

export function recordAsyncTask(dir: string, task: AsyncTaskRecord, _worktreeBaseDir?: string): void {
	const release = acquireStateLockOrThrow(dir);
	try {
		const tasksPath = getAsyncTasksPath(dir);
		let existingTasks: Record<string, AsyncTaskRecord> = {};
		if (fs.existsSync(tasksPath)) {
			existingTasks = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
		}
		existingTasks[task.taskId] = task;
		atomicWriteJson(tasksPath, existingTasks);
	} finally {
		release();
	}
}

export function getPersistedThreads(dir: string, _worktreeBaseDir?: string): ThreadState[] {
	const store = getThreadStore(dir);
	if (store) {
		return store.list() as ThreadState[];
	}
	return [];
}

export function getPersistedAsyncTasks(dir: string, _worktreeBaseDir?: string): Record<string, AsyncTaskRecord> {
	const tasksPath = getAsyncTasksPath(dir);
	if (fs.existsSync(tasksPath)) {
		try {
			return JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
		} catch {}
	}
	return {};
}

export function clearPersistedState(_dir: string, _worktreeBaseDir?: string): void {
	// Not deleting thread store to preserve history. Only delete async tasks lock if needed, or don't delete at all.
}

export async function scanOrphanWorktrees(repoRoot: string, worktreeBaseDir?: string): Promise<OrphanReport> {
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);
	const targetBase = path.isAbsolute(worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR)
		? worktreeBaseDir || DEFAULT_WORKTREE_BASE_DIR
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

export async function purgeOrphans(
	repoRoot: string,
	dryRun: boolean = false,
	worktreeBaseDir?: string,
): Promise<{ prunedWorktrees: number; deletedBranches: number; report: string[] }> {
	const scanReport = await scanOrphanWorktrees(repoRoot, worktreeBaseDir);
	const canonicalRoot = assertWithinRepository(repoRoot, repoRoot);

	let prunedWorktrees = 0;
	let deletedBranches = 0;
	const report: string[] = [];

	for (const wt of scanReport.worktreeDirs) {
		if (dryRun) {
			report.push(`[DRY RUN] Would remove orphan worktree: ${wt}`);
			prunedWorktrees++;
		} else {
			try {
				await execFileAsync("git", ["worktree", "remove", "--force", wt], { cwd: canonicalRoot });
				prunedWorktrees++;
				report.push(`Removed orphan worktree: ${wt}`);
			} catch (err: any) {
				report.push(`Failed to remove worktree ${wt}: ${err.message}`);
				try {
					fs.rmSync(wt, { recursive: true, force: true });
					prunedWorktrees++;
				} catch {}
			}
		}
	}

	for (const branch of scanReport.swarmBranches) {
		if (dryRun) {
			report.push(`[DRY RUN] Would delete orphan branch: ${branch}`);
			deletedBranches++;
		} else {
			try {
				await execFileAsync("git", ["branch", "-D", branch], { cwd: canonicalRoot });
				deletedBranches++;
				report.push(`Deleted orphan branch: ${branch}`);
			} catch (err: any) {
				report.push(`Failed to delete branch ${branch}: ${err.message}`);
			}
		}
	}

	return { prunedWorktrees, deletedBranches, report };
}
