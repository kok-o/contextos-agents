import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorktreeManager } from "../../src/worktree/manager.js";

describe("Worktree Git Index Safety & Sensitive File Protection (P0 Trust Patch)", () => {
	let repoDir: string;
	let wm: WorktreeManager;

	beforeEach(async () => {
		repoDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ctx-safety-repo-")));
		execFileSync("git", ["init", "--initial-branch", "main"], { cwd: repoDir });
		execFileSync("git", ["config", "user.email", "test@contextos.dev"], { cwd: repoDir });
		execFileSync("git", ["config", "user.name", "ContextOS Test"], { cwd: repoDir });

		fs.writeFileSync(path.join(repoDir, "README.md"), "# Initial Commit\n");
		execFileSync("git", ["add", "."], { cwd: repoDir });
		execFileSync("git", ["commit", "-m", "initial commit"], { cwd: repoDir });

		wm = new WorktreeManager(repoDir, ".swarm-worktrees");
	});

	afterEach(async () => {
		try {
			fs.rmSync(repoDir, { recursive: true, force: true });
		} catch {}
	});

	it("getDiff() does NOT stage untracked files into the real Git index", async () => {
		const info = await wm.create("safety-diff-1");

		// Create an untracked file
		fs.writeFileSync(path.join(info.path, "untracked.ts"), "export const a = 1;\n");

		// Call getDiff
		const diff = await wm.getDiff("safety-diff-1");
		expect(diff).toContain("untracked.ts");
		expect(diff).toContain("export const a = 1");

		// The real worktree index must NOT have untracked.ts staged!
		const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: info.path }).toString().trim();
		expect(staged).toBe(""); // index remains completely clean

		// git status should still report untracked.ts as untracked ('??')
		const status = execFileSync("git", ["status", "--porcelain"], { cwd: info.path }).toString().trim();
		expect(status).toContain("?? untracked.ts");
	});

	it("commit() refuses to commit sensitive files and throws SECURITY_POLICY_FAILED", async () => {
		const info = await wm.create("safety-commit-env");

		// Create a sensitive .env file
		fs.writeFileSync(path.join(info.path, ".env"), "SECRET_KEY=123456\n");
		fs.writeFileSync(path.join(info.path, "valid.ts"), "export const ok = true;\n");

		// Attempting to commit must reject with SECURITY_POLICY_FAILED
		await expect(wm.commit("safety-commit-env", "commit with secrets")).rejects.toThrow("SECURITY_POLICY_FAILED");

		// Staged index must not retain .env
		const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: info.path }).toString().trim();
		expect(staged).not.toContain(".env");
	});

	it("getChangedFiles() returns modified and untracked files without modifying index", async () => {
		const info = await wm.create("safety-changed-files");

		fs.writeFileSync(path.join(info.path, "file1.ts"), "const x = 1;\n");
		fs.writeFileSync(path.join(info.path, "file2.ts"), "const y = 2;\n");

		const changed = await wm.getChangedFiles("safety-changed-files");
		expect(changed).toContain("file1.ts");
		expect(changed).toContain("file2.ts");

		// Real index must still be clean
		const staged = execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: info.path }).toString().trim();
		expect(staged).toBe("");
	});
});
