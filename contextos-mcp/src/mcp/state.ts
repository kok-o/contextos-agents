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

export interface PersistedSessionState {
	dir: string;
	createdAt: number;
	lastUpdatedAt: number;
	threads: Record<string, ThreadState>;
}

export interface OrphanReport {
	worktreeDirs: string[];
	swarmBranches: string[];
}

const STATE_FILE_NAME = "session-state.json";
const WORKTREE_BASE_DIR = ".swarm-worktrees";

function getStatePath(dir: string): string {
	const baseDir = path.join(dir, WORKTREE_BASE_DIR);
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
export function loadPersistedState(dir: string): PersistedSessionState | null {
	const statePath = getStatePath(dir);
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
export function savePersistedState(dir: string, state: PersistedSessionState): void {
	state.lastUpdatedAt = Date.now();
	atomicWriteJson(getStatePath(dir), state);
}

/**
 * Records or updates an individual thread state in the persisted storage.
 */
export function recordThreadState(dir: string, thread: ThreadState): void {
	let state = loadPersistedState(dir);
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
	savePersistedState(dir, state);
}

/**
 * Retrieves all persisted threads for a directory.
 */
export function getPersistedThreads(dir: string): ThreadState[] {
	const state = loadPersistedState(dir);
	if (!state) return [];
	return Object.values(state.threads);
}

/**
 * Clears the persisted state file.
 */
export function clearPersistedState(dir: string): void {
	const statePath = getStatePath(dir);
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
export async function scanOrphanWorktrees(repoRoot: string): Promise<OrphanReport> {
	const baseDir = path.join(repoRoot, WORKTREE_BASE_DIR);
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
 */
export async function purgeOrphans(repoRoot: string): Promise<{ prunedWorktrees: number; deletedBranches: number }> {
	let prunedWorktrees = 0;
	let deletedBranches = 0;

	// 1. Tell git to prune worktrees first
	try {
		await execFileAsync("git", ["worktree", "prune"], { cwd: repoRoot });
	} catch {
		// Ignore
	}

	const { worktreeDirs, swarmBranches } = await scanOrphanWorktrees(repoRoot);

	// 2. Remove lingering directories
	for (const wtDir of worktreeDirs) {
		try {
			// Try git worktree remove first
			await execFileAsync("git", ["worktree", "remove", "--force", wtDir], { cwd: repoRoot });
			prunedWorktrees++;
		} catch {
			// If git fails, force remove directory
			try {
				if (fs.existsSync(wtDir)) {
					fs.rmSync(wtDir, { recursive: true, force: true });
					prunedWorktrees++;
				}
			} catch {
				// Ignore
			}
		}
	}

	// 3. Delete swarm branches
	for (const branch of swarmBranches) {
		try {
			await execFileAsync("git", ["branch", "-D", branch], { cwd: repoRoot });
			deletedBranches++;
		} catch {
			// Ignore branch deletion failure
		}
	}

	clearPersistedState(repoRoot);

	return { prunedWorktrees, deletedBranches };
}
