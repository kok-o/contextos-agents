import test from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "../src/order.ts";

test("creates an order with the existing public result shape", () => {
  assert.deepEqual(createOrder("Tea", 2), { item: "Tea", quantity: 2 });
});

test("trims item names at the edges", () => {
  assert.deepEqual(createOrder("  Tea  ", 1), { item: "Tea", quantity: 1 });
});

test("collapses runs of ordinary spaces in item names", () => {
  for (const [item, expectedItem] of [
    ["Green  Tea", "Green Tea"],
    ["  Green   Tea  Leaves  ", "Green Tea Leaves"],
  ]) {
    assert.deepEqual(createOrder(item, 2), { item: expectedItem, quantity: 2 });
  }
});

test("preserves case and non-space interior characters", () => {
  for (const item of [
    "gReEn-Tea!",
    "Green\t\tTea",
    "Green\u00a0\u00a0Tea",
    "Green\n\rTea",
    "Green\u2003\u2003Tea",
  ]) {
    assert.deepEqual(createOrder(`\t ${item} \u00a0`, 1), { item, quantity: 1 });
  }
  assert.deepEqual(createOrder("  Green  \t  Tea  \u00a0  Leaves  ", 1), {
    item: "Green \t Tea \u00a0 Leaves",
    quantity: 1,
  });
});

test("accepts positive integer quantities", () => {
  for (const quantity of [1, 2, 100, Number.MAX_SAFE_INTEGER]) {
    assert.deepEqual(createOrder("Tea", quantity), { item: "Tea", quantity });
  }
});

test("rejects empty item names", () => {
  for (const item of ["", "   ", "\t\n", "\u00a0\u2003"]) {
    assert.throws(() => createOrder(item, 1), {
      name: "Error",
      message: "Item is required",
    });
  }
});

test("rejects quantities that are not positive integers", () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => createOrder("Tea", quantity), {
      name: "Error",
      message: "Quantity must be a positive integer",
    });
  }
});
