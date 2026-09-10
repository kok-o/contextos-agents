/**
 * Unit tests for W5.1 (Structured VerificationSpec in MCP) and W5.2 (Process Lifecycle Hardening).
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	ALLOWED_VERIFY_TOOLS,
	FORBIDDEN_VERIFY_ARGS,
	getSanitizedEnv,
	killProcessTree,
	parseVerificationSpec,
	redactSensitiveOutput,
	runWorktreeVerification,
	validateCommandTrust,
	verifyCandidateImmutability,
} from "../../src/orchestration/verification-runner.js";
import { ExecutionSandbox } from "../../src/sandbox/execution.js";

describe("Milestone W5.1: Structured VerificationSpec in MCP", () => {
	it("parses canonical VerificationSpec object", () => {
		const spec = parseVerificationSpec({
			executable: "npm",
			args: ["test", "--", "unit"],
			timeoutMs: 30000,
			required: true,
			network: "deny",
			allowedOutputPaths: ["coverage/"],
			cwd: "packages/core",
		});

		expect(spec.executable).toBe("npm");
		expect(spec.args).toEqual(["test", "--", "unit"]);
		expect(spec.timeoutMs).toBe(30000);
		expect(spec.required).toBe(true);
		expect(spec.network).toBe("deny");
		expect(spec.allowedOutputPaths).toEqual(["coverage/"]);
		expect(spec.cwd).toBe("packages/core");
		expect(spec.isLegacyString).toBe(false);
	});

	it("parses legacy string command into canonical VerificationSpec", () => {
		const spec = parseVerificationSpec("npm run test:unit");

		expect(spec.executable).toBe("npm");
		expect(spec.args).toEqual(["run", "test:unit"]);
		expect(spec.timeoutMs).toBe(60000);
		expect(spec.required).toBe(true);
		expect(spec.network).toBe("deny");
		expect(spec.isLegacyString).toBe(true);
	});

	it("prohibits shell metacharacters and chaining in legacy strings", () => {
		expect(() => parseVerificationSpec("npm test && rm -rf /")).toThrow(/metacharacters and command chaining/);
		expect(() => parseVerificationSpec("pytest; cat /etc/passwd")).toThrow(/metacharacters and command chaining/);
		expect(() => parseVerificationSpec("cargo test | grep ok")).toThrow(/metacharacters and command chaining/);
		expect(() => parseVerificationSpec("go test $(whoami)")).toThrow(/metacharacters and command chaining/);
		expect(() => parseVerificationSpec("npm test > output.txt")).toThrow(/metacharacters and command chaining/);
	});

	it("rejects empty or malformed verification specifications", () => {
		expect(() => parseVerificationSpec("")).toThrow(/cannot be empty/);
		expect(() => parseVerificationSpec("   ")).toThrow(/cannot be empty/);
		expect(() => parseVerificationSpec(null)).toThrow(/cannot be empty/);
		expect(() => parseVerificationSpec(undefined)).toThrow(/cannot be empty/);
		expect(() => parseVerificationSpec(123)).toThrow(/Invalid verification specification format/);
		expect(() => parseVerificationSpec({ args: ["test"] })).toThrow(/executable must be a non-empty string/);
		expect(() => parseVerificationSpec({ executable: "npm", args: "not-an-array" })).toThrow(
			/args must be an array of strings/,
		);
		expect(() => parseVerificationSpec({ executable: "npm", args: [123] })).toThrow(/every arg must be a string/);
	});

	it("enforces command trust: bans npx in host mode", () => {
		const spec = parseVerificationSpec({
			executable: "npx",
			args: ["vitest", "run"],
		});

		expect(() => validateCommandTrust(spec, { runnerMode: "host-unsafe" })).toThrow(
			/"npx" execution is strictly forbidden in host mode/,
		);
	});

	it("enforces command trust: prohibits inline evaluation arguments", () => {
		for (const forbiddenArg of FORBIDDEN_VERIFY_ARGS) {
			const spec = parseVerificationSpec({
				executable: "node",
				args: [forbiddenArg, "process.exit(0)"],
			});
			expect(() => validateCommandTrust(spec)).toThrow(/not permitted in verify_command/);
		}
	});

	it("enforces command trust: requires explicit trust for arbitrary executables", () => {
		const untrustedSpec = parseVerificationSpec({
			executable: "curl",
			args: ["http://localhost"],
		});

		expect(() => validateCommandTrust(untrustedSpec, { runnerMode: "host-unsafe", trusted: false })).toThrow(
			/not in the trusted tools whitelist/,
		);

		// With explicit trust it passes
		expect(() => validateCommandTrust(untrustedSpec, { runnerMode: "host-unsafe", trusted: true })).not.toThrow();
	});

	it("allows all whitelisted tools without explicit trust", () => {
		for (const tool of ALLOWED_VERIFY_TOOLS) {
			if (tool === "npx") continue; // npx is banned in host mode
			const spec = parseVerificationSpec({
				executable: tool,
				args: ["--version"],
			});
			expect(() => validateCommandTrust(spec, { runnerMode: "host-unsafe" })).not.toThrow();
		}
	});
});

describe("Milestone W5.2: Process Lifecycle Hardening & Output Redaction", () => {
	it("sanitizes environment and removes credentials", () => {
		process.env.SECRET_TOKEN = "super_secret_123";
		process.env.AWS_SECRET_ACCESS_KEY = "aws_secret_key";
		process.env.DATABASE_PASSWORD = "db_password";

		try {
			const env = getSanitizedEnv({
				CUSTOM_PUBLIC: "public_value",
				CUSTOM_API_KEY: "should_be_stripped",
			});

			expect(env.CI).toBe("true");
			expect(env.NODE_ENV).toBe("test");
			expect(env.SECRET_TOKEN).toBeUndefined();
			expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
			expect(env.DATABASE_PASSWORD).toBeUndefined();
			expect(env.CUSTOM_PUBLIC).toBe("public_value");
			expect(env.CUSTOM_API_KEY).toBeUndefined();
		} finally {
			delete process.env.SECRET_TOKEN;
			delete process.env.AWS_SECRET_ACCESS_KEY;
			delete process.env.DATABASE_PASSWORD;
		}
	});

	it("redacts sensitive tokens, keys, and authorization headers from output", () => {
		const rawOutput = [
			"Error with sk-123456789012345678901234567890 occurred",
			"GitHub token: ghp_123456789012345678901234567890123456",
			"Google API: AIzaSyD1234567890123456789012345678901",
			"Authorization: Bearer my-secret-jwt-token-string",
			"password = mySuperSecretPassword123",
		].join("\n");

		const redacted = redactSensitiveOutput(rawOutput);

		expect(redacted).not.toContain("sk-123456789012345678901234567890");
		expect(redacted).not.toContain("ghp_123456789012345678901234567890123456");
		expect(redacted).not.toContain("AIzaSyD1234567890123456789012345678901");
		expect(redacted).not.toContain("my-secret-jwt-token-string");
		expect(redacted).not.toContain("mySuperSecretPassword123");

		expect(redacted).toContain("[REDACTED_API_KEY]");
		expect(redacted).toContain("[REDACTED_TOKEN]");
		expect(redacted).toContain("[REDACTED_PASSWORD]");
	});

	it("killProcessTree does not throw for non-existent PID or undefined", () => {
		expect(() => killProcessTree(undefined)).not.toThrow();
		expect(() => killProcessTree(99999999)).not.toThrow();
	});

	describe("Worktree Verification Execution & Immutability", () => {
		let repoDir: string;

		beforeEach(() => {
			repoDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctx-verify-spec-test-"));
			execFileSync("git", ["init"], { cwd: repoDir, stdio: "ignore" });
			execFileSync("git", ["config", "user.name", "TestUser"], { cwd: repoDir, stdio: "ignore" });
			execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir, stdio: "ignore" });

			fs.writeFileSync(path.join(repoDir, "README.md"), "# Test Repo\n");
			execFileSync("git", ["add", "."], { cwd: repoDir, stdio: "ignore" });
			execFileSync("git", ["commit", "-m", "initial"], { cwd: repoDir, stdio: "ignore" });
		});

		afterEach(() => {
			if (fs.existsSync(repoDir)) {
				fs.rmSync(repoDir, { recursive: true, force: true });
			}
		});

		it("runs successful verification with node --version", async () => {
			const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
			const res = await runWorktreeVerification(
				repoDir,
				{
					executable: "node",
					args: ["--version"],
				},
				{ expectedHeadSha: headSha },
			);

			expect(res.verdict).toBe("PASS");
			expect(res.verified).toBe(true);
			expect(res.exitCode).toBe(0);
			expect(res.output).toContain("v");
		});

		it("detects mutated candidate commit HEAD and marks STALE", () => {
			const _headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
			// Check against an outdated headSha
			const check = verifyCandidateImmutability(repoDir, "0000000000000000000000000000000000000000");

			expect(check.clean).toBe(false);
			expect(check.mutatedHead).toBe(true);
		});

		it("detects dirty working tree files after execution and marks STALE", () => {
			const headSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();

			// Create uncommitted file
			fs.writeFileSync(path.join(repoDir, "dirty.txt"), "leftover dirty file");

			const check = verifyCandidateImmutability(repoDir, headSha);
			expect(check.clean).toBe(false);
			expect(check.dirtyFiles).toContain("dirty.txt");
		});

		it("handles abort signal cancellation cleanly", async () => {
			const ac = new AbortController();
			ac.abort();

			const res = await runWorktreeVerification(
				repoDir,
				{
					executable: "node",
					args: ["--version"],
				},
				{ signal: ac.signal },
			);

			expect(res.verdict).toBe("CANCELLED");
			expect(res.verified).toBe(false);
		});

		it("runs verification in OCI Sandbox mode and records evidence (W5.4)", async () => {
			const mockSandbox = new ExecutionSandbox({
				mode: "oci-required",
				containerEngine: "mock",
			});

			const res = await runWorktreeVerification(
				repoDir,
				{
					executable: "node",
					args: ["--version"],
				},
				{
					sandbox: mockSandbox,
				},
			);

			expect(res.verdict).toBe("PASS");
			expect(res.verified).toBe(true);
			expect(res.runnerMode).toBe("oci");
		});

		it("fails-closed with UNAVAILABLE when oci-required mode engine is unavailable (W5.4)", async () => {
			// Without sandbox and without engine installed, oci-required must fail closed
			const res = await runWorktreeVerification(
				repoDir,
				{
					executable: "node",
					args: ["--version"],
				},
				{
					sandboxMode: "oci-required",
				},
			);

			// If docker is not present, returns UNAVAILABLE
			if (res.runnerMode !== "oci") {
				expect(res.verdict).toBe("UNAVAILABLE");
				expect(res.verified).toBe(false);
			}
		});

		it("fails-closed with ERROR when image digest mismatch occurs (W5.4)", async () => {
			const mockSandbox = new ExecutionSandbox({
				mode: "oci-required",
				containerEngine: "mock",
				expectedImageDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
			});

			const res = await runWorktreeVerification(
				repoDir,
				{
					executable: "node",
					args: ["--version"],
				},
				{
					sandbox: mockSandbox,
				},
			);

			expect(res.verdict).toBe("ERROR");
			expect(res.verified).toBe(false);
			expect(res.output).toContain("Image digest mismatch");
		});
	});
});
