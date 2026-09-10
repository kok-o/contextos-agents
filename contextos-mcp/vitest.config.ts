import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		testTimeout: 30000,
		hookTimeout: 15000,
		fileParallelism: true,
		maxConcurrency: 4,
		pool: "threads",
	},
});
