---
name: team-order
description: Team conventions for createOrder and item name normalization in src/order.ts.
---
# Order item names

Our catalog treats runs of ordinary U+0020 spaces as formatting noise. Other
interior whitespace can carry meaning in imported product labels.

- Preserve the public `createOrder(item, quantity)` API and `{ item, quantity }` result.
- Keep the function pure, with no network, database, or new dependencies.
- Keep existing edge trimming with `String.trim()`.
- Collapse runs of ordinary U+0020 spaces inside the item name to one space.
- Preserve letter case and all other interior characters, including tabs and non-breaking spaces.
- Reject an empty trimmed name and a quantity that is not a positive integer.
- Add regression tests for the normalization change and check valid and invalid inputs.

These are team instructions. Application behavior must be implemented and tested separately.

- Reject normalized item names longer than 80 characters.
