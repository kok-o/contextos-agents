import { describe, expect, it } from "vitest";
import { NodeVmRepl } from "../../src/core/node-repl.js";

describe("NodeVmRepl (Native V8 Sandbox)", () => {
	it("initializes and reports isAlive correctly", async () => {
		const repl = new NodeVmRepl();
		expect(repl.isAlive).toBe(false);
		expect(repl.getLanguage()).toBe("javascript");

		await repl.start();
		expect(repl.isAlive).toBe(true);

		repl.shutdown();
		expect(repl.isAlive).toBe(false);
	});

	it("executes basic code and captures stdout via print and console.log", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		const res = await repl.execute(`
			print("Hello from print");
			console.log("Hello from console.log");
		`);

		expect(res.stderr).toBe("");
		expect(res.stdout).toContain("Hello from print");
		expect(res.stdout).toContain("Hello from console.log");
		expect(res.hasFinal).toBe(false);

		repl.shutdown();
	});

	it("persists global variables across multiple execute() calls", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		await repl.execute(`
			const factor = 10;
			var base = 5;
		`);

		const res = await repl.execute(`
			print("Result:", factor * base);
		`);

		expect(res.stdout).toContain("Result: 50");
		repl.shutdown();
	});

	it("injects context and allows string operations", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		await repl.setContext("function add(a, b) { return a + b; }");

		const res = await repl.execute(`
			print("Length:", context.length);
			print("Has add:", context.includes("add"));
		`);

		expect(res.stdout).toContain("Length: 36");
		expect(res.stdout).toContain("Has add: true");

		repl.shutdown();
	});

	it("captures FINAL() and FINAL_VAR() termination sentinels", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		const res1 = await repl.execute(`
			const answer = { status: "success", count: 3 };
			FINAL(answer);
		`);

		expect(res1.hasFinal).toBe(true);
		expect(res1.finalValue).toContain('"status":"success"');

		await repl.resetFinal();
		const res2 = await repl.execute(`print("Continuing...");`);
		expect(res2.hasFinal).toBe(false);
		expect(res2.finalValue).toBeNull();

		repl.shutdown();
	});

	it("handles markdown code fence stripping automatically", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		const markdownSnippet = "```javascript\nprint('fenced output');\nFINAL('done');\n```";
		const res = await repl.execute(markdownSnippet);

		expect(res.stdout).toContain("fenced output");
		expect(res.hasFinal).toBe(true);
		expect(res.finalValue).toBe("done");

		repl.shutdown();
	});

	it("invokes registered thread and merge handlers asynchronously", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		let threadCalledWith: any = null;
		repl.setThreadHandler(async (task, ctx, agent, model, files) => {
			threadCalledWith = { task, ctx, agent, model, files };
			return {
				result: "thread output completed",
				success: true,
				filesChanged: ["src/auth.ts"],
				durationMs: 42,
			};
		});

		let mergeCalled = false;
		repl.setMergeHandler(async () => {
			mergeCalled = true;
			return { result: "merged", success: true };
		});

		const res = await repl.execute(`
			const tr = await thread({
				task: "Refactor auth",
				context: "test context",
				agent: "opencode",
				model: "gemini-3.8-flash",
				files: ["src/auth.ts"]
			});
			print("Thread result:", tr.result);

			const mr = await merge_threads();
			print("Merge result:", mr.success);
			FINAL("orchestration completed");
		`);

		expect(res.stdout).toContain("Thread result: thread output completed");
		expect(res.stdout).toContain("Merge result: true");
		expect(threadCalledWith.task).toBe("Refactor auth");
		expect(threadCalledWith.files).toEqual(["src/auth.ts"]);
		expect(mergeCalled).toBe(true);
		expect(res.hasFinal).toBe(true);

		repl.shutdown();
	});

	it("invokes registered llm_query handler asynchronously", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		repl.setLlmQueryHandler(async (subCtx, instruction) => {
			return `Summary of [${subCtx}] based on [${instruction}]`;
		});

		const res = await repl.execute(`
			const summary = await llm_query("raw text", "summarize");
			print("LLM:", summary);
		`);

		expect(res.stdout).toContain("LLM: Summary of [raw text] based on [summarize]");
		repl.shutdown();
	});

	it("enforces sandbox security (process and require are undefined)", async () => {
		const repl = new NodeVmRepl();
		await repl.start();

		const res = await repl.execute(`
			print("has process:", typeof process !== "undefined");
			print("has require:", typeof require !== "undefined");
		`);

		expect(res.stdout).toContain("has process: false");
		expect(res.stdout).toContain("has require: false");

		repl.shutdown();
	});

	it("enforces timeout on infinite loops", async () => {
		// Short timeout for test
		const repl = new NodeVmRepl(300);
		await repl.start();

		const res = await repl.execute(`
			while (true) {}
		`);

		expect(res.stderr).toContain("timed out");
		repl.shutdown();
	});
});
