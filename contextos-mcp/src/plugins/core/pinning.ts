/**
 * ContextOS Source Pinning & Integrity Enforcement
 * Section 20.1 & Threat Model Hardening
 */

import * as crypto from "node:crypto";
import {
	type PinningValidationOptions,
	type PinningValidationResult,
	type PluginSourceSpec,
	THREAT_CODES,
} from "./types.js";

const EXACT_COMMIT_SHA = /^[0-9a-f]{40}$/i;
const EXACT_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Validates plugin source pinning compliance.
 * Requires 40-char SHA for GitHub and exact semver + sha512 integrity for npm.
 * Fails closed on any unknown source types.
 */
export function validatePluginPinning(
	sourceSpec: PluginSourceSpec = { type: "" },
	options: PinningValidationOptions = {},
): PinningValidationResult {
	if (!sourceSpec || typeof sourceSpec !== "object" || !sourceSpec.type) {
		return {
			valid: false,
			code: THREAT_CODES.UNKNOWN_SOURCE_TYPE,
			error: "Missing or invalid plugin source specification",
		};
	}

	const { type } = sourceSpec;
	const allowFloating = options.allowFloating || false;

	if (type === "github") {
		const commit = (sourceSpec as { commit?: string }).commit;
		if (!commit || !EXACT_COMMIT_SHA.test(commit)) {
			if (!allowFloating) {
				return {
					valid: false,
					code: THREAT_CODES.FLOATING_SOURCE_BLOCKED,
					error:
						"GitHub plugin source must be pinned to an exact 40-character commit SHA. Floating branch or tag is prohibited without --allow-floating.",
				};
			}
		}
	} else if (type === "npm") {
		const version = (sourceSpec as { version?: string }).version;
		const integrity = (sourceSpec as { integrity?: string }).integrity;

		if (
			!version ||
			version === "latest" ||
			version.startsWith("^") ||
			version.startsWith("~") ||
			version.includes(">") ||
			version.includes("<") ||
			version.includes("*") ||
			!EXACT_SEMVER.test(version)
		) {
			return {
				valid: false,
				code: THREAT_CODES.IMPLICIT_LATEST_BLOCKED,
				error:
					'npm plugin source must be pinned to an exact version (e.g. "1.2.3"). Ranges and "latest" are prohibited.',
			};
		}

		if (!integrity || !integrity.startsWith("sha512-")) {
			return {
				valid: false,
				code: THREAT_CODES.MISSING_INTEGRITY,
				error: "npm plugin source requires dist.integrity verification (sha512-...).",
			};
		}
	} else {
		return {
			valid: false,
			code: THREAT_CODES.UNKNOWN_SOURCE_TYPE,
			error: `Unknown or unsupported plugin source type: "${type}". Only "github" and "npm" are permitted.`,
		};
	}

	return { valid: true };
}

/**
 * Verifies that a downloaded npm tarball buffer matches the package's dist.integrity hash.
 */
export function verifyNpmTarballIntegrity(tarballBuffer: Buffer, expectedIntegrity: string): boolean {
	if (!expectedIntegrity.startsWith("sha512-")) {
		return false;
	}

	const expectedHash = expectedIntegrity.slice("sha512-".length);
	const computedHash = crypto.createHash("sha512").update(tarballBuffer).digest("base64");

	const bufA = Buffer.from(computedHash, "utf8");
	const bufB = Buffer.from(expectedHash, "utf8");
	if (bufA.length !== bufB.length) {
		return false;
	}

	return crypto.timingSafeEqual(bufA, bufB);
}
