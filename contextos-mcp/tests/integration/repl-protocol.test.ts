/**
 * Integration tests for the PythonRepl JSON protocol.
 *
 * Spawns a real Python subprocess running runtime.py and exercises
 * the line-delimited JSON protocol: exec, FINAL, context, errors, shutdown.
 *
 * Requires Python 3 to be installed; skips gracefully if unavailable.
 */

import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { PythonRepl } from "../../src/core/repl.js";

// ── Python availability check ────────────────────────────────────────────────

let hasPython = false;
try {
	execFileSync("python3", ["--version"], { stdio: "pipe" });
	hasPython = true;
} catch {
	// python3 not available
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(!hasPython)("PythonRepl protocol", { timeout: 15000 }, () => {
	let repl: PythonRepl;

	afterEach(() => {
		// Ensure the REPL is shut down after each test to avoid zombie processes
		if (repl?.isAlive) {
			repl.shutdown();
		}
	});

	// ── 1. Startup ──────────────────────────────────────────────────────────

	it("start() succeeds and isAlive is true", async () => {
		repl = new PythonRepl();
		await repl.start();
		expect(repl.isAlive).toBe(true);
	});

	// ── 2. Simple execution ─────────────────────────────────────────────────

	it("execute('print(\"hello\")') returns stdout with hello", async () => {
		repl = new PythonRepl();
		await repl.start();

		const result = await repl.execute('print("hello")');
		expect(result.stdout).toBe("hello\n");
		expect(result.stderr).toBe("");
		expect(result.hasFinal).toBe(false);
		expect(result.finalValue).toBeNull();
	});

	// ── 3. FINAL detection ──────────────────────────────────────────────────

	it('execute(\'FINAL("done")\') returns hasFinal=true, finalValue="done"', async () => {
		repl = new PythonRepl();
		await repl.start();

		const result = await repl.execute('FINAL("done")');
		expect(result.hasFinal).toBe(true);
		expect(result.finalValue).toBe("done");
	});

	// ── 4. Context setting ──────────────────────────────────────────────────

	it("setContext sets context, then execute can read it", async () => {
		repl = new PythonRepl();
		await repl.start();

		await repl.setContext("test data");

		const result = await repl.execute("print(context)");
		expect(result.stdout).toBe("test data\n");
	});

	// ── 5. Variable persistence ─────────────────────────────────────────────

	it("variables persist across execute calls", async () => {
		repl = new PythonRepl();
		await repl.start();

		await repl.execute("x = 42");

		const result = await repl.execute("print(x)");
		expect(result.stdout).toBe("42\n");
	});

	// ── 6. Syntax error ─────────────────────────────────────────────────────

	it("execute('def') returns stderr with SyntaxError", async () => {
		repl = new PythonRepl();
		await repl.start();

		const result = await repl.execute("def");
		expect(result.stderr).toContain("SyntaxError");
		expect(result.hasFinal).toBe(false);
	});

	// ── 7. Runtime error ────────────────────────────────────────────────────

	it("execute('1/0') returns stderr with ZeroDivisionError", async () => {
		repl = new PythonRepl();
		await repl.start();

		const result = await repl.execute("1/0");
		expect(result.stderr).toContain("ZeroDivisionError");
		expect(result.hasFinal).toBe(false);
	});

	// ── 8. Shutdown ─────────────────────────────────────────────────────────

	it("shutdown() sets isAlive to false", async () => {
		repl = new PythonRepl();
		await repl.start();
		expect(repl.isAlive).toBe(true);

		repl.shutdown();

		// Give the process a moment to exit
		await new Promise((r) => setTimeout(r, 200));
		expect(repl.isAlive).toBe(false);
	});

	// ── 9. resetFinal ───────────────────────────────────────────────────────

	it("resetFinal clears the FINAL sentinel so hasFinal becomes false", async () => {
		repl = new PythonRepl();
		await repl.start();

		// Set FINAL
		const first = await repl.execute('FINAL("first answer")');
		expect(first.hasFinal).toBe(true);
		expect(first.finalValue).toBe("first answer");

		// Reset it
		await repl.resetFinal();

		// Now execute something neutral — FINAL should be cleared
		const after = await repl.execute("print('after reset')");
		expect(after.hasFinal).toBe(false);
		expect(after.finalValue).toBeNull();
		expect(after.stdout).toBe("after reset\n");
	});

	// ── 10. Multi-line code execution ───────────────────────────────────────

	it("handles multi-line code blocks", async () => {
		repl = new PythonRepl();
		await repl.start();

		const code = ["total = 0", "for i in range(5):", "    total += i", "print(total)"].join("\n");

		const result = await repl.execute(code);
		expect(result.stdout).toBe("10\n");
		expect(result.stderr).toBe("");
	});

	// ── 11. FINAL with numeric value ────────────────────────────────────────

	it("FINAL converts non-string values to string", async () => {
		repl = new PythonRepl();
		await repl.start();

		const result = await repl.execute("FINAL(42)");
		expect(result.hasFinal).toBe(true);
		expect(result.finalValue).toBe("42");
	});

	// ── 12. Error does not corrupt state ────────────────────────────────────

	it("REPL recovers after an error and continues working", async () => {
		repl = new PythonRepl();
		await repl.start();

		// Cause an error
		const errResult = await repl.execute("undefined_var");
		expect(errResult.stderr).toContain("NameError");

		// Should still work after error
		const okResult = await repl.execute("print('recovered')");
		expect(okResult.stdout).toBe("recovered\n");
		expect(okResult.stderr).toBe("");
	});

	// ── 13. Abort signal triggers shutdown ──────────────────────────────────

	it("aborting the signal after start shuts down the REPL", async () => {
		const repl2 = new PythonRepl();
		const ac = new AbortController();

		await repl2.start(ac.signal);
		expect(repl2.isAlive).toBe(true);

		// Abort the signal — should trigger shutdown
		ac.abort();

		// Give the process time to exit
		await new Promise((r) => setTimeout(r, 500));
		expect(repl2.isAlive).toBe(false);
	});
});
