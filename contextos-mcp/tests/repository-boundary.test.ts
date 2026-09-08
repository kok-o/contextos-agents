import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadPersistedState, scanOrphanWorktrees } from "../src/mcp/state.js";
import {
	assertWithinRepository,
	isWithinRepository,
	SecurityBoundaryException,
} from "../src/security/repository-boundary.js";
import { WorktreeManager } from "../src/worktree/manager.js";
import { mergeThreadBranch } from "../src/worktree/merge.js";

describe("RepositoryBoundary (Task 0.3a)", () => {
	let repoDir: string;
	let outsideDir: string;

	beforeEach(() => {
		const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "contextos-repo-boundary-"));
		repoDir = path.join(tempBase, "repo");
		outsideDir = path.join(tempBase, "outside");
		fs.mkdirSync(repoDir, { recursive: true });
		fs.mkdirSync(outsideDir, { recursive: true });

		fs.writeFileSync(path.join(repoDir, "README.md"), "# Repo\n");
		fs.mkdirSync(path.join(repoDir, "src"), { recursive: true });
		fs.writeFileSync(path.join(repoDir, "src", "index.ts"), "export {};\n");
		fs.writeFileSync(path.join(outsideDir, "secret.txt"), "TOP_SECRET\n");
	});

	afterEach(() => {
		try {
			const tempBase = path.dirname(repoDir);
			fs.rmSync(tempBase, { recursive: true, force: true });
		} catch {}
	});

	it("allows existing files and directories within the repository", () => {
		const validFile = path.join(repoDir, "src", "index.ts");
		const resolved = assertWithinRepository(validFile, repoDir);
		expect(fs.existsSync(resolved)).toBe(true);

		const validDir = path.join(repoDir, "src");
		expect(isWithinRepository(validDir, repoDir)).toBe(true);
	});

	it("allows relative paths within the repository", () => {
		const resolved = assertWithinRepository("src/index.ts", repoDir);
		expect(resolved).toBe(fs.realpathSync(path.join(repoDir, "src", "index.ts")));
	});

	it("allows uncreated files in existing directories within repository", () => {
		const uncreatedPath = path.join(repoDir, "src", "uncreated-module.ts");
		const resolved = assertWithinRepository(uncreatedPath, repoDir);
		expect(resolved.toLowerCase()).toBe(path.resolve(uncreatedPath).toLowerCase());
		expect(isWithinRepository(uncreatedPath, repoDir)).toBe(true);
	});

	it("allows uncreated deeply-nested files where parent directories do not yet exist", () => {
		const deeplyNested = path.join(repoDir, "new_folder", "sub_folder", "deep.ts");
		const resolved = assertWithinRepository(deeplyNested, repoDir);
		expect(resolved.toLowerCase()).toBe(path.resolve(deeplyNested).toLowerCase());
		expect(isWithinRepository(deeplyNested, repoDir)).toBe(true);
	});

	it("blocks parent traversal attacks (../)", () => {
		const traversalPath = path.join(repoDir, "..", "outside", "secret.txt");
		expect(() => assertWithinRepository(traversalPath, repoDir)).toThrow(SecurityBoundaryException);
		expect(isWithinRepository(traversalPath, repoDir)).toBe(false);

		const relativeTraversal = "../outside/secret.txt";
		expect(() => assertWithinRepository(relativeTraversal, repoDir)).toThrow(SecurityBoundaryException);
	});

	it("blocks sibling-prefix escape attacks (e.g. /repo-sibling)", () => {
		const siblingDir = `${repoDir}-sibling`;
		fs.mkdirSync(siblingDir, { recursive: true });
		fs.writeFileSync(path.join(siblingDir, "evil.txt"), "evil");

		const siblingFile = path.join(siblingDir, "evil.txt");
		expect(() => assertWithinRepository(siblingFile, repoDir)).toThrow(SecurityBoundaryException);
		expect(isWithinRepository(siblingFile, repoDir)).toBe(false);
	});

	it("blocks null bytes in paths", () => {
		expect(() => assertWithinRepository("src/index.ts\0.png", repoDir)).toThrow(SecurityBoundaryException);
	});

	it("blocks UNC network paths", () => {
		expect(() => assertWithinRepository("\\\\attacker-server\\share\\payload.js", repoDir)).toThrow(
			SecurityBoundaryException,
		);
		expect(() => assertWithinRepository("//attacker-server/share/payload.js", repoDir)).toThrow(
			SecurityBoundaryException,
		);
	});

	it("blocks symlinks and directory junctions that point outside the repository", () => {
		const symlinkDir = path.join(repoDir, "external_link");
		try {
			fs.symlinkSync(outsideDir, symlinkDir, process.platform === "win32" ? "junction" : "dir");
		} catch {
			// Skip symlink test if permissions don't allow on this system
			return;
		}

		// Accessing the symlinked folder or a file inside it must throw
		const escapeThroughSymlink = path.join(symlinkDir, "secret.txt");
		expect(() => assertWithinRepository(escapeThroughSymlink, repoDir)).toThrow(SecurityBoundaryException);
		expect(isWithinRepository(escapeThroughSymlink, repoDir)).toBe(false);
	});

	it("normalizes drive letter casing on Windows", () => {
		if (process.platform !== "win32") return;

		const real = fs.realpathSync(path.join(repoDir, "src", "index.ts"));
		const lowerDrive = real.replace(/^[A-Z]:/, (match) => match.toLowerCase());
		const upperDrive = real.replace(/^[a-z]:/, (match) => match.toUpperCase());

		expect(isWithinRepository(lowerDrive, upperDrive)).toBe(true);
		expect(isWithinRepository(upperDrive, lowerDrive)).toBe(true);
	});
});

describe("Universal RepositoryBoundary Wiring (Task 0.3b)", () => {
	let repoDir: string;
	let outsideDir: string;

	beforeEach(() => {
		const tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "contextos-repo-boundary-03b-"));
		repoDir = path.join(tempBase, "repo");
		outsideDir = path.join(tempBase, "outside");
		fs.mkdirSync(repoDir, { recursive: true });
		fs.mkdirSync(outsideDir, { recursive: true });
	});

	afterEach(() => {
		try {
			const tempBase = path.dirname(repoDir);
			fs.rmSync(tempBase, { recursive: true, force: true });
		} catch {}
	});

	it("WorktreeManager constructor blocks escaping baseDir", () => {
		expect(() => new WorktreeManager(repoDir, "../outside/worktrees")).toThrow(SecurityBoundaryException);
		expect(() => new WorktreeManager(repoDir, outsideDir)).toThrow(SecurityBoundaryException);
	});

	it("mergeThreadBranch blocks branch traversal and flag injection", async () => {
		await expect(mergeThreadBranch(repoDir, "../../../outside/branch", "test-thread")).rejects.toThrow(
			SecurityBoundaryException,
		);
		await expect(mergeThreadBranch(repoDir, "--upload-pack=evil", "test-thread")).rejects.toThrow(
			SecurityBoundaryException,
		);
	});

	it("state operations block escaping worktreeBaseDir", () => {
		expect(() => loadPersistedState(repoDir, "../outside/worktrees")).toThrow(SecurityBoundaryException);
	});

	it("scanOrphanWorktrees blocks escaping worktreeBaseDir", async () => {
		await expect(scanOrphanWorktrees(repoDir, "../outside/worktrees")).rejects.toThrow(SecurityBoundaryException);
	});
});
