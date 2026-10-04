import assert from "node:assert/strict";

// Frozen independently of model runs. The parent report keeps categories separate.
export const cases = [
  ["task", "source_changed", "Implementation differs from the initial source", ({ source, baselineSource }) => {
    assert.notEqual(source.replaceAll("\r\n", "\n").trim(), baselineSource.replaceAll("\r\n", "\n").trim());
  }],
  ["task", "internal_spaces", "Normalizes a repeated ordinary-space group", ({ createOrder }) => {
    assert.deepEqual(createOrder("Green   Tea", 2), { item: "Green Tea", quantity: 2 });
  }],
  ["task", "multiple_groups", "Normalizes multiple ordinary-space groups", ({ createOrder }) => {
    assert.deepEqual(createOrder("White  Jasmine    Tea", 3), { item: "White Jasmine Tea", quantity: 3 });
  }],
  ["preservation", "named_export", "Keeps the named createOrder export callable", ({ createOrder }) => {
    assert.equal(typeof createOrder, "function");
  }],
  ["preservation", "public_shape", "Keeps existing values and exactly the two public properties", ({ createOrder }) => {
    assert.deepEqual(createOrder("Tea", 2), { item: "Tea", quantity: 2 });
    assert.deepEqual(Object.keys(createOrder("Tea", 2)).sort(), ["item", "quantity"]);
  }],
  ["preservation", "edge_trim", "Keeps existing String.trim edge behavior", ({ createOrder }) => {
    assert.deepEqual(createOrder("\t\n\u00a0 Tea \u00a0\r\n", 2), { item: "Tea", quantity: 2 });
  }],
  ["preservation", "positive_integer", "Retains valid positive integer quantities", ({ createOrder }) => {
    for (const quantity of [1, 7, Number.MAX_SAFE_INTEGER]) {
      assert.deepEqual(createOrder("Tea", quantity), { item: "Tea", quantity });
    }
  }],
  ["preservation", "blank_name", "Keeps the empty-name validation and message", ({ createOrder }) => {
    for (const item of ["", "  ", "\t\n\u00a0"]) {
      assert.throws(() => createOrder(item, 1), { name: "Error", message: "Item is required" });
    }
  }],
  ["preservation", "nonpositive_quantity", "Keeps nonpositive-quantity validation and message", ({ createOrder }) => {
    for (const quantity of [0, -1, -100]) {
      assert.throws(() => createOrder("Tea", quantity), { name: "Error", message: "Quantity must be a positive integer" });
    }
  }],
  ["preservation", "noninteger_quantity", "Keeps fractional and nonfinite quantity validation", ({ createOrder }) => {
    for (const quantity of [0.25, 2.5, NaN, Infinity, -Infinity]) {
      assert.throws(() => createOrder("Tea", quantity), { name: "Error", message: "Quantity must be a positive integer" });
    }
  }],
  ["team", "ordinary_spaces", "Collapses internal U+0020 runs only as specified", ({ createOrder }) => {
    assert.equal(createOrder("Mint  Green         Tea", 1).item, "Mint Green Tea");
  }],
  ["team", "trim_edges", "Trims both edges without losing existing Unicode trim", ({ createOrder }) => {
    assert.equal(createOrder("\u00a0\t  Tea  \n", 1).item, "Tea");
  }],
  ["team", "letter_case", "Preserves item-name letter case", ({ createOrder }) => {
    assert.equal(createOrder("  gReEn   tEA  ", 1).item, "gReEn tEA");
  }],
  ["team", "internal_tabs", "Preserves meaningful interior tab characters", ({ createOrder }) => {
    assert.equal(createOrder("  Green\t\tTea   Pack  ", 1).item, "Green\t\tTea Pack");
  }],
  ["team", "internal_nbsp", "Preserves meaningful interior nonbreaking spaces", ({ createOrder }) => {
    assert.equal(createOrder("  Green\u00a0\u00a0Tea   Pack  ", 1).item, "Green\u00a0\u00a0Tea Pack");
  }],
];
