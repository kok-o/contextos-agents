import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

function getLeaseLockClass(dir: string) {
	let current = dir;
	while (current !== path.dirname(current)) {
		const p = path.join(current, ".agents", "runtime", "ipc-lock.js");
		if (fs.existsSync(p)) {
			return require(p).LeaseLock;
		}
		current = path.dirname(current);
	}
	throw new Error("Could not find ipc-lock.js");
}

describe("Lease Takeover and Fencing (W4.2)", () => {
	it("allows expired lease takeover and prevents stale owner from writing", async () => {
		const TEST_DIR = path.join(__dirname, ".tmp-lease-takeover");
		if (fs.existsSync(TEST_DIR)) {
			fs.rmSync(TEST_DIR, { recursive: true, force: true });
		}
		fs.mkdirSync(TEST_DIR, { recursive: true });

		const LeaseLock = getLeaseLockClass(__dirname);
		const lockFilePath = path.join(TEST_DIR, "test-thread.lock");

		// Simulate Owner 1
		const lock1 = new LeaseLock({
			lockFilePath,
			ttlMs: 50, // Short TTL for test
			instanceId: "process-1",
		});

		const acquired1 = lock1.tryAcquire();
		expect(acquired1).toBe(true);

		// Process 1 is currently the owner
		lock1.assertValid();

		// Simulate Owner 2 trying to acquire before expiration
		const lock2 = new LeaseLock({
			lockFilePath,
			ttlMs: 500,
			instanceId: "process-2",
		});

		const acquired2_early = lock2.tryAcquire();
		expect(acquired2_early).toBe(false); // Should fail

		// Simulate process 1 crashing
		(lock1 as any)._stopHeartbeat();

		// Wait for lock1 to expire (ttlMs enforces minimum 1000ms)
		await new Promise((resolve) => setTimeout(resolve, 1100));

		// Log the file contents to see why it fails
		console.log("LOCK FILE CONTENT:", fs.readFileSync(lockFilePath, "utf8"));
		console.log("DATE NOW:", Date.now());

		// Now Owner 2 should be able to take over
		const acquired2_takeover = lock2.tryAcquire();
		console.log("Acquired:", acquired2_takeover);
		expect(acquired2_takeover).toBe(true);
		lock2.assertValid();

		// Stale owner (Owner 1) should no longer be able to write or assert valid
		expect(() => lock1.assertValid()).toThrow(/Lock lease was lost or taken over/);

		// Stale owner should not be able to release it properly (or at least it shouldn't clear Owner 2's lock)
		lock1.release();

		// Owner 2 should still hold the lock
		expect(() => lock2.assertValid()).not.toThrow();

		lock2.release();
	});
});
