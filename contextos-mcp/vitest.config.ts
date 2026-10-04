import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 60000,
		hookTimeout: 30000,
		fileParallelism: true,
		maxWorkers: 2,
		maxConcurrency: 4,
		pool: "threads",
	},
});
