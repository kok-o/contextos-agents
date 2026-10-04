# README workflow animation

The current monochrome narrative is documented in [STORY.md](STORY.md). Render it
with `python scripts/readme-gif/render_story.py`; it produces
`assets/contextos-story.gif` and a static poster. The earlier dashboard renderer
and its outputs below remain available independently.

`assets/contextos-workflow.gif` is a reconstructed local CLI demonstration. One
persistent workspace shows an editable source rule, generated agent files, a
source update, stale exports, then a refreshed export and passing check.

The animation is 1120 × 660, 20 seconds, and nominally 16 fps. The final `pass`
holds for 2.9 seconds before the scene blends back into its initial state. Fonts
come from the host system; no font files are redistributed.

## Recorded behavior

[`evidence/commands.json`](evidence/commands.json) contains the actual command
arguments, stdout, stderr, duration and exit status. [`evidence/summary.json`](evidence/summary.json)
records the candidate, runtime, hashes and assertions. Capture invokes this
checkout's `bin/index.js` inside a fresh temporary project. Its only checkout
output is the requested evidence directory. It never modifies the repository's
agent configuration, contacts a model, installs a package or opens an AI client.

1. Create `.agents/project/skills/team-auth/SKILL.md`, compile and export.
2. Confirm a clean check: `pass`, exit 0, zero findings.
3. Add `Never log session tokens.` to the source, then compile.
4. Check returns `drift`, exit 1; all three shown paths have `STALE_INPUT` findings.
   The check leaves existing generated files unchanged.
5. Export again. All three files contain both rules; check returns `pass`, exit 0,
   zero findings.

The right-hand cards abbreviate these verified paths:

| Card | Actual generated path |
| --- | --- |
| Cursor | `.cursor/rules/team-auth.mdc` |
| Claude | `.agents/generated/claude/skills/team-auth/SKILL.md` |
| Codex | `.agents/skills/team-auth/SKILL.md` |

Generated file samples are saved under `evidence/exports/`. Codex's card depicts
the shared native skill projection; it does not imply a separate Codex adapter.
This demonstration establishes export consistency, not client loading or model
adherence. No application code is changed.

For readability, the terminal displays the documented executable name
`contextos` instead of `node <repository>/bin/index.js`. Output is excerpted and
two selected JSON fields are placed on one line. Timings, highlights and file
cards are editorial visualization, not a screen recording or performance test.
Machine-specific absolute paths in captured output use named placeholders.

## Reproduce

Requirements: Python 3.10+, Pillow, Node.js and Git. No renderer dependencies are
installed automatically. Existing captured evidence is never overwritten.

```sh
python scripts/readme-gif/render.py --preview-only
python scripts/readme-gif/render.py
```

To capture a new run and render it:

```sh
python scripts/readme-gif/capture.py --out scripts/readme-gif/evidence-new
python scripts/readme-gif/render.py --evidence scripts/readme-gif/evidence-new
```

`capture.py` retains its temporary project for inspection and prints its path.
`render.py` uses a shared palette with reserved status colors and GIF delta frames to keep the
animation compact. It writes `manifest.json`, preview images at full and 850 px
width, a contact sheet, and screenshots decoded from the actual GIF. GIF timing
uses alternating 60/70 ms frame durations to represent 16 fps exactly.

The story timing is in `draw_terminal`, `output_phase`, and `draw_frame` in
`render.py`; styling and font fallbacks are constants at the top. Preview
artifacts are ignored by Git. Decoded GIF frames at 4.7, 11.7 and 18.0 seconds
must match the corresponding quantized source frames pixel for pixel.
The existing `contextos-demo.*` files are separate
and are never overwritten by this renderer.
