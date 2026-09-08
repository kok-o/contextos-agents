import { describe, expect, it } from "vitest";
import { NodeVmRepl } from "../../src/core/node-repl.js";

describe("NodeVmRepl deprecation boundary", () => {
	it("fails closed when callers try to start the runtime", async () => {
		const repl = new NodeVmRepl();

		await expect(repl.start()).rejects.toThrow("NodeVmRepl is disabled");
		expect(repl.isAlive).toBe(false);
	});

	it("never executes supplied source code", async () => {
		const repl = new NodeVmRepl();

		await expect(repl.execute('throw new Error("executed")')).rejects.toThrow("NodeVmRepl is disabled");
	});
});
