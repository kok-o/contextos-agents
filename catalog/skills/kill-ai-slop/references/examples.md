# Review examples

## Findings tied to a product

A coworking demo displays "Live sensors", "6 places left" and "Your access pass
is active" using constants and local form state. Report the labels and their
source locations, explain that no live observation or booking occurred, and
replace them with explicit demo labels while preserving the interaction.

A page has seven identical glowing cards. Check their content first. If only two
contain primary actions, reduce emphasis on supporting information and group it
for scanning. Do not require a different layout solely because cards are common.

## Preserve deliberate choices

A supplied violet brand palette uses a gradient to show a selected range in an
analytics chart. Keep it if legible and meaningful. A plain settings page with a
common sans-serif font is acceptable when hierarchy and controls work well.

## Verify the result

After changing a gallery dialog, verify that opening it moves focus inside,
Tab stays inside, Escape closes it and focus returns to the opener. Presence of
role="dialog" alone proves none of those behaviors.

At a 390 px viewport, inspect the overflowing element and fix its sizing or
wrapping. Clipping the body can hide both the defect and interactive content.
If no browser is available, record these checks as unverified.
