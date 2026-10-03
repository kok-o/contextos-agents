import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { registerContextosTools } from "../src/mcp/tools/contextos.js";
import { readWorktreeDiff } from "../src/worktree/manager.js";

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

function snapshot(root: string): Record<string, string> {
	const result: Record<string, string> = {};
	function walk(dir: string, prefix = "") {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.name.endsWith(".lock")) continue;
			const rel = prefix + entry.name;
			if (entry.isDirectory()) {
				result[rel + "/"] = "directory";
				walk(join(dir, entry.name), rel + "/");
			} else
				result[rel] = createHash("sha256")
					.update(readFileSync(join(dir, entry.name)))
					.digest("hex");
		}
	}
	walk(root);
	return result;
}

describe("Default MCP inspection", () => {
	it("preserves the Git failure and reports cleanup failure without changing the real index", async () => {
		const root = mkdtempSync(join(tmpdir(), "ctx-inspection-"));
		execFileSync("git", ["init", "--quiet", root]);
		const before = snapshot(root);
		let temporaryPath = "";
		const cleanup = vi.mocked(rmSync).mockImplementationOnce((target) => {
			temporaryPath = String(target);
			throw new Error("fixture cleanup failure");
		});
		try {
			await expect(readWorktreeDiff(root, root)).rejects.toMatchObject({
				errors: [
					expect.objectContaining({ message: expect.stringContaining("git read-tree failed") }),
					expect.objectContaining({ message: "fixture cleanup failure" }),
				],
			});
			expect(snapshot(root)).toEqual(before);
		} finally {
			cleanup.mockReset();
			if (temporaryPath) {
				expect(temporaryPath.startsWith(join(os.tmpdir(), "ctx-diff-"))).toBe(true);
				rmSync(temporaryPath, { recursive: true, force: true });
			}
			expect(root.startsWith(join(tmpdir(), "ctx-inspection-"))).toBe(true);
			rmSync(root, { recursive: true, force: true });
		}
	});
	it("reads tracked and untracked diffs without changing the real Git index", async () => {
		const root = mkdtempSync(join(tmpdir(), "ctx-inspection-"));
		try {
			execFileSync("git", ["init", "--quiet", root]);
			writeFileSync(join(root, "tracked.txt"), "before\n");
			execFileSync("git", ["add", "tracked.txt"], { cwd: root });
			execFileSync(
				"git",
				["-c", "user.name=Audit", "-c", "user.email=audit@example.invalid", "commit", "-qm", "fixture"],
				{ cwd: root },
			);
			writeFileSync(join(root, "tracked.txt"), "after\n");
			writeFileSync(join(root, "untracked.txt"), "new content\n");
			const before = snapshot(root);
			const diff = await readWorktreeDiff(root, root);
			expect(diff).toContain("+after");
			expect(diff).toContain("+new content");
			expect(snapshot(root)).toEqual(before);
		} finally {
			expect(root.startsWith(join(tmpdir(), "ctx-inspection-"))).toBe(true);
			rmSync(root, { recursive: true, force: true });
		}
	});
	for (const persisted of [false, true]) {
		it(`does not mutate repository files (${persisted ? "persisted state" : "empty repository"})`, async () => {
			const root = mkdtempSync(join(tmpdir(), "ctx-inspection-"));
			try {
				execFileSync("git", ["init", "--quiet", root]);
				if (persisted) {
					const state = join(root, ".agents/.contextos/threads");
					mkdirSync(state, { recursive: true });
					writeFileSync(
						join(state, "saved.cjson"),
						JSON.stringify({
							id: "saved",
							status: "completed",
							phase: "completed",
							estimatedCostUsd: 0.25,
							config: { task: "saved task", agent: { backend: "mock", model: "mock" } },
							result: { success: true, estimatedCostUsd: 0.25, usage: { inputTokens: 12, outputTokens: 3 } },
						}),
					);
				}
				const handlers = new Map<string, (args: any) => Promise<any>>();
				const server = {
					registerTool(name: string, _schema: unknown, handler: any) {
						handlers.set(name, handler);
					},
				};
				registerContextosTools(server as any, root);
				const before = snapshot(root);
				const status = await handlers.get("contextos_status")!({});
				const parsed = JSON.parse(status.content[0].text);
				expect(parsed.counts.total).toBe(persisted ? 1 : 0);
				if (persisted) {
					expect(parsed.budget.spent_usd).toBe(0.25);
					expect(parsed.budget.tokens).toEqual({ input: 12, output: 3 });
				}
				await handlers.get("contextos_compare")!({});
				await handlers.get("contextos_diff")!({ thread_id: persisted ? "saved" : "missing" });
				expect(snapshot(root)).toEqual(before);
			} finally {
				expect(root.startsWith(join(tmpdir(), "ctx-inspection-"))).toBe(true);
				rmSync(root, { recursive: true, force: true });
			}
		});
	}
});
