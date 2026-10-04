# Evidence replay renderer

This tool renders supplied facts. It does not run agents, infer results, generate narration, or contact a service. Every frame carries **Replay of recorded runs**. The schema fixture is deliberately labelled as an example and must not be published as experiment evidence.

Requirements: Python 3.10+, Pillow, and `ffmpeg` on PATH. `ffprobe` on PATH adds a technical media report. Fonts are discovered from explicit Windows Segoe UI/Consolas and Linux DejaVu paths. No dependencies are installed automatically.

```powershell
python examples/readme-demo/media-tools/render_demo.py path/to/scenes.json --out-dir path/to/media --preview-only
python examples/readme-demo/media-tools/render_demo.py path/to/scenes.json --out-dir path/to/media
```

The output includes 1920×1080 MP4 (24 fps), a 25–30 second GIF (28 seconds by default), an English SRT when English captions are supplied, full-size scene PNGs, a diagnostic contact sheet, concat timelines, and a manifest containing exact renderer commands, exit codes, hashes and ffprobe information. No audio is added unless narration files are supplied. Static frames are a reconstruction from evidence, not a continuous screen recording.

## Scene schema

Use `scenes.example.json` as a **schema fixture only**. Its nine-second video is for a fast renderer check. For the actual demo, choose scene durations totalling approximately **210–230 seconds**.

```json
{
  "title": "ContextOS evidence demo",
  "candidate": "Short exact candidate identity",
  "scenes": [{
    "id": "install",
    "title": "Concise factual headline",
    "kicker": "02 / INSTALL",
    "duration": 18,
    "body": ["Short supporting fact.", "Another supporting fact."],
    "code": {
      "title": "Saved command / excerpt",
      "text": "Literal multiline text goes here",
      "font_size": 32,
      "highlight_lines": [1]
    },
    "footer": "Evidence: short/path/to/log.json",
    "captions": ["First English subtitle.", "Second English subtitle."],
    "narration": "audio/install.ru.wav",
    "evidence": ["relative/path/to/evidence"]
  }],
  "gif": {
    "width": 960,
    "fps": 12,
    "segments": [{"scene": "install", "duration": 28}]
  }
}
```

`narration` is optional and resolved relative to `scenes.json`. Audio is resampled to mono 48 kHz and padded with silence; narration longer than its scene is rejected, never silently cut. Russian WAV files can be supplied from a local voice tool. Captions are evenly divided within each scene, or use objects `{ "start": 0, "end": 4, "text": "..." }` for explicit times relative to scene start. Captions may contain `\n`. Their language is not translated or inferred.

For a full-width comparison, omit `code` and provide `table`:

```json
{
  "columns": [
    {"label": "Condition", "width": 2},
    {"label": "Attempt", "width": 1},
    {"label": "Checks", "width": 3}
  ],
  "rows": [["literal value", "literal value", "literal result"]],
  "font_size": 31
}
```

Columns can also be strings with equal widths. Tables support 1–9 rows; split more rows into more scenes. `width` is a relative column weight. `body_font_size` adjusts body text; code fonts are constrained to 26–42 px. To keep evidence legible, the tool rejects text overflow instead of truncating, cropping or shrinking it invisibly. Split long command/diff lines explicitly in the scene input. Keep ordinary code excerpts around 12 lines and 52 characters per line.

Full-width prose scenes may use `callout` for one key statement. A persistent footer defaults to `candidate`. `evidence` strings are recorded in the manifest for traceability; the renderer does not verify their truth. `--prefix` changes MP4/GIF/SRT filenames. `--fps` changes the MP4 frame rate.

Inspect the complete contact sheet and at least the start, middle and end of both actual media files. Also review the input for secrets and confirm captions/narration against saved evidence. Rendering and export checks do not establish model behavior.
