/**
 * Tests for AsyncSemaphore — promise-based concurrency limiter.
 *
 * Tests the actual AsyncSemaphore exported from src/threads/manager.ts.
 */

import { describe, expect, it } from "vitest";
import { AsyncSemaphore } from "../../src/threads/manager.js";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AsyncSemaphore", () => {
	describe("acquire() when slots available", () => {
		it("succeeds immediately", async () => {
			const sem = new AsyncSemaphore(3);

			// Should resolve instantly (no blocking)
			await sem.acquire();
			expect(sem.activeCount).toBe(1);

			await sem.acquire();
			expect(sem.activeCount).toBe(2);

			await sem.acquire();
			expect(sem.activeCount).toBe(3);
		});
	});

	describe("acquire() when all slots taken", () => {
		it("blocks until a slot is freed", async () => {
			const sem = new AsyncSemaphore(1);
			await sem.acquire();

			let acquired = false;
			const pending = sem.acquire().then(() => {
				acquired = true;
			});

			// Give microtask queue a chance to run
			await Promise.resolve();
			expect(acquired).toBe(false);
			expect(sem.waitingCount).toBe(1);

			sem.release();

			// Now the pending acquire should resolve
			await pending;
			expect(acquired).toBe(true);
		});
	});

	describe("release() unblocks waiters in FIFO order", () => {
		it("resolves waiters in the order they called acquire()", async () => {
			const sem = new AsyncSemaphore(1);
			await sem.acquire();

			const order: number[] = [];

			const p1 = sem.acquire().then(() => order.push(1));
			const p2 = sem.acquire().then(() => order.push(2));
			const p3 = sem.acquire().then(() => order.push(3));

			// All should be waiting
			await Promise.resolve();
			expect(sem.waitingCount).toBe(3);

			// Release one at a time
			sem.release();
			await p1;
			expect(order).toEqual([1]);

			sem.release();
			await p2;
			expect(order).toEqual([1, 2]);

			sem.release();
			await p3;
			expect(order).toEqual([1, 2, 3]);
		});
	});

	describe("activeCount and waitingCount accuracy", () => {
		it("reports correct counts at each stage", async () => {
			const sem = new AsyncSemaphore(2);

			expect(sem.activeCount).toBe(0);
			expect(sem.waitingCount).toBe(0);

			await sem.acquire();
			expect(sem.activeCount).toBe(1);
			expect(sem.waitingCount).toBe(0);

			await sem.acquire();
			expect(sem.activeCount).toBe(2);
			expect(sem.waitingCount).toBe(0);

			// Third acquire should block
			let thirdAcquired = false;
			const p = sem.acquire().then(() => {
				thirdAcquired = true;
			});
			await Promise.resolve();

			expect(sem.activeCount).toBe(2);
			expect(sem.waitingCount).toBe(1);
			expect(thirdAcquired).toBe(false);

			sem.release();
			await p;

			expect(sem.activeCount).toBe(2); // slot transferred to waiter
			expect(sem.waitingCount).toBe(0);
			expect(thirdAcquired).toBe(true);

			// Release all remaining
			sem.release();
			expect(sem.activeCount).toBe(1);

			sem.release();
			expect(sem.activeCount).toBe(0);
		});
	});

	describe("double-release guard", () => {
		it("does not go below zero on extra release()", () => {
			const sem = new AsyncSemaphore(2);

			// Release without any prior acquire — should be guarded
			sem.release();
			expect(sem.activeCount).toBe(0);

			// Release again — still should not go negative
			sem.release();
			expect(sem.activeCount).toBe(0);
		});

		it("guards against release after all slots already freed", async () => {
			const sem = new AsyncSemaphore(1);
			await sem.acquire();
			expect(sem.activeCount).toBe(1);

			sem.release();
			expect(sem.activeCount).toBe(0);

			// Extra release
			sem.release();
			expect(sem.activeCount).toBe(0);
		});
	});

	describe("concurrent acquires respect max limit", () => {
		it("never exceeds max concurrent active slots", async () => {
			const max = 3;
			const sem = new AsyncSemaphore(max);
			let peakActive = 0;

			const workers = Array.from({ length: 10 }, async (_, _i) => {
				await sem.acquire();
				peakActive = Math.max(peakActive, sem.activeCount);
				expect(sem.activeCount).toBeLessThanOrEqual(max);

				// Simulate async work
				await new Promise((r) => setTimeout(r, 10));

				sem.release();
			});

			await Promise.all(workers);

			expect(peakActive).toBeLessThanOrEqual(max);
			expect(sem.activeCount).toBe(0);
			expect(sem.waitingCount).toBe(0);
		});
	});
});
