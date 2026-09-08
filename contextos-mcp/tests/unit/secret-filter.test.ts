import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { containsSecrets, isBlockedPath, redactSecrets } from "../../src/security/secret-filter.js";

describe("Task 0.6: Universal Secret Redaction & Sensitive-Path Denylist", () => {
	describe("Sensitive-Path Denylist (Default-Deny)", () => {
		it("blocks all .env variants", () => {
			expect(isBlockedPath(".env")).toBe(true);
			expect(isBlockedPath(".env.local")).toBe(true);
			expect(isBlockedPath(".env.production")).toBe(true);
			expect(isBlockedPath(".env.staging")).toBe(true);
			expect(isBlockedPath(".env.custom_env")).toBe(true);
			expect(isBlockedPath("config/.env.prod")).toBe(true);
			expect(isBlockedPath("sub/dir/app.env")).toBe(true);
		});

		it("blocks credentials, keyrings, and token files", () => {
			expect(isBlockedPath("credentials")).toBe(true);
			expect(isBlockedPath("credentials.json")).toBe(true);
			expect(isBlockedPath("service-account.json")).toBe(true);
			expect(isBlockedPath("serviceAccountKey.json")).toBe(true);
			expect(isBlockedPath(".netrc")).toBe(true);
			expect(isBlockedPath(".git-credentials")).toBe(true);
			expect(isBlockedPath(".npmrc")).toBe(true);
			expect(isBlockedPath(".pypirc")).toBe(true);
		});

		it("blocks private key files and certificates", () => {
			expect(isBlockedPath("id_rsa")).toBe(true);
			expect(isBlockedPath("id_ed25519")).toBe(true);
			expect(isBlockedPath("id_ecdsa")).toBe(true);
			expect(isBlockedPath("server.key")).toBe(true);
			expect(isBlockedPath("cert.pem")).toBe(true);
			expect(isBlockedPath("bundle.pfx")).toBe(true);
			expect(isBlockedPath("keystore.p12")).toBe(true);
			expect(isBlockedPath("custom.jks")).toBe(true);
			// Public keys are not secrets
			expect(isBlockedPath("id_rsa.pub")).toBe(false);
			expect(isBlockedPath("id_ed25519.pub")).toBe(false);
		});

		it("blocks sensitive credential directories", () => {
			expect(isBlockedPath(".ssh/config")).toBe(true);
			expect(isBlockedPath(".aws/credentials")).toBe(true);
			expect(isBlockedPath(".azure/tokens.json")).toBe(true);
			expect(isBlockedPath(".kube/config")).toBe(true);
			expect(isBlockedPath(".gnupg/trustdb.gpg")).toBe(true);
			expect(isBlockedPath(path.join("home", "user", ".ssh", "known_hosts"))).toBe(true);
		});

		it("allows standard source code files", () => {
			expect(isBlockedPath("src/index.ts")).toBe(false);
			expect(isBlockedPath("package.json")).toBe(false);
			expect(isBlockedPath("README.md")).toBe(false);
			expect(isBlockedPath("src/environment.ts")).toBe(false);
			expect(isBlockedPath("tests/env.test.ts")).toBe(false);
		});
	});

	describe("Harden Regex Patterns & Pattern-Specific Redaction", () => {
		it("redacts AWS access keys with [REDACTED:AWS_KEY]", () => {
			const text = "AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE";
			const redacted = redactSecrets(text);
			expect(redacted).toContain("[REDACTED:AWS_KEY]");
			expect(redacted).not.toContain("AKIAIOSFODNN7EXAMPLE");
			expect(containsSecrets(text)).toBe(true);
		});

		it("redacts GitHub PATs with [REDACTED:GITHUB_PAT]", () => {
			const ghp = "ghp_123456789012345678901234567890123456";
			const redacted = redactSecrets(`const token = "${ghp}";`);
			expect(redacted).toContain("[REDACTED:GITHUB_PAT]");
			expect(redacted).not.toContain(ghp);
			expect(containsSecrets(ghp)).toBe(true);
		});

		it("redacts GitHub fine-grained PATs with [REDACTED:GITHUB_FINE_GRAINED_PAT]", () => {
			const pat = "github_pat_11AAAAAAA0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";
			const redacted = redactSecrets(`Authorization: Bearer ${pat}`);
			expect(redacted).toContain("[REDACTED:GITHUB_FINE_GRAINED_PAT]");
			expect(redacted).not.toContain(pat);
			expect(containsSecrets(pat)).toBe(true);
		});

		it("redacts Slack tokens with [REDACTED:SLACK_TOKEN]", () => {
			const slack = ["xoxb", "123456789012", "1234567890123", "4jc92kd84hfnkdlsk4hf73kd"].join("-");
			const redacted = redactSecrets(`slack_bot_token: "${slack}"`);
			expect(redacted).toContain("[REDACTED:SLACK_TOKEN]");
			expect(redacted).not.toContain(slack);
			expect(containsSecrets(slack)).toBe(true);
		});

		it("redacts JWT tokens with [REDACTED:JWT_TOKEN]", () => {
			const jwt =
				"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
			const redacted = redactSecrets(`jwt_token = "${jwt}"`);
			expect(redacted).toContain("[REDACTED:JWT_TOKEN]");
			expect(redacted).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
			expect(containsSecrets(jwt)).toBe(true);
		});

		it("redacts Private Keys with [REDACTED:PRIVATE_KEY]", () => {
			const pk = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Y...\n-----END RSA PRIVATE KEY-----";
			const redacted = redactSecrets(pk);
			expect(redacted).toContain("[REDACTED:PRIVATE_KEY]");
			expect(redacted).not.toContain("MIIEowIBAAKCAQEA0Y");
			expect(containsSecrets(pk)).toBe(true);
		});

		it("redacts generic API key / secret key assignments", () => {
			const generic = "API_KEY = 'abcedf0123456789abcdef0123456789'";
			const redacted = redactSecrets(generic);
			expect(redacted).toContain("[REDACTED:");
			expect(redacted).not.toContain("abcedf0123456789abcdef0123456789");
			expect(containsSecrets(generic)).toBe(true);
		});
	});
});
