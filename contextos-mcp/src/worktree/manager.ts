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
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WorktreeInfo, WorktreeSessionMarker } from "../core/types.js";
import { isPathAllowed } from "../security/file-policy.js";
import { assertWithinRepository } from "../security/repository-boundary.js";
import { isBlockedPath, redactSecrets } from "../security/secret-filter.js";

function git(args: string[], cwd: string, extraEnv?: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const env = extraEnv ? { ...process.env, ...extraEnv } : process.env;
		execFile("git", args, { cwd, maxBuffer: 10 * 1024 * 1024, env }, (err, stdout, stderr) => {
			if (err) {
				reject(new Error(`git ${args[0]} failed: ${stderr || err.message}`));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

/** Simple async mutex for serializing worktree creation. */
class Mutex {
	private locked = false;
	private waiters: (() => void)[] = [];

	async acquire(): Promise<void> {
		if (!this.locked) {
			this.locked = true;
			return;
		}
		return new Promise<void>((resolve) => {
			this.waiters.push(resolve);
		});
	}

	release(): void {
		this.locked = false;
		const next = this.waiters.shift();
		if (next) next();
	}
}

const WORKTREE_CREATE_RETRIES = 3;
const WORKTREE_RETRY_DELAY_MS = 500;

export class ScopeViolationError extends Error {
	readonly files: readonly string[];

	constructor(files: readonly string[]) {
		super(`scope_violation: changes outside writeScope: ${files.join(", ")}`);
		this.name = "ScopeViolationError";
		this.files = files;
	}
}

export function normalizeGitPath(file: string): string {
	return file.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

export function isWithinWriteScope(file: string, writeScope: readonly string[]): boolean {
	const normalized = normalizeGitPath(file);
	return writeScope.some((scope) => {
		const allowed = normalizeGitPath(scope);
		if (allowed === "." || allowed === "") return true;
		return normalized === allowed || normalized.startsWith(`${allowed}/`);
	});
}

function parseNameStatus(raw: string): string[] {
	const fields = raw.split("\0").filter(Boolean);
	const files: string[] = [];
	for (let index = 0; index < fields.length; ) {
		const status = fields[index++];
		const file = fields[index++];
		if (!file) break;
		files.push(file);
		if (status.startsWith("R") || status.startsWith("C")) {
			const previous = fields[index++];
			if (previous) files.push(previous);
		}
	}
	return files;
}

function parsePorcelainV2(raw: string): string[] {
	const records = raw.split("\0").filter(Boolean);
	const files: string[] = [];
	for (let index = 0; index < records.length; index++) {
		const record = records[index];
		if (record.startsWith("? ")) files.push(record.slice(2));
		else if (record.startsWith("1 ")) files.push(record.split(" ").slice(8).join(" "));
		else if (record.startsWith("2 ")) {
			files.push(record.split(" ").slice(9).join(" "));
			const previous = records[++index];
			if (previous) files.push(previous);
		} else if (record.startsWith("u ")) files.push(record.split(" ").slice(10).join(" "));
	}
	return files;
}

export function createRepositoryFingerprint(repoRoot: string): string {
	const canonical = path.resolve(repoRoot).toLowerCase();
	return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export class WorktreeManager {
	private repoRoot: string;
	private baseDir: string;
	private sessionId: string;
	private repoFingerprint: string;
	private worktrees: Map<string, WorktreeInfo> = new Map();
	private createMutex = new Mutex();

	constructor(repoRoot: string, baseDir: string = ".swarm-worktrees", sessionId?: string) {
		this.repoRoot = assertWithinRepository(repoRoot, repoRoot);
		const targetBase = path.isAbsolute(baseDir) ? baseDir : path.join(this.repoRoot, baseDir);
		this.baseDir = assertWithinRepository(targetBase, this.repoRoot);
		this.sessionId = sessionId || `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
		this.repoFingerprint = createRepositoryFingerprint(this.repoRoot);
	}

	getSessionId(): string {
		return this.sessionId;
	}

	getRepositoryFingerprint(): string {
		return this.repoFingerprint;
	}

	isContextosWorktree(wtPath: string): boolean {
		const sessionMarkerPath = path.join(wtPath, ".contextos-session");
		const ownerMarkerPath = path.join(wtPath, ".contextos-owner");

		if (existsSync(sessionMarkerPath)) {
			try {
				const raw = readFileSync(sessionMarkerPath, "utf-8");
				const marker: WorktreeSessionMarker = JSON.parse(raw);
				return marker.schemaVersion === 1 && marker.repositoryFingerprint === this.repoFingerprint;
			} catch {
				return false;
			}
		}

		if (existsSync(ownerMarkerPath)) {
			try {
				const raw = readFileSync(ownerMarkerPath, "utf-8");
				const owner = JSON.parse(raw);
				return typeof owner.threadId === "string";
			} catch {
				return false;
			}
		}

		return false;
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
					const sessionMarker: WorktreeSessionMarker = {
						schemaVersion: 1,
						sessionId: this.sessionId,
						repositoryFingerprint: this.repoFingerprint,
						worktreePath: wtPath,
						branchName: branch,
						createdAt: Date.now(),
					};
					writeFileSync(path.join(wtPath, ".contextos-session"), JSON.stringify(sessionMarker, null, 2));
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

		// Use an isolated temporary index file so the real Git index is NEVER modified by getDiff
		const tmpIndex = path.join(os.tmpdir(), `ctx-idx-${randomUUID()}`);
		try {
			try {
				await git(["read-tree", "HEAD"], info.path, { GIT_INDEX_FILE: tmpIndex });
				await git(["add", "-A"], info.path, { GIT_INDEX_FILE: tmpIndex });
				const { stdout: fullDiff } = await git(
					["diff", "--cached", "--", ":(exclude).contextos-owner", ":(exclude).contextos-session"],
					info.path,
					{ GIT_INDEX_FILE: tmpIndex },
				);
				return redactSecrets(fullDiff || "(no changes)");
			} catch {
				const { stdout: fallbackDiff } = await git(
					["diff", "HEAD", "--", ":(exclude).contextos-owner", ":(exclude).contextos-session"],
					info.path,
				);
				return redactSecrets(fallbackDiff || "(no changes)");
			}
		} finally {
			try {
				if (existsSync(tmpIndex)) unlinkSync(tmpIndex);
			} catch {
				/* cleanup best-effort */
			}
		}
	}

	/** Get diff stats (short summary). */
	async getDiffStats(threadId: string): Promise<string> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);
		assertWithinRepository(info.path, this.repoRoot);

		const tmpIndex = path.join(os.tmpdir(), `ctx-idx-${randomUUID()}`);
		try {
			try {
				await git(["read-tree", "HEAD"], info.path, { GIT_INDEX_FILE: tmpIndex });
				await git(["add", "-A"], info.path, { GIT_INDEX_FILE: tmpIndex });
				const { stdout } = await git(
					["diff", "--cached", "--stat", "--", ":(exclude).contextos-owner", ":(exclude).contextos-session"],
					info.path,
					{ GIT_INDEX_FILE: tmpIndex },
				);
				return redactSecrets(stdout.trim() || "(no changes)");
			} catch {
				const { stdout: fallbackStats } = await git(
					["diff", "HEAD", "--stat", "--", ":(exclude).contextos-owner", ":(exclude).contextos-session"],
					info.path,
				);
				return redactSecrets(fallbackStats.trim() || "(no changes)");
			}
		} finally {
			try {
				if (existsSync(tmpIndex)) unlinkSync(tmpIndex);
			} catch {
				/* cleanup best-effort */
			}
		}
	}

	/** Get list of changed files without mutating Git index. */
	async getChangedFiles(threadId: string): Promise<string[]> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);
		assertWithinRepository(info.path, this.repoRoot);

		const { stdout: status } = await git(["status", "--porcelain=v2", "-z", "--untracked-files=all"], info.path);
		const internal = new Set([".contextos-owner", ".contextos-session"]);
		return [
			...new Set(
				parsePorcelainV2(status)
					.map(normalizeGitPath)
					.filter((file) => file && !internal.has(file) && !isBlockedPath(file)),
			),
		];
	}

	/**
	 * Detect every worktree change, including untracked, staged, unstaged,
	 * committed, and both sides of renames, then enforce the immutable scope.
	 */
	async assertWriteScope(threadId: string, baseSha: string, writeScope: readonly string[]): Promise<string[]> {
		const info = this.worktrees.get(threadId);
		if (!info) throw new Error(`No worktree for thread ${threadId}`);
		assertWithinRepository(info.path, this.repoRoot);
		if (!baseSha || !/^[0-9a-fA-F]{7,64}$/.test(baseSha)) throw new Error("Invalid TaskBrief baseSha");
		if (writeScope.length === 0) throw new ScopeViolationError(["<empty writeScope>"]);

		const [{ stdout: status }, { stdout: committed }, { stdout: staged }] = await Promise.all([
			git(["status", "--porcelain=v2", "-z", "--untracked-files=all"], info.path),
			git(["diff", "--name-status", "-z", `${baseSha}...HEAD`], info.path),
			git(["diff", "--cached", "--name-status", "-z"], info.path),
		]);

		const internal = new Set([".contextos-owner", ".contextos-session"]);
		const touched = [
			...new Set([...parsePorcelainV2(status), ...parseNameStatus(committed), ...parseNameStatus(staged)]),
		]
			.map(normalizeGitPath)
			.filter((file) => file && !internal.has(file));

		for (const file of touched) assertWithinRepository(path.resolve(info.path, file), info.path);
		const violations = touched.filter((file) => !isWithinWriteScope(file, writeScope));
		if (violations.length > 0) throw new ScopeViolationError(violations);
		return touched;
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

				if (unquoted === ".contextos-owner" || unquoted === ".contextos-session") {
					continue; // Do not commit internal ownership markers
				}
				if (isBlockedPath(unquoted)) {
					throw new Error(`SECURITY_POLICY_FAILED: Attempted commit of blocked sensitive path: "${unquoted}"`);
				}
				if (!isPathAllowed(unquoted, info.path)) {
					throw new Error(`SECURITY_POLICY_FAILED: Path traversal violation attempt: "${unquoted}"`);
				}
				pathsToStage.push(unquoted);
			}

			if (pathsToStage.length === 0) {
				return false;
			}

			// 3. Reset index first to ensure no previously staged sensitive files leak into commit
			await git(["reset"], info.path);

			// 4. Stage only verified paths
			await git(["add", "--", ...pathsToStage], info.path);

			// 5. Verify staged inventory strictly against blocked paths
			const { stdout: stagedStatus } = await git(["diff", "--cached", "--name-only", "-z"], info.path);
			const stagedFiles = stagedStatus.split("\0").filter(Boolean);
			for (const file of stagedFiles) {
				if (isBlockedPath(file) || !isPathAllowed(file, info.path)) {
					await git(["reset"], info.path);
					throw new Error(`SECURITY_POLICY_FAILED: Sensitive or disallowed path detected in staged index: "${file}"`);
				}
			}

			if (stagedFiles.length === 0) return false;

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

		if (existsSync(info.path) && existsSync(path.join(info.path, ".contextos-session"))) {
			if (!this.isContextosWorktree(info.path)) {
				throw new Error(`Refusing to destroy worktree "${info.path}": invalid or mismatched ownership marker`);
			}
		}

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
