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
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { WorktreeInfo } from "../core/types.js";
import { isPathAllowed } from "../security/file-policy.js";
import { assertWithinRepository } from "../security/repository-boundary.js";
import { isBlockedPath } from "../security/secret-filter.js";

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
		this.repoRoot = assertWithinRepository(repoRoot, repoRoot);
		const targetBase = path.isAbsolute(baseDir) ? baseDir : path.join(this.repoRoot, baseDir);
		this.baseDir = assertWithinRepository(targetBase, this.repoRoot);
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
		if (!/^[a-zA-Z0-9_-]+$/.test(threadId)) {
			throw new Error(
				`Invalid threadId "${threadId}": must contain only alphanumeric characters, underscores, and dashes.`,
			);
		}
		const branch = `swarm/${threadId}`;
		const wtPath = assertWithinRepository(path.resolve(this.baseDir, `wt-${threadId}`), this.repoRoot);
		const rel = path.relative(path.resolve(this.baseDir), wtPath);
		if (rel.startsWith("..") || path.isAbsolute(rel)) {
			throw new Error(`Path traversal detected: worktree path "${wtPath}" escapes base directory "${this.baseDir}"`);
		}

		// Remove stale worktree if it exists
		if (existsSync(wtPath)) {
			try {
				await git(["worktree", "remove", "--force", wtPath], this.repoRoot);
			} catch {
				rmSync(wtPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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

				// Write ownership marker to distinguish ContextOS worktrees from user directories
				try {
					writeFileSync(
						path.join(wtPath, ".contextos-owner"),
						JSON.stringify(
							{
								threadId,
								createdAt: Date.now(),
								creatorPid: process.pid,
							},
							null,
							2,
						),
					);
				} catch {
					// Non-fatal
				}

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
		assertWithinRepository(info.path, this.repoRoot);

		// Stage all changes first to include new files in diff
		try {
			await git(["add", "-A"], info.path);
			try {
				await git(["reset", "--", ".contextos-owner"], info.path);
			} catch {
				/* non-fatal */
			}
		} catch {
			// Might be empty
		}

		const { stdout: fullDiff } = await git(["diff", "--cached", "--", ":(exclude).contextos-owner"], info.path);
		return fullDiff || "(no changes)";
	}

	/** Get diff stats (short summary). */
	async getDiffStats(threadId: string): Promise<string> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);
		assertWithinRepository(info.path, this.repoRoot);

		try {
			await git(["add", "-A"], info.path);
			try {
				await git(["reset", "--", ".contextos-owner"], info.path);
			} catch {
				/* non-fatal */
			}
		} catch {
			/* empty */
		}

		const { stdout } = await git(["diff", "--cached", "--stat", "--", ":(exclude).contextos-owner"], info.path);
		return stdout.trim() || "(no changes)";
	}

	/** Get list of changed files. */
	async getChangedFiles(threadId: string): Promise<string[]> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);
		assertWithinRepository(info.path, this.repoRoot);

		try {
			await git(["add", "-A"], info.path);
			try {
				await git(["reset", "--", ".contextos-owner"], info.path);
			} catch {
				/* non-fatal */
			}
		} catch {
			/* empty */
		}

		const { stdout } = await git(["diff", "--cached", "--name-only", "--", ":(exclude).contextos-owner"], info.path);
		return stdout
			.trim()
			.split("\n")
			.filter(Boolean)
			.filter((f) => f !== ".contextos-owner");
	}

	/** Commit all changes in a worktree. */
	async commit(threadId: string, message: string): Promise<boolean> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);
		assertWithinRepository(info.path, this.repoRoot);

		try {
			// 1. Check porcelain status to inspect changed & untracked files
			const { stdout: statusRaw } = await git(["status", "--porcelain"], info.path);
			if (!statusRaw.trim()) return false;

			// 2. Validate changed paths against security policies
			const lines = statusRaw
				.split("\n")
				.map((l) => l.trim())
				.filter(Boolean);
			const pathsToStage: string[] = [];
			for (const line of lines) {
				const rawPathPart = line.slice(2).trim();
				const cleanPath = rawPathPart.includes("->") ? rawPathPart.split("->")[1].trim() : rawPathPart;
				const unquoted = cleanPath.replace(/^"(.*)"$/, "$1");

				if (unquoted === ".contextos-owner") {
					continue; // Do not commit internal ownership marker
				}
				if (isBlockedPath(unquoted)) {
					process.stderr.write(`[worktree-manager] Blocked staging of sensitive path: ${unquoted}\n`);
					continue;
				}
				if (!isPathAllowed(unquoted, info.path)) {
					process.stderr.write(`[worktree-manager] Blocked path traversal attempt: ${unquoted}\n`);
					continue;
				}
				pathsToStage.push(unquoted);
			}

			if (pathsToStage.length === 0) {
				return false;
			}

			// 3. Stage only verified paths
			await git(["add", "--", ...pathsToStage], info.path);

			const { stdout: stagedStatus } = await git(["status", "--porcelain"], info.path);
			if (!stagedStatus.trim()) return false;

			await git(["commit", "-m", message], info.path);
			return true;
		} catch (err) {
			if (String(err).includes("nothing to commit")) return false;
			throw err;
		}
	}

	/** Destroy a worktree and optionally its branch. */
	async destroy(threadId: string, deleteBranch: boolean = false): Promise<void> {
		const info = this.worktrees.get(threadId);
		if (!info) return;
		assertWithinRepository(info.path, this.repoRoot);

		try {
			await git(["worktree", "remove", "--force", info.path], this.repoRoot);
		} catch {
			// Force remove the directory if git worktree remove fails
			if (existsSync(info.path)) {
				rmSync(info.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
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
		assertWithinRepository(this.baseDir, this.repoRoot);
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
				rmSync(this.baseDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
			}
		} catch {
			/* non-fatal */
		}
	}
}
