import { afterEach, describe, expect, it } from "vitest";
import { NodeVmRepl } from "../src/core/node-repl.js";

const POLLUTION_KEY = "__contextosSecurityProbe";

afterEach(() => {
	Reflect.deleteProperty(Object.prototype, POLLUTION_KEY);
});

describe("deprecated NodeVmRepl security boundary", () => {
	it("does not expose the host process through injected functions", async () => {
		const repl = new NodeVmRepl();

		await expect(repl.execute('print(print.constructor("return process")().versions.node)')).rejects.toThrow(
			"disabled",
		);
	});

	it("does not expose Node built-in modules", async () => {
		const repl = new NodeVmRepl();

		await expect(
			repl.execute('print(print.constructor("return process")().getBuiltinModule("node:child_process"))'),
		).rejects.toThrow("disabled");
	});

	it("cannot mutate host prototypes", async () => {
		const repl = new NodeVmRepl();

		await expect(repl.execute(`Object.prototype.${POLLUTION_KEY} = "polluted"`)).rejects.toThrow("disabled");
		expect(Reflect.get(Object.prototype, POLLUTION_KEY)).toBeUndefined();
	});
});
