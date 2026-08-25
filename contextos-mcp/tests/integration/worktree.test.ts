/**
 * Integration tests for WorktreeManager using real temporary git repos.
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorktreeManager } from "../../src/worktree/manager.js";

/** Create a real temporary git repo with an initial commit. */
function createTempRepo(): string {
	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-wt-test-"));
	execFileSync("git", ["init", "--initial-branch", "main"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.email", "test@swarm.dev"], { cwd: tmpDir });
	execFileSync("git", ["config", "user.name", "Swarm Test"], { cwd: tmpDir });
	fs.writeFileSync(path.join(tmpDir, "README.md"), "# Test\n");
	execFileSync("git", ["add", "-A"], { cwd: tmpDir });
	execFileSync("git", ["commit", "-m", "init"], { cwd: tmpDir });
	return tmpDir;
}

let tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs) {
		try {
			fs.rmSync(dir, { recursive: true, force: true });
		} catch {
			// best-effort cleanup
		}
	}
	tempDirs = [];
});

describe("WorktreeManager", () => {
	describe("init()", () => {
		it("verifies it is a git repo", async () => {
			const notARepo = fs.mkdtempSync(path.join(os.tmpdir(), "swarm-wt-norepo-"));
			tempDirs.push(notARepo);

			const mgr = new WorktreeManager(notARepo);
			await expect(mgr.init()).rejects.toThrow("Not a git repository");
		});

		it("creates the base directory", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const baseDir = path.join(repoDir, ".swarm-worktrees");
			expect(fs.existsSync(baseDir)).toBe(false);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			expect(fs.existsSync(baseDir)).toBe(true);
		});

		it("updates .gitignore with the base directory", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const gitignore = fs.readFileSync(path.join(repoDir, ".gitignore"), "utf-8");
			expect(gitignore).toContain(".swarm-worktrees/");
		});

		it("does not duplicate .gitignore entry on repeated init", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();
			await mgr.init();

			const gitignore = fs.readFileSync(path.join(repoDir, ".gitignore"), "utf-8");
			const matches = gitignore.match(/\.swarm-worktrees\//g);
			expect(matches).toHaveLength(1);
		});
	});

	describe("create()", () => {
		it("creates a worktree with branch swarm/<threadId> and returns correct WorktreeInfo", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("test-thread-1");

			expect(info.id).toBe("test-thread-1");
			expect(info.branch).toBe("swarm/test-thread-1");
			expect(info.path).toContain("wt-test-thread-1");
			expect(fs.existsSync(info.path)).toBe(true);

			// Verify the branch actually exists in the repo
			const branches = execFileSync("git", ["branch", "--list"], { cwd: repoDir }).toString().trim();
			expect(branches).toContain("swarm/test-thread-1");
		});

		it("creates multiple worktrees for different threads", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info1 = await mgr.create("thread-a");
			const info2 = await mgr.create("thread-b");

			expect(info1.branch).toBe("swarm/thread-a");
			expect(info2.branch).toBe("swarm/thread-b");
			expect(info1.path).not.toBe(info2.path);
			expect(fs.existsSync(info1.path)).toBe(true);
			expect(fs.existsSync(info2.path)).toBe(true);
		});
	});

	describe("getDiff() + getChangedFiles()", () => {
		it("returns correct diff and file list after modifying a file in the worktree", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("diff-thread");

			// Modify an existing file in the worktree
			fs.writeFileSync(path.join(info.path, "README.md"), "# Modified\nNew content\n");

			const diff = await mgr.getDiff("diff-thread");
			expect(diff).toContain("Modified");
			expect(diff).toContain("New content");
			expect(diff).not.toBe("(no changes)");

			const files = await mgr.getChangedFiles("diff-thread");
			expect(files).toContain("README.md");
		});

		it("returns correct diff when adding a new file", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("new-file-thread");

			// Add a brand new file
			fs.writeFileSync(path.join(info.path, "newfile.ts"), "export const x = 42;\n");

			const diff = await mgr.getDiff("new-file-thread");
			expect(diff).toContain("newfile.ts");
			expect(diff).toContain("export const x = 42");

			const files = await mgr.getChangedFiles("new-file-thread");
			expect(files).toContain("newfile.ts");
		});

		it("reports no changes when worktree is clean", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			await mgr.create("clean-thread");

			const diff = await mgr.getDiff("clean-thread");
			expect(diff).toBe("(no changes)");

			const files = await mgr.getChangedFiles("clean-thread");
			expect(files).toEqual([]);
		});
	});

	describe("getDiffStats()", () => {
		it("returns stats summary for changed files", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("stats-thread");
			fs.writeFileSync(path.join(info.path, "README.md"), "# Updated\nLine2\nLine3\n");

			const stats = await mgr.getDiffStats("stats-thread");
			expect(stats).toContain("README.md");
			// Stats format includes insertions/deletions
			expect(stats).toMatch(/\d+/);
		});
	});

	describe("commit()", () => {
		it("commits changes and returns true", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("commit-thread");
			fs.writeFileSync(path.join(info.path, "README.md"), "# Committed change\n");

			const result = await mgr.commit("commit-thread", "test commit message");
			expect(result).toBe(true);

			// Verify commit exists in the branch
			const log = execFileSync("git", ["log", "--oneline", "-1", "swarm/commit-thread"], {
				cwd: repoDir,
			}).toString();
			expect(log).toContain("test commit message");
		});

		it("returns false when there are no changes to commit", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			await mgr.create("empty-commit-thread");

			const result = await mgr.commit("empty-commit-thread", "should not commit");
			expect(result).toBe(false);
		});

		it("returns false on second commit with no new changes", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("double-commit-thread");
			fs.writeFileSync(path.join(info.path, "file.txt"), "content\n");

			const first = await mgr.commit("double-commit-thread", "first commit");
			expect(first).toBe(true);

			const second = await mgr.commit("double-commit-thread", "second commit");
			expect(second).toBe(false);
		});
	});

	describe("destroy()", () => {
		it("removes the worktree directory", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = await mgr.create("destroy-thread");
			expect(fs.existsSync(info.path)).toBe(true);

			await mgr.destroy("destroy-thread");
			expect(fs.existsSync(info.path)).toBe(false);
		});

		it("keeps the branch by default", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			await mgr.create("keep-branch-thread");
			await mgr.destroy("keep-branch-thread");

			const branches = execFileSync("git", ["branch", "--list"], { cwd: repoDir }).toString().trim();
			expect(branches).toContain("swarm/keep-branch-thread");
		});

		it("deletes the branch when deleteBranch is true", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			await mgr.create("delete-branch-thread");
			await mgr.destroy("delete-branch-thread", true);

			const branches = execFileSync("git", ["branch", "--list"], { cwd: repoDir }).toString().trim();
			expect(branches).not.toContain("swarm/delete-branch-thread");
		});

		it("is a no-op for a non-existing thread", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			// Should not throw
			await mgr.destroy("nonexistent-thread");
		});
	});

	describe("destroyAll()", () => {
		it("cleans up all worktrees and their branches", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info1 = await mgr.create("all-1");
			const info2 = await mgr.create("all-2");
			const info3 = await mgr.create("all-3");

			expect(fs.existsSync(info1.path)).toBe(true);
			expect(fs.existsSync(info2.path)).toBe(true);
			expect(fs.existsSync(info3.path)).toBe(true);

			await mgr.destroyAll();

			expect(fs.existsSync(info1.path)).toBe(false);
			expect(fs.existsSync(info2.path)).toBe(false);
			expect(fs.existsSync(info3.path)).toBe(false);

			// Branches should be deleted too (destroyAll uses deleteBranch=true)
			const branches = execFileSync("git", ["branch", "--list"], { cwd: repoDir }).toString().trim();
			expect(branches).not.toContain("swarm/all-1");
			expect(branches).not.toContain("swarm/all-2");
			expect(branches).not.toContain("swarm/all-3");
		});

		it("removes the base directory when empty", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			await mgr.create("cleanup-thread");

			const baseDir = path.join(repoDir, ".swarm-worktrees");
			expect(fs.existsSync(baseDir)).toBe(true);

			await mgr.destroyAll();

			expect(fs.existsSync(baseDir)).toBe(false);
		});
	});

	describe("getWorktreeInfo()", () => {
		it("returns WorktreeInfo for an existing worktree", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const created = await mgr.create("info-thread");
			const info = mgr.getWorktreeInfo("info-thread");

			expect(info).toBeDefined();
			expect(info!.id).toBe("info-thread");
			expect(info!.branch).toBe("swarm/info-thread");
			expect(info!.path).toBe(created.path);
		});

		it("returns undefined for a non-existing thread", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			const info = mgr.getWorktreeInfo("does-not-exist");
			expect(info).toBeUndefined();
		});

		it("returns undefined after worktree is destroyed", async () => {
			const repoDir = createTempRepo();
			tempDirs.push(repoDir);

			const mgr = new WorktreeManager(repoDir);
			await mgr.init();

			await mgr.create("destroyed-info-thread");
			expect(mgr.getWorktreeInfo("destroyed-info-thread")).toBeDefined();

			await mgr.destroy("destroyed-info-thread");
			expect(mgr.getWorktreeInfo("destroyed-info-thread")).toBeUndefined();
		});
	});
});
