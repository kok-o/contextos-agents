import test from "node:test";
import assert from "node:assert/strict";
import { createOrder } from "../src/order.ts";

test("creates an order with the existing public result shape", () => {
  assert.deepEqual(createOrder("Tea", 2), { item: "Tea", quantity: 2 });
});

test("trims item names at the edges", () => {
  assert.deepEqual(createOrder("  Tea  ", 1), { item: "Tea", quantity: 1 });
});

test("collapses internal whitespace to single spaces", () => {
  for (const item of [
    "  Earl   Grey  Tea  ",
    "\tEarl\t\tGrey\r\nTea\n",
    "\u00a0Earl\u00a0\u2003Grey\u202fTea\u3000",
  ]) {
    assert.deepEqual(createOrder(item, 3), {
      item: "Earl Grey Tea",
      quantity: 3,
    });
  }
});

test("preserves item name case, punctuation, and non-whitespace characters", () => {
  assert.deepEqual(createOrder("  Café-style   TEA (50g)  ", 2), {
    item: "Café-style TEA (50g)",
    quantity: 2,
  });
});

test("normalizing an already normalized item does not change it", () => {
  const order = createOrder("  Earl\tGrey  Tea  ", 2);
  assert.deepEqual(createOrder(order.item, order.quantity), order);
});

test("rejects empty item names", () => {
  for (const item of ["", "   ", "\t\n", "\u00a0\u2003\u202f\u3000"]) {
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
