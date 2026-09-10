/**
 * Unit test suite for ExecutionSandbox (Milestones W5.3 and W5.4)
 */

import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { ExecutionSandbox } from "../../src/sandbox/execution.js";

describe("Milestone W5.3 & W5.4: Real ExecutionSandbox & OCI Enforcement", () => {
	it("generates hardened container profile arguments (Section 19.2)", () => {
		const sandbox = new ExecutionSandbox({
			image: "node:20-alpine",
			network: "deny",
			limits: { cpus: "1.5", memoryMb: 1024, pidsLimit: 64 },
		});

		const workspace = path.resolve("temp-workspace");
		const args = sandbox.buildContainerArgs(workspace, ["npm", "test"]);

		expect(args).toContain("--read-only");
		expect(args).toContain("--cap-drop=ALL");
		expect(args).toContain("--security-opt=no-new-privileges");
		expect(args).toContain("--user=1000:1000");
		expect(args).toContain("--network=none");
		expect(args).toContain("--cpus=1.5");
		expect(args).toContain("--memory=1024m");
		expect(args).toContain("--pids-limit=64");
		expect(args).toContain("--tmpfs=/tmp:rw,noexec,nosuid,size=64m");
		expect(args).toContain("--tmpfs=/home/sandbox:rw,noexec,nosuid,size=64m");
		expect(args).toContain("HOME=/home/sandbox");
		expect(args).toContain("node:20-alpine");
		expect(args.slice(-2)).toEqual(["npm", "test"]);
	});

	it("enforces fail-closed policy when oci-required and engine is unavailable", () => {
		const sandbox = new ExecutionSandbox({ mode: "oci-required" });

		expect(() => sandbox.planExecution(false)).toThrowError(/OCI sandbox is required by policy/);
		try {
			sandbox.planExecution(false);
		} catch (err: any) {
			expect(err.code).toBe("CTX_SANDBOX_OCI_UNAVAILABLE");
		}

		const planWithEngine = sandbox.planExecution(true);
		expect(planWithEngine.runner).toBe("oci");
		expect(planWithEngine.autoMergeBlocked).toBe(false);
	});

	it("falls back to host-unsafe with autoMergeBlocked in oci-preferred mode without engine", () => {
		const sandbox = new ExecutionSandbox({ mode: "oci-preferred" });
		const plan = sandbox.planExecution(false);

		expect(plan.runner).toBe("host-unsafe");
		expect(plan.autoMergeBlocked).toBe(true);
		expect(plan.warning).toContain("Auto-merge is blocked");
	});

	it("governs auto-merge: permits OCI, blocks host-unsafe by default", () => {
		const sandbox = new ExecutionSandbox();

		// OCI run
		const ociRes = sandbox.canAutoMerge({ runnerMode: "oci" });
		expect(ociRes.allowed).toBe(true);
		expect(ociRes.reasonCode).toBe("OCI_SANDBOX_VERIFIED");

		// Host-unsafe run without override
		const hostBlocked = sandbox.canAutoMerge({ runnerMode: "host-unsafe" });
		expect(hostBlocked.allowed).toBe(false);
		expect(hostBlocked.reasonCode).toBe("HOST_UNSAFE_BLOCKED");

		// Host-unsafe with user-local override
		const hostUserOverride = sandbox.canAutoMerge({
			runnerMode: "host-unsafe",
			userOverride: true,
			isFromRepoConfig: false,
		});
		expect(hostUserOverride.allowed).toBe(true);
		expect(hostUserOverride.reasonCode).toBe("HOST_UNSAFE_EXPLICIT_OVERRIDE");
	});

	it("strictly prohibits repository config from enabling host-unsafe auto-merge override (W5.4)", () => {
		const sandbox = new ExecutionSandbox();

		const repoOverride = sandbox.canAutoMerge({
			runnerMode: "host-unsafe",
			userOverride: true,
			isFromRepoConfig: true,
		});

		expect(repoOverride.allowed).toBe(false);
		expect(repoOverride.reasonCode).toBe("REPO_CONFIG_OVERRIDE_PROHIBITED");
		expect(repoOverride.reason).toContain("Repository configuration cannot enable host-unsafe auto-merge override");
	});

	it("executes command in mock OCI engine and computes verifiable runner evidence (W5.3)", async () => {
		const sandbox = new ExecutionSandbox({
			mode: "oci-required",
			containerEngine: "mock",
			image: "node:20-alpine",
		});

		const res = await sandbox.execute(process.cwd(), ["npm", "test"]);

		expect(res.success).toBe(true);
		expect(res.runnerMode).toBe("oci");
		expect(res.containerEngine).toBe("mock");
		expect(res.autoMergeBlocked).toBe(false);
		expect(res.outputSha256).toBeDefined();
		expect(res.evidence.runnerMode).toBe("oci");
		expect(res.evidence.image).toBe("node:20-alpine");
		expect(res.evidence.imageDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it("supports custom mockExecutor for testing error outcomes and outputs", async () => {
		const sandbox = new ExecutionSandbox({
			mode: "oci-required",
			containerEngine: "mock",
			mockExecutor: async () => ({
				exitCode: 1,
				stdout: "Tests failed with exit 1",
				stderr: "Error: 1 test failed",
			}),
		});

		const res = await sandbox.execute(process.cwd(), ["npm", "test"]);

		expect(res.success).toBe(false);
		expect(res.exitCode).toBe(1);
		expect(res.stdout).toContain("Tests failed");
		expect(res.stderr).toContain("Error: 1 test failed");
		expect(res.outputSha256).toBeDefined();
	});

	it("throws CTX_SANDBOX_DIGEST_MISMATCH fail-closed on image digest mismatch (W5.3)", async () => {
		const sandbox = new ExecutionSandbox({
			mode: "oci-required",
			containerEngine: "mock",
			image: "node:20-alpine",
			expectedImageDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
		});

		await expect(sandbox.execute(process.cwd(), ["npm", "test"])).rejects.toThrowError(/Image digest mismatch/);
	});

	it("detects and blocks adversarial attacks before process spawn", async () => {
		const sandbox = new ExecutionSandbox();

		// Path traversal
		await expect(sandbox.execute("../../etc", ["npm", "test"])).rejects.toThrowError(/Sandbox security violation/);

		// Git hook configuration tampering
		await expect(sandbox.execute(process.cwd(), ["git", "config", "core.hooksPath", "/tmp"])).rejects.toThrowError(
			/Sandbox security violation/,
		);

		// Git global configuration tampering
		await expect(
			sandbox.execute(process.cwd(), ["git", "config", "--global", "user.name", "hacker"]),
		).rejects.toThrowError(/Sandbox security violation/);
	});

	it("redacts sensitive environment tokens and secrets in host-unsafe execution output", async () => {
		const sandbox = new ExecutionSandbox({ mode: "host-unsafe" });

		const res = await sandbox.execute(process.cwd(), ["node", "-e", "console.log('sk-123456789012345678901234')"]);

		expect(res.runnerMode).toBe("host-unsafe");
		expect(res.autoMergeBlocked).toBe(true);
		expect(res.redactedOutput).toContain("[REDACTED_API_KEY]");
		expect(res.redactedOutput).not.toContain("sk-123456789012345678901234");
	});
});
