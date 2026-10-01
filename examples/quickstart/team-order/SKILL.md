---
name: team-order
description: Team conventions for changes to the order module.
---
# Team order conventions

- Keep `createOrder` pure: it must not make network or database calls.
- Preserve the public `{ item, quantity }` result shape.
- Reject empty items and quantities that are not positive integers.
- Check invalid inputs as well as a valid order before reporting completion.

These are instructions for an agent; they do not execute or enforce validation.
