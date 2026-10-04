import test from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "../src/order.ts";

test("creates an order with the existing public result shape", () => {
  assert.deepEqual(createOrder("Tea", 2), { item: "Tea", quantity: 2 });
});

test("trims item names at the edges", () => {
  assert.deepEqual(createOrder("  Tea  ", 1), { item: "Tea", quantity: 1 });
});

test("collapses runs of ordinary spaces while preserving letter case", () => {
  assert.deepEqual(createOrder("  Green   TEA    Blend  ", 3), {
    item: "Green TEA Blend",
    quantity: 3,
  });
});

test("preserves interior whitespace other than ordinary spaces", () => {
  for (const whitespace of ["\t", "\n", "\r", "\u00a0", "\u2003"]) {
    const item = "Green" + whitespace + whitespace + "Tea";
    assert.deepEqual(createOrder(item, 1), { item, quantity: 1 });
  }
});

test("normalizes ordinary spaces alongside meaningful interior whitespace", () => {
  assert.deepEqual(createOrder("\t Green  \t  TEA  \u00a0  Blend \n", 2), {
    item: "Green \t TEA \u00a0 Blend",
    quantity: 2,
  });
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
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => createOrder("Tea", quantity), {
      name: "Error",
      message: "Quantity must be a positive integer",
    });
  }
});
