import { recordAsyncTask, recordThreadState } from "../../src/mcp/state.ts";

const dir = process.argv[2];
recordThreadState(dir, {
	id: "crashed-thread-1",
	config: {
		id: "crashed-thread-1",
		task: "Recovery fixture",
		writeScope: ["src"],
		context: "",
		agent: { backend: "mock", model: "fixture" },
	},
	status: "running",
	phase: "agent_running",
	attempt: 1,
	maxAttempts: 1,
	estimatedCostUsd: 0.125,
	startedAt: Date.now(),
});
recordAsyncTask(dir, { taskId: "task-1", agentCount: 1, startedAt: Date.now(), status: "running" });
process.send?.("durable-state-ready");
setInterval(() => {}, 1000);
