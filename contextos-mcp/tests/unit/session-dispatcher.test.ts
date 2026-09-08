import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ActionDispatcher } from "../../src/core/action-dispatcher.js";
import { cleanupSession, getSession } from "../../src/mcp/session.js";

describe("SwarmSession ActionDispatcher wiring (Task 0.2c)", () => {
	let testDir: string;

	beforeEach(() => {
		testDir = fs.mkdtempSync(path.join(os.tmpdir(), "contextos-session-dispatcher-test-"));
		execFileSync("git", ["init"], { cwd: testDir, stdio: "ignore" });
		execFileSync("git", ["config", "user.name", "Test Runner"], { cwd: testDir, stdio: "ignore" });
		execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: testDir, stdio: "ignore" });
		fs.writeFileSync(path.join(testDir, "README.md"), "# Test\n");
		execFileSync("git", ["add", "."], { cwd: testDir, stdio: "ignore" });
		execFileSync("git", ["commit", "-m", "Initial commit"], { cwd: testDir, stdio: "ignore" });
	});

	afterEach(async () => {
		await cleanupSession(testDir);
		try {
			fs.rmSync(testDir, { recursive: true, force: true });
		} catch {}
	});

	it("initializes an ActionDispatcher on the session and dispatches valid actions", async () => {
		const session = await getSession(testDir);
		expect(session.dispatcher).toBeInstanceOf(ActionDispatcher);

		const finishResult = await session.dispatcher!.dispatch({
			version: 1,
			action: "finish",
			summary: "All subagent tasks finished successfully",
		});

		expect(finishResult).toEqual({
			finished: true,
			summary: "All subagent tasks finished successfully",
		});

		const waitResult = await session.dispatcher!.dispatch({
			version: 1,
			action: "wait",
			threadIds: ["non_existent_thread"],
		});

		expect(waitResult).toEqual({
			threads: [],
		});
	});

	it("rejects non-declarative action payloads", async () => {
		const session = await getSession(testDir);

		await expect(
			session.dispatcher!.dispatch('eval("process.exit(1)")'),
		).rejects.toThrow("Invalid action payload");
	});
});
