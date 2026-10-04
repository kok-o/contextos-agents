import test from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "../src/order.ts";

test("creates an order with the existing public result shape", () => {
  assert.deepEqual(createOrder("Tea", 2), { item: "Tea", quantity: 2 });
});

test("trims item names at the edges", () => {
  assert.deepEqual(createOrder("  Tea  ", 1), { item: "Tea", quantity: 1 });
});

test("collapses ordinary spaces throughout item names", () => {
  assert.deepEqual(createOrder("  Green   Tea    Blend  ", 3), {
    item: "Green Tea Blend",
    quantity: 3,
  });
});

test("preserves case and non-space interior characters", () => {
  for (const item of ["gReEn Tea", "Green\t\tTea", "Green\u00a0\u00a0Tea", "Green\n\nTea", "Crème—Tea!"]) {
    assert.deepEqual(createOrder(item, 1), { item, quantity: 1 });
  }
});

test("trims edge whitespace while preserving mixed interior whitespace", () => {
  assert.deepEqual(createOrder("\t\u00a0  Green   \t  Tea\u00a0\u00a0  Blend  \n", 1), {
    item: "Green \t Tea\u00a0\u00a0 Blend",
    quantity: 1,
  });
});

test("accepts positive integer quantities", () => {
  for (const quantity of [1, 2, 100]) {
    assert.deepEqual(createOrder("Tea", quantity), { item: "Tea", quantity });
  }
});

test("rejects empty item names", () => {
  for (const item of ["", "   ", "\t\n", "\u00a0", " \t\u00a0\n "]) {
    assert.throws(() => createOrder(item, 1), {
      name: "Error",
      message: "Item is required",
    });
  }
});

test("rejects quantities that are not positive integers", () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, -Infinity, "2", null, undefined]) {
    assert.throws(() => createOrder("Tea", quantity), {
      name: "Error",
      message: "Quantity must be a positive integer",
    });
  }
});
