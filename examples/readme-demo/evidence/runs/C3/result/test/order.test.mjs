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
  assert.deepEqual(createOrder("  Green   Tea    Blend  ", 3), {
    item: "Green Tea Blend",
    quantity: 3,
  });
});

test("preserves letter case and other interior characters", () => {
  for (const item of [
    "gReEn Tea",
    "Tea\t\tBlend",
    "Tea\u00a0\u00a0Blend",
    "Tea\nBlend",
    "Tea—Blend",
  ]) {
    assert.deepEqual(createOrder(item, 1), { item, quantity: 1 });
  }
});

test("collapses ordinary spaces without changing adjacent interior whitespace", () => {
  assert.deepEqual(createOrder("\t Green  \t  Tea  \u00a0  Blend \n", 2), {
    item: "Green \t Tea \u00a0 Blend",
    quantity: 2,
  });
});

test("rejects empty item names", () => {
  for (const item of ["", "   ", "\t\n", " \t\u00a0\n "]) {
    assert.throws(() => createOrder(item, 1), {
      name: "Error",
      message: "Item is required",
    });
  }
});

test("rejects quantities that are not positive integers", () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => createOrder("Tea", quantity), {
      name: "Error",
      message: "Quantity must be a positive integer",
    });
  }
});
