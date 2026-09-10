import { describe, expect, it, vi } from "vitest";
import { ActionDispatcher, type ActionHandlers } from "../src/core/action-dispatcher.js";

function createHandlers(): ActionHandlers {
	return {
		spawn: vi.fn(async (action) => ({ threadId: `thread:${action.task}` })),
		wait: vi.fn(async (action) => ({ completed: action.threadIds })),
		inspectDiff: vi.fn(async (action) => ({ diff: action.threadId })),
		review: vi.fn(async (action) => ({ reviewed: action.threadId })),
		merge: vi.fn(async (action) => ({ merged: action.threadId })),
		finish: vi.fn(async (action) => ({ summary: action.summary })),
	};
}

describe("ActionDispatcher", () => {
	it("dispatches a strictly typed spawn action", async () => {
		const handlers = createHandlers();
		const dispatcher = new ActionDispatcher(handlers);

		const result = await dispatcher.dispatch({
			version: 1,
			action: "spawn",
			task: "Harden authentication", writeScope: ["."],
			writeScope: ["src/auth.ts"],
			model: "claude-sonnet-4-6",
		});

		expect(result).toEqual({ threadId: "thread:Harden authentication" });
		expect(handlers.spawn).toHaveBeenCalledOnce();
	});

	it("rejects arbitrary source code", async () => {
		const dispatcher = new ActionDispatcher(createHandlers());

		await expect(dispatcher.dispatch('require("node:child_process")')).rejects.toThrow("Invalid action payload");
	});

	it("rejects unknown actions and unexpected fields", async () => {
		const dispatcher = new ActionDispatcher(createHandlers());

		await expect(dispatcher.dispatch({ version: 1, action: "execute", code: "process.exit()" })).rejects.toThrow(
			"Invalid action payload",
		);
		await expect(
			dispatcher.dispatch({ version: 1, action: "finish", summary: "done", code: "process.exit()" }),
		).rejects.toThrow("Invalid action payload");
	});

	it("rejects traversal and absolute paths in writeScope", async () => {
		const dispatcher = new ActionDispatcher(createHandlers());

		await expect(
			dispatcher.dispatch({ version: 1, action: "spawn", task: "bad", writeScope: ["."], writeScope: ["../outside.ts"] }),
		).rejects.toThrow("Invalid action payload");
		await expect(
			dispatcher.dispatch({ version: 1, action: "spawn", task: "bad", writeScope: ["."], writeScope: ["C:\\outside.ts"] }),
		).rejects.toThrow("Invalid action payload");
	});
});
