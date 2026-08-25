/**
 * Git worktree manager — creates isolated worktrees for thread execution.
 *
 * Phase 2 enhancements:
 *   - Mutex on create() to prevent branch name races under concurrency
 *   - Retry logic for git worktree add (transient lock file contention)
 *
 * Lifecycle:
 *   1. create() — git worktree add -b swarm/<id> <path> HEAD
 *   2. Agent runs in worktree directory
 *   3. getDiff() — capture changes
 *   4. commit() — commit changes in worktree
 *   5. destroy() — git worktree remove + branch cleanup
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import * as path from "node:path";
import type { WorktreeInfo } from "../core/types.js";

function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

/** Simple async mutex — only one holder at a time. */
class Mutex {
	private locked = false;
	private waiters: Array<() => void> = [];

	async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true;
			return;
		}
		await new Promise<void>((resolve) => this.waiters.push(resolve));
		this.locked = true;
	}

	release(): void {
		this.locked = false;
		const next = this.waiters.shift();
		if (next) next();
	}
}

const WORKTREE_CREATE_RETRIES = 3;
const WORKTREE_RETRY_DELAY_MS = 500;

export class WorktreeManager {
	private repoRoot: string;
	private baseDir: string;
	private worktrees: Map<string, WorktreeInfo> = new Map();
	private createMutex = new Mutex();

	constructor(repoRoot: string, baseDir: string = ".swarm-worktrees") {
		this.repoRoot = repoRoot;
		this.baseDir = path.isAbsolute(baseDir) ? baseDir : path.join(repoRoot, baseDir);
	}

	/** Ensure we're in a git repo and the base directory exists. */
	async init(): Promise<void> {
		try {
			await git(["rev-parse", "--git-dir"], this.repoRoot);
		} catch {
			throw new Error(`Not a git repository: ${this.repoRoot}`);
		}

		if (!existsSync(this.baseDir)) {
			mkdirSync(this.baseDir, { recursive: true });
		}

		// Add base dir to .gitignore if not already
		const gitignorePath = path.join(this.repoRoot, ".gitignore");
		const baseDirRelative = path.relative(this.repoRoot, this.baseDir);
		try {
			const { readFileSync, appendFileSync } = await import("node:fs");
			let content = "";
			if (existsSync(gitignorePath)) {
				content = readFileSync(gitignorePath, "utf-8");
			}
			if (!content.includes(baseDirRelative)) {
				appendFileSync(gitignorePath, `\n# Swarm worktrees\n${baseDirRelative}/\n`);
			}
		} catch {
			// Non-fatal — .gitignore might be read-only
		}
	}

	/**
	 * Create a new worktree for a thread.
	 * Serialized via mutex to prevent branch name races.
	 * Retries on transient lock-file contention.
	 */
	async create(threadId: string): Promise<WorktreeInfo> {
		await this.createMutex.acquire();
		try {
			return await this.createWorktreeWithRetry(threadId);
		} finally {
			this.createMutex.release();
		}
	}

	private async createWorktreeWithRetry(threadId: string): Promise<WorktreeInfo> {
		const branch = `swarm/${threadId}`;
		const wtPath = path.join(this.baseDir, `wt-${threadId}`);

		// Remove stale worktree if it exists
		if (existsSync(wtPath)) {
			try {
				await git(["worktree", "remove", "--force", wtPath], this.repoRoot);
			} catch {
				rmSync(wtPath, { recursive: true, force: true });
			}
		}

		// Delete stale branch if exists
		try {
			await git(["branch", "-D", branch], this.repoRoot);
		} catch {
			// Branch didn't exist — fine
		}

		// Create worktree with retry for lock-file contention
		let lastErr: Error | undefined;
		for (let attempt = 1; attempt <= WORKTREE_CREATE_RETRIES; attempt++) {
			try {
				await git(["worktree", "add", "-b", branch, wtPath, "HEAD"], this.repoRoot);
				const info: WorktreeInfo = { id: threadId, path: wtPath, branch };
				this.worktrees.set(threadId, info);
				return info;
			} catch (err) {
				lastErr = err instanceof Error ? err : new Error(String(err));
				const isLockError =
					lastErr.message.includes(".lock") ||
					lastErr.message.includes("Unable to create") ||
					lastErr.message.includes("index.lock");

				if (isLockError && attempt < WORKTREE_CREATE_RETRIES) {
					// Wait with jitter before retrying
					const delay = WORKTREE_RETRY_DELAY_MS * attempt + Math.random() * 200;
					await new Promise((r) => setTimeout(r, delay));
					continue;
				}
				throw lastErr;
			}
		}

		throw lastErr || new Error("Failed to create worktree");
	}

	/** Get the git diff of uncommitted changes in a worktree. */
	async getDiff(threadId: string): Promise<string> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);

		// Stage all changes first to include new files in diff
		try {
			await git(["add", "-A"], info.path);
		} catch {
			// Might be empty
		}

		const { stdout: fullDiff } = await git(["diff", "--cached"], info.path);
		return fullDiff || "(no changes)";
	}

	/** Get diff stats (short summary). */
	async getDiffStats(threadId: string): Promise<string> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);

		try {
			await git(["add", "-A"], info.path);
		} catch {
			/* empty */
		}

		const { stdout } = await git(["diff", "--cached", "--stat"], info.path);
		return stdout.trim() || "(no changes)";
	}

	/** Get list of changed files. */
	async getChangedFiles(threadId: string): Promise<string[]> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);

		try {
			await git(["add", "-A"], info.path);
		} catch {
			/* empty */
		}

		const { stdout } = await git(["diff", "--cached", "--name-only"], info.path);
		return stdout.trim().split("\n").filter(Boolean);
	}

	/** Commit all changes in a worktree. */
	async commit(threadId: string, message: string): Promise<boolean> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);

		try {
			await git(["add", "-A"], info.path);
			const { stdout: status } = await git(["status", "--porcelain"], info.path);
			if (!status.trim()) return false; // Nothing to commit

			await git(["commit", "-m", message], info.path);
			return true;
		} catch (err) {
			// Nothing to commit is fine
			if (String(err).includes("nothing to commit")) return false;
			throw err;
		}
	}

	/** Destroy a worktree and optionally its branch. */
	async destroy(threadId: string, deleteBranch: boolean = false): Promise<void> {
		const info = this.worktrees.get(threadId);
		if (!info) return;

		try {
			await git(["worktree", "remove", "--force", info.path], this.repoRoot);
		} catch {
			// Force remove the directory if git worktree remove fails
			if (existsSync(info.path)) {
				rmSync(info.path, { recursive: true, force: true });
			}
			// Prune stale worktree entries
			try {
				await git(["worktree", "prune"], this.repoRoot);
			} catch {
				/* non-fatal */
			}
		}

		if (deleteBranch) {
			try {
				await git(["branch", "-D", info.branch], this.repoRoot);
			} catch {
				// Branch already gone
			}
		}

		this.worktrees.delete(threadId);
	}

	/** Get info for a thread's worktree. */
	getWorktreeInfo(threadId: string): WorktreeInfo | undefined {
		return this.worktrees.get(threadId);
	}

	/** Cleanup all worktrees. Resilient — continues past individual failures. */
	async destroyAll(): Promise<void> {
		for (const [id] of this.worktrees) {
			try {
				await this.destroy(id, true);
			} catch {
				// Continue cleaning up remaining worktrees
			}
		}

		// Remove base directory if empty
		try {
			const { readdirSync } = await import("node:fs");
			if (existsSync(this.baseDir) && readdirSync(this.baseDir).length === 0) {
				rmSync(this.baseDir, { recursive: true, force: true });
			}
		} catch {
			/* non-fatal */
		}
	}
}
