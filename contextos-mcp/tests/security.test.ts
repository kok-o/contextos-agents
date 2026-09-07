import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PythonRepl } from "../src/core/repl.js";
import { filterAllowedPaths, isPathAllowed } from "../src/security/file-policy.js";
import { containsSecrets, isBlockedPath, redactSecrets } from "../src/security/secret-filter.js";
import { WorktreeManager } from "../src/worktree/manager.js";

describe("Security Guardrails", () => {
	describe("File Policy (Containment & Traversal Defense)", () => {
		const worktreeRoot = path.resolve("/app/worktrees/wt-123");

		it("allows valid relative file paths within worktree", () => {
			expect(isPathAllowed("src/index.ts", worktreeRoot)).toBe(true);
			expect(isPathAllowed("components/button.tsx", worktreeRoot)).toBe(true);
			expect(isPathAllowed("package.json", worktreeRoot)).toBe(true);
		});

		it("blocks path traversal attempting to escape worktree root", () => {
			expect(isPathAllowed("../../.env", worktreeRoot)).toBe(false);
			expect(isPathAllowed("../../../etc/passwd", worktreeRoot)).toBe(false);
			expect(isPathAllowed("src/../../outside.txt", worktreeRoot)).toBe(false);
		});

		it("blocks sibling prefix directory bypass", () => {
			// /app/worktrees/wt-123 vs /app/worktrees/wt-1234
			const siblingPath = path.resolve("/app/worktrees/wt-1234/evil.txt");
			expect(isPathAllowed(siblingPath, worktreeRoot)).toBe(false);
		});

		it("blocks forbidden directories (.git, node_modules)", () => {
			expect(isPathAllowed(".git/config", worktreeRoot)).toBe(false);
			expect(isPathAllowed(".git/HEAD", worktreeRoot)).toBe(false);
			expect(isPathAllowed("node_modules/pkg/index.js", worktreeRoot)).toBe(false);
		});

		it("filterAllowedPaths filters out hazardous paths", () => {
			const input = ["src/main.ts", "../../.env", ".git/config", "valid.ts"];
			const filtered = filterAllowedPaths(input, worktreeRoot);
			expect(filtered).toEqual(["src/main.ts", "valid.ts"]);
		});
	});

	describe("Secret Filter", () => {
		it("blocks sensitive configuration and secret filenames", () => {
			expect(isBlockedPath(".env")).toBe(true);
			expect(isBlockedPath(".env.local")).toBe(true);
			expect(isBlockedPath(".env.production")).toBe(true);
			expect(isBlockedPath("credentials.json")).toBe(true);
			expect(isBlockedPath("serviceAccountKey.json")).toBe(true);
		});

		it("blocks sensitive key and certificate extensions", () => {
			expect(isBlockedPath("server.key")).toBe(true);
			expect(isBlockedPath("cert.pem")).toBe(true);
			expect(isBlockedPath("auth.pfx")).toBe(true);
		});

		it("blocks SSH and cloud credentials directories", () => {
			expect(isBlockedPath(path.join(".ssh", "id_rsa"))).toBe(true);
			expect(isBlockedPath(path.join(".aws", "credentials"))).toBe(true);
			expect(isBlockedPath(path.join(".gnupg", "secring.gpg"))).toBe(true);
		});

		it("detects sensitive tokens and API keys in content", () => {
			expect(containsSecrets("OPENAI_API_KEY=sk-1234567890abcdef1234567890abcdef123456")).toBe(true);
			expect(containsSecrets("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
			expect(containsSecrets("export const token = 'ghp_123456789012345678901234567890123456';")).toBe(true);
			expect(
				containsSecrets(
					"export const pat = 'github_pat_11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc';",
				),
			).toBe(true);
			expect(containsSecrets("const npmToken = 'npm_0123456789abcdef0123456789abcdef';")).toBe(true);
		});

		it("blocks credentials files and mixed-slash subpaths", () => {
			expect(isBlockedPath(".npmrc")).toBe(true);
			expect(isBlockedPath(".netrc")).toBe(true);
			expect(isBlockedPath(".git-credentials")).toBe(true);
			expect(isBlockedPath("sub/dir/.npmrc")).toBe(true);
			expect(isBlockedPath("sub/.ssh/id_rsa")).toBe(true);
		});

		it("redacts sensitive content safely", () => {
			const raw = "export const key = 'sk-1234567890abcdef1234567890abcdef123456';";
			const redacted = redactSecrets(raw);
			expect(redacted).not.toContain("sk-1234567890abcdef");
			expect(redacted).toContain("[REDACTED]");
		});
	});

	describe("Worktree Manager Path Traversal Rejection", () => {
		it("rejects malicious threadId containing path traversal characters", async () => {
			const manager = new WorktreeManager(process.cwd());
			await expect(manager.create("../../etc_passwd")).rejects.toThrow(/Invalid threadId/);
			await expect(manager.create("thread/nested/dir")).rejects.toThrow(/Invalid threadId/);
			await expect(manager.create("thread\\backslash")).rejects.toThrow(/Invalid threadId/);
			await expect(manager.create("thread; rm -rf /")).rejects.toThrow(/Invalid threadId/);
		});
	});

	describe("Python Runtime AST Sandbox", () => {
		let repl: PythonRepl | null = null;

		afterEach(() => {
			if (repl?.isAlive) {
				repl.shutdown();
			}
		});

		it("blocks dangerous module imports like os and subprocess", async () => {
			repl = new PythonRepl();
			await repl.start();

			const res1 = await repl.execute("import os");
			expect(res1.stderr).toContain("Security error: import of module 'os' is forbidden in sandboxed runtime");

			const res2 = await repl.execute("import subprocess");
			expect(res2.stderr).toContain("Security error: import of module 'subprocess' is forbidden in sandboxed runtime");

			const res3 = await repl.execute("from socket import socket");
			expect(res3.stderr).toContain("Security error: import from module 'socket' is forbidden in sandboxed runtime");
		});

		it("blocks access to introspection sandbox-escape attributes", async () => {
			repl = new PythonRepl();
			await repl.start();

			const res = await repl.execute("x = ().__class__.__bases__[0].__subclasses__()");
			expect(res.stderr).toContain("Security error: access to dangerous attribute '__subclasses__' is forbidden");
		});

		it("blocks unauthorized builtins like open", async () => {
			repl = new PythonRepl();
			await repl.start();

			const res = await repl.execute("f = open('test.txt', 'w')");
			expect(res.stderr).toContain("NameError: name 'open' is not defined");
		});

		it("allows authorized safe operations in sandbox", async () => {
			repl = new PythonRepl();
			await repl.start();

			const res = await repl.execute("import math\nprint(math.sqrt(16))\nFINAL('computed')");
			expect(res.stdout).toContain("4.0");
			expect(res.hasFinal).toBe(true);
			expect(res.finalValue).toBe("computed");
		});

		it("blocks dangerous asyncio subprocess and network attributes", async () => {
			repl = new PythonRepl();
			await repl.start();

			const res1 = await repl.execute("asyncio.create_subprocess_shell('whoami')");
			expect(res1.stderr).toContain(
				"Security error: access to dangerous attribute 'create_subprocess_shell' is forbidden",
			);

			const res2 = await repl.execute("asyncio.open_connection('attacker.com', 80)");
			expect(res2.stderr).toContain("Security error: access to dangerous attribute 'open_connection' is forbidden");
		});
	});
});
