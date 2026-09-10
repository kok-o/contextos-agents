/**
 * Unit tests for ContextOS Plugin Supply Chain & MCP PluginLoader
 * Wave 6 & ADR-002 Compliance
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { THREAT_CODES } from "../../src/plugins/core/types.js";
import { PluginLoader } from "../../src/plugins/loader.js";

function createTempDir(prefix = "vitest-supply-"): string {
	return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("W6.1: Source Grammar and Pinning", () => {
	it("accepts exact 40-char commit SHA for GitHub", () => {
		const res = PluginLoader.validateSource({
			type: "github",
			owner: "acme",
			repo: "test-skill",
			commit: "0123456789abcdef0123456789abcdef01234567",
		});
		expect(res.valid).toBe(true);
	});

	it("blocks floating branch or tag on GitHub without allowFloating", () => {
		const res = PluginLoader.validateSource({
			type: "github",
			owner: "acme",
			repo: "test-skill",
			commit: "main",
		});
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.FLOATING_SOURCE_BLOCKED);

		const allowed = PluginLoader.validateSource(
			{
				type: "github",
				owner: "acme",
				repo: "test-skill",
				commit: "main",
			},
			{ allowFloating: true },
		);
		expect(allowed.valid).toBe(true);
	});

	it("accepts exact semver and integrity for npm", () => {
		const res = PluginLoader.validateSource({
			type: "npm",
			package: "contextos-skill-docker",
			version: "1.2.3",
			integrity: "sha512-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
		});
		expect(res.valid).toBe(true);
	});

	it("rejects ranges, tags, latest, or invalid semver for npm", () => {
		for (const badVersion of ["latest", "^1.0.0", "~1.2.0", ">1.0", "*", "1.x"]) {
			const res = PluginLoader.validateSource({
				type: "npm",
				package: "contextos-skill-docker",
				version: badVersion,
				integrity: "sha512-abcdef==",
			});
			expect(res.valid).toBe(false);
			expect(res.code).toBe(THREAT_CODES.IMPLICIT_LATEST_BLOCKED);
		}
	});

	it("rejects npm package missing sha512 integrity", () => {
		const res = PluginLoader.validateSource({
			type: "npm",
			package: "contextos-skill-docker",
			version: "1.0.0",
		});
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.MISSING_INTEGRITY);
	});

	it("fails closed on unknown source type", () => {
		const res = PluginLoader.validateSource({
			type: "s3-bucket",
			url: "https://s3.amazonaws.com/skill.zip",
		} as any);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.UNKNOWN_SOURCE_TYPE);
	});
});

describe("W6.2: Archive Validation & Scanner", () => {
	it("accepts clean archive entries", () => {
		const res = PluginLoader.validateArchive([
			{ path: "SKILL.md", size: 1024 },
			{ path: "references/guide.md", size: 2048 },
		]);
		expect(res.valid).toBe(true);
	});

	it("rejects path traversal in archive", () => {
		const res = PluginLoader.validateArchive([{ path: "../../etc/shadow", size: 100 }]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.PATH_TRAVERSAL);
	});

	it("rejects absolute paths in archive", () => {
		const res = PluginLoader.validateArchive([{ path: "/usr/bin/evil", size: 100 }]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.ABSOLUTE_PATH);
	});

	it("rejects Windows reserved device names", () => {
		const res = PluginLoader.validateArchive([{ path: "nested/nul.txt", size: 10 }]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.RESERVED_NAME);
	});

	it("rejects escaping symlinks", () => {
		const res = PluginLoader.validateArchive([
			{
				path: "sub/symlink.js",
				type: "symlink",
				linkTarget: "../../outside.js",
			},
		]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.SYMLINK_ESCAPE);
	});

	it("rejects case and Unicode collisions", () => {
		const res = PluginLoader.validateArchive([
			{ path: "docs/Guide.md", size: 10 },
			{ path: "docs/guide.md", size: 20 },
		]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.CASE_COLLISION);
	});

	it("rejects compression ratio bombs", () => {
		const res = PluginLoader.validateArchive([
			{
				path: "bomb.bin",
				size: 100 * 1024 * 1024,
				compressedSize: 500 * 1024,
			},
		]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.RATIO_EXCEEDED);
	});

	it("rejects special devices and sockets", () => {
		const res = PluginLoader.validateArchive([{ path: "ipc.sock", type: "socket" }]);
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.SPECIAL_FILE);
	});

	it("rejects archives exceeding file count limit", () => {
		const entries = Array.from({ length: 5 }, (_, i) => ({
			path: `file_${i}.txt`,
			size: 10,
		}));
		const res = PluginLoader.validateArchive(entries, { maxFiles: 3 });
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.MAX_FILES_EXCEEDED);
	});

	it("rejects archives exceeding total uncompressed size limit", () => {
		const entries = [
			{ path: "large1.bin", size: 2000 },
			{ path: "large2.bin", size: 3000 },
		];
		const res = PluginLoader.validateArchive(entries, { maxTotalBytes: 4000 });
		expect(res.valid).toBe(false);
		expect(res.code).toBe(THREAT_CODES.MAX_SIZE_EXCEEDED);
	});
});

describe("W6.3: Digest, Provenance & Grants", () => {
	it("computes deterministic tree digest with types", () => {
		const tmp = createTempDir("digest-vitest-");
		try {
			fs.mkdirSync(path.join(tmp, "docs"), { recursive: true });
			fs.writeFileSync(path.join(tmp, "SKILL.md"), "# Skill\n");
			fs.writeFileSync(path.join(tmp, "docs", "intro.md"), "Intro\n");

			const d1 = PluginLoader.computeDigest(tmp);
			expect(d1.treeDigest).toHaveLength(64);
			expect(d1.files).toHaveLength(2);
			expect(d1.files[0].type).toBe("file");

			// Determinism
			const d2 = PluginLoader.computeDigest(tmp);
			expect(d1.treeDigest).toBe(d2.treeDigest);

			// Mutation sensitivity
			fs.appendFileSync(path.join(tmp, "SKILL.md"), "Tampered");
			const d3 = PluginLoader.computeDigest(tmp);
			expect(d1.treeDigest).not.toBe(d3.treeDigest);
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("manages identity-bound script execution grants and invalidation", () => {
		const tmp = createTempDir("grants-vitest-");
		try {
			const scriptPath = path.join(tmp, "deploy.sh");
			fs.writeFileSync(scriptPath, "#!/bin/sh\necho Deploy\n");

			const grantsFile = path.join(tmp, "grants.json");
			const manager = PluginLoader.getGrantManager(grantsFile);

			// Initially blocked
			const before = manager.checkAuthorization(scriptPath, {
				pluginId: "acme/deploy",
			});
			expect(before.authorized).toBe(false);

			// Issue grant
			manager.grant(scriptPath, { pluginId: "acme/deploy" });
			const after = manager.checkAuthorization(scriptPath, {
				pluginId: "acme/deploy",
			});
			expect(after.authorized).toBe(true);

			// Tampering invalidates grant
			fs.appendFileSync(scriptPath, "rm -rf /\n");
			const tampered = manager.checkAuthorization(scriptPath, {
				pluginId: "acme/deploy",
			});
			expect(tampered.authorized).toBe(false);
			expect(tampered.reason).toContain("modified since grant was issued");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});

	it("verifies npm tarball integrity accurately", () => {
		const buf = Buffer.from("arbitrary-tarball-bytes");
		const expectedHash = crypto.createHash("sha512").update(buf).digest("base64");
		const validIntegrity = `sha512-${expectedHash}`;

		expect(PluginLoader.verifyNpmIntegrity(buf, validIntegrity)).toBe(true);
		expect(PluginLoader.verifyNpmIntegrity(buf, "sha512-tamperedHash==")).toBe(false);
		expect(PluginLoader.verifyNpmIntegrity(buf, "md5-notsupported")).toBe(false);
	});
});

describe("W6.4: Atomic Update Integration", () => {
	it("protects local modifications and performs transactional update", () => {
		const tmp = createTempDir("updater-vitest-");
		try {
			const targetDir = path.join(tmp, "plugin-v1");
			const stagedDir = path.join(tmp, "plugin-v2");

			fs.mkdirSync(targetDir, { recursive: true });
			fs.writeFileSync(path.join(targetDir, "SKILL.md"), "# v1\n");
			const initialDigest = PluginLoader.computeDigest(targetDir).treeDigest;

			fs.mkdirSync(stagedDir, { recursive: true });
			fs.writeFileSync(path.join(stagedDir, "SKILL.md"), "# v2\n");

			// Simulate user modification in target directory
			fs.writeFileSync(path.join(targetDir, "LOCAL.md"), "# User notes\n");

			// Rejects update without force
			expect(() => {
				PluginLoader.applyAtomicUpdate(targetDir, stagedDir, {
					expectedOldTreeDigest: initialDigest,
					force: false,
				});
			}).toThrowError(/local modifications/);

			// Force update succeeds
			const result = PluginLoader.applyAtomicUpdate(targetDir, stagedDir, {
				expectedOldTreeDigest: initialDigest,
				force: true,
			});
			expect(result.success).toBe(true);
			expect(fs.readFileSync(path.join(targetDir, "SKILL.md"), "utf8")).toBe("# v2\n");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
