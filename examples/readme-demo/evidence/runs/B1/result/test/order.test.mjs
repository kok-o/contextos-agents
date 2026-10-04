import test from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "../src/order.ts";

test("creates an order with the existing public result shape", () => {
  assert.deepEqual(createOrder("Tea", 2), { item: "Tea", quantity: 2 });
});

test("trims item names at the edges", () => {
  assert.deepEqual(createOrder("  Tea  ", 1), { item: "Tea", quantity: 1 });
});

test("collapses ordinary spaces while preserving letter case and punctuation", () => {
  assert.deepEqual(createOrder("  eArL   Grey    Tea!  ", 3), {
    item: "eArL Grey Tea!",
    quantity: 3,
  });
});

test("preserves other interior whitespace while collapsing ordinary spaces", () => {
  for (const whitespace of ["\t\t", "\u00a0\u00a0", "\n\r", "\u2003\u2003"]) {
    assert.deepEqual(createOrder(`\t\u00a0 Tea  ${whitespace}   Blend \n`, 1), {
      item: `Tea ${whitespace} Blend`,
      quantity: 1,
    });
  }
});

test("leaves already normalized names unchanged", () => {
  assert.deepEqual(createOrder("Green Tea", 1), {
    item: "Green Tea",
    quantity: 1,
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
  for (const quantity of [0, -1, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => createOrder("Tea", quantity), {
      name: "Error",
      message: "Quantity must be a positive integer",
    });
  }
});
