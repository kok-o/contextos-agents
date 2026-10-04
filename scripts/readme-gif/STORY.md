# Monochrome README story

`assets/contextos-story.gif` is the narrative alternative to the earlier workflow
dashboard. It uses the README's near-black `#0d1117` background, off-white text,
no repeated logo or product header, and sparse amber/green terminal statuses.

The 19-second story starts with the problem, shows the source edit and stale
exports, then finishes with an export and a passing consistency check. The three
named configurations are representative verified files, not the total number of
artifacts produced by `export all`.

## Recorded behavior and limits

The animation reuses the isolated local CLI run in
[`evidence/commands.json`](evidence/commands.json) and
[`evidence/summary.json`](evidence/summary.json). No new model, API, installation,
publication or client run is performed. In that run:

- A clean baseline export passed its check.
- `Never log session tokens.` was added to the source `team-auth/SKILL.md`.
- Compilation succeeded; the check returned `drift`, `hasDrift: true`, exit 1.
- The recorded findings include the Cursor, Claude and shared Codex native skill
  paths listed in the evidence summary.
- A new export succeeded; its check returned `pass`, zero findings, exit 0.

The terminal displays the documented `contextos` executable name in place of
the recorded `node <repository>/bin/index.js` invocation. Output is excerpted;
the ellipsis after `All exports complete` omits the transaction details. The
visuals and timings are reconstructed, not a screen recording or performance
measurement. Export consistency does not establish client loading or model
adherence. The source edit is retained above the drift check so its cause stays
visible.

## Render and verify

Python 3.10+ and Pillow are required. The script reuses only the font loader from
`render.py`; it never changes the earlier GIF, renderer, or capture. No fonts are
redistributed and no dependencies are installed automatically.

```sh
python scripts/readme-gif/render_story.py --preview-only
python scripts/readme-gif/render_story.py
```

The output is 1120 × 630 at nominally 20 fps, with static holds coalesced into
longer GIF frames. A fixed palette reserves the background and status colors.
The renderer decodes the resulting GIF, locates six samples by their actual
display intervals, and requires exact pixel equality with the quantized source
frames. Final previews include the GIF hash in their filenames to avoid stale
image previews. `story-manifest.json` records the actual dimensions, duration,
size, checksum and comparison results.

Preview files are generated inside the existing Git-ignored `preview/`
directory. `story-<hash>-poster.png` shows the actual first beat; the matching
contact sheet contains only frames decoded from the exported GIF. The same
decoded first beat is saved as `assets/contextos-story-poster.png` for static
previews.
