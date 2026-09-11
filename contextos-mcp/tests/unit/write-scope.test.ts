import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ScopeViolationError, WorktreeManager } from "../../src/worktree/manager.js";

let repoDir: string;
let manager: WorktreeManager;

function git(args: string[], cwd = repoDir): string {
	return execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();
}

describe("WorktreeManager writeScope enforcement", () => {
	beforeEach(async () => {
		repoDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "contextos-scope-")));
		git(["init", "-b", "main"]);
		git(["config", "user.email", "tests@example.com"]);
		git(["config", "user.name", "ContextOS Tests"]);
		fs.writeFileSync(path.join(repoDir, "README.md"), "base\n");
		git(["add", "."]);
		git(["commit", "-m", "initial"]);
		manager = new WorktreeManager(repoDir);
		await manager.init();
	});

	afterEach(async () => {
		await manager?.destroyAll();
		fs.rmSync(repoDir, { recursive: true, force: true });
	});

	it("accepts untracked and staged files inside writeScope", async () => {
		const baseSha = git(["rev-parse", "HEAD"]);
		const info = await manager.create("allowed");
		fs.mkdirSync(path.join(info.path, "src"), { recursive: true });
		fs.writeFileSync(path.join(info.path, "src", "allowed.ts"), "export {};\n");

		await expect(manager.assertWriteScope("allowed", baseSha, ["src"])).resolves.toContain("src/allowed.ts");
	});

	it("rejects untracked files outside writeScope", async () => {
		const baseSha = git(["rev-parse", "HEAD"]);
		const info = await manager.create("outside");
		fs.writeFileSync(path.join(info.path, "outside.ts"), "export {};\n");

		await expect(manager.assertWriteScope("outside", baseSha, ["src/allowed.ts"])).rejects.toBeInstanceOf(
			ScopeViolationError,
		);
	});

	it("detects committed renames outside writeScope", async () => {
		const baseSha = git(["rev-parse", "HEAD"]);
		const info = await manager.create("rename");
		git(["mv", "README.md", "MOVED.md"], info.path);
		git(["commit", "-m", "rename"], info.path);

		await expect(manager.assertWriteScope("rename", baseSha, ["src"])).rejects.toThrow(/README\.md|MOVED\.md/);
	});
});
