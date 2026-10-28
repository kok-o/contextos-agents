/**
 * ContextOS Plugin Supply Chain CLI Adapter
 * ADR-002: Bundled CJS entrypoint for CLI consumption
 */

export { validateArchiveEntry } from "./core/archive.js";
export { calculateTreeDigest, sha256 } from "./core/digest.js";
export { ScriptGrantManager } from "./core/grants.js";
export {
	validatePluginPinning,
	verifyNpmTarballIntegrity,
} from "./core/pinning.js";
export type * from "./core/types.js";
export { THREAT_CODES } from "./core/types.js";
export { AtomicPluginUpdater } from "./core/updater.js";
