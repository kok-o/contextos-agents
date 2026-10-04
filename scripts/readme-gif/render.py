"""Render a small, continuous README workflow demo from captured CLI evidence.

Python 3.10+ and Pillow are required. No network access or media services are used.
Run: python scripts/readme-gif/render.py [--preview-only]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re

from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
W, H, SCALE, FPS, SECONDS = 1120, 660, 2, 16, 20
BG = "#0a1019"
PANEL = "#101a27"
EDGE = "#27364a"
WHITE = "#eef3fc"
MUTED = "#98abc3"
DIM = "#60748f"
VIOLET = "#b5a6ff"
GREEN = "#7ae5b5"
AMBER = "#ffcc83"
MONO = ["C:/Windows/Fonts/CascadiaMono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
SANS = ["C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
BOLD = ["C:/Windows/Fonts/seguisb.ttf", "C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
FONTS = {}
TIMES = [(4.7, "01-export"), (8.4, "02-edit"), (11.7, "03-drift"), (14.7, "04-refresh"), (18.0, "05-pass")]


def font(size, kind="sans"):
    key = (size, kind)
    if key not in FONTS:
        candidates = {"sans": SANS, "bold": BOLD, "mono": MONO}[kind]
        path = next((p for p in candidates if Path(p).is_file()), None)
        if path is None:
            raise RuntimeError(f"No {kind} font found. Edit the font search paths in render.py.")
        FONTS[key] = ImageFont.truetype(path, round(size * SCALE))
    return FONTS[key]


def clamp(x):
    return max(0.0, min(1.0, x))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def rgb(color):
    return tuple(int(color[i:i + 2], 16) for i in (1, 3, 5))


def mix(a, b, amount):
    return tuple(round(x + (y - x) * clamp(amount)) for x, y in zip(rgb(a), rgb(b)))


class Canvas:
    def __init__(self):
        self.image = Image.new("RGB", (W * SCALE, H * SCALE), BG)
        self.d = ImageDraw.Draw(self.image)

    def rect(self, box, color, radius=0, outline=None, width=1):
        box = tuple(round(n * SCALE) for n in box)
        if radius:
            self.d.rounded_rectangle(box, radius=round(radius * SCALE), fill=color,
                                     outline=outline, width=max(1, round(width * SCALE)))
        else:
            self.d.rectangle(box, fill=color, outline=outline, width=max(1, round(width * SCALE)))

    def line(self, points, color, width=1):
        self.d.line([(round(x * SCALE), round(y * SCALE)) for x, y in points], fill=color,
                    width=max(1, round(width * SCALE)), joint="curve")

    def circle(self, x, y, r, fill, outline=None, width=1):
        self.d.ellipse(tuple(round(n * SCALE) for n in (x-r, y-r, x+r, y+r)),
                       fill=fill, outline=outline, width=max(1, round(width * SCALE)))

    def text(self, x, y, value, size=22, fill=WHITE, kind="sans", anchor=None):
        self.d.text((round(x*SCALE), round(y*SCALE)), value, font=font(size, kind), fill=fill, anchor=anchor)

    def width(self, value, size=22, kind="sans"):
        return self.d.textlength(value, font=font(size, kind)) / SCALE

    def tick(self, x, y, color, scale=1):
        self.line([(x-5*scale, y), (x-1*scale, y+4*scale), (x+7*scale, y-5*scale)], color, 2.2)


def typed(value, t, start, duration):
    return value[:math.ceil(len(value) * clamp((t-start)/duration))]


def point_on_path(points, progress):
    lengths = [math.dist(a, b) for a, b in zip(points, points[1:])]
    distance = clamp(progress) * sum(lengths)
    for a, b, length in zip(points, points[1:], lengths):
        if distance <= length:
            q = distance / length
            return (a[0] + (b[0]-a[0])*q, a[1] + (b[1]-a[1])*q)
        distance -= length
    return points[-1]


def output_phase(t, index):
    first = 3.35 + index * .28
    final = 14.32 + index * .28
    if t < first:
        return "pending"
    if 10.1 + index*.1 <= t < final:
        return "stale"
    return "fresh" if t >= final else "synced"


def draw_terminal(c, t, evidence):
    c.rect((32, 468, 1088, 603), "#0c1521", 14, EDGE)
    c.circle(56, 491, 3, GREEN)
    c.text(68, 479, "TERMINAL", 17, MUTED, "bold")
    c.text(1058, 479, "Local CLI · output excerpts", 17, DIM, anchor="ra")

    # Commands are shown with the package's documented executable name. The
    # capture contains the literal node/bin/index.js invocation and raw output.
    if t < 1.65:
        cmd, start, duration = "contextos compile", .3, .62
        rows = [] if t < 1.1 else [(f"Successfully compiled {evidence['compiledSkills']} skills into Registry v2!", MUTED)]
        exit_code = None
    elif t < 6.25:
        cmd, start, duration = "contextos export all", 1.7, .75
        rows = [] if t < 3.1 else [(f"All exports complete: {evidence['projectedCount']} artifacts applied …", GREEN)]
        exit_code = 0 if t >= 3.7 else None
    elif t < 8.0:
        cmd, start, duration = "contextos export all", 1.7, .75
        rows = [(f"All exports complete: {evidence['projectedCount']} artifacts applied …", GREEN)]
        exit_code = 0
    elif t < 9.15:
        cmd, start, duration = "contextos compile", 8.0, .5
        rows = [] if t < 8.7 else [(f"Successfully compiled {evidence['compiledSkills']} skills into Registry v2!", MUTED)]
        exit_code = 0 if t >= 8.8 else None
    elif t < 12.95:
        cmd, start, duration = "contextos export all --check --json", 9.15, .7
        rows = [] if t < 10.1 else [(f'"status": "drift",  "totalFindings": {evidence["stale"]["totalFindings"]}', AMBER)]
        exit_code = 1 if t >= 10.1 else None
    elif t < 15.65:
        cmd, start, duration = "contextos export all", 12.95, .62
        rows = [] if t < 14.2 else [(f"All exports complete: {evidence['projectedCount']} artifacts applied …", GREEN)]
        exit_code = 0 if t >= 15.0 else None
    else:
        cmd, start, duration = "contextos export all --check --json", 15.65, .75
        rows = [] if t < 16.65 else [('"status": "pass",  "totalFindings": 0', GREEN)]
        exit_code = 0 if t >= 16.65 else None

    shown = typed(cmd, t, start, duration)
    c.text(55, 513, "$", 24, VIOLET, "mono")
    c.text(85, 513, shown, 24, WHITE, "mono")
    if start <= t < start + duration + .18:
        caret_x = 85 + c.width(shown, 24, "mono") + 3
        c.rect((caret_x, 518, caret_x+2, 542), VIOLET)
    for i, (line, color) in enumerate(rows):
        c.text(85, 554 + i*24, line, 22, color, "mono")
    if exit_code is not None:
        color = AMBER if exit_code else GREEN
        c.rect((992, 550, 1063, 583), "#342a20" if exit_code else "#142e2a", 7)
        c.text(1027, 555, f"exit {exit_code}", 18, color, "bold", "ma")


def draw_frame(t, evidence):
    c = Canvas()
    # A quiet fixed frame prevents palette noise and makes the loop read as one
    # continuous workspace rather than a sequence of title slides.
    c.line([(32, 104), (1088, 104)], EDGE)
    c.rect((32, 29, 76, 73), "#1d223c", 11, "#3a3d66")
    c.line([(47, 41), (42, 41), (42, 60), (47, 60)], VIOLET, 2)
    c.line([(61, 41), (66, 41), (66, 60), (61, 60)], VIOLET, 2)
    c.line([(51, 56), (58, 45)], VIOLET, 2)
    c.text(91, 29, "ContextOS", 31, WHITE, "bold")
    c.text(306, 36, "One source for your agent rules.", 26, MUTED)
    c.rect((942, 34, 1088, 67), "#172435", 16)
    c.text(1015, 39, "WORKFLOW DEMO", 15, MUTED, "bold", "ma")

    c.text(33, 119, "EDITABLE SOURCE", 18, VIOLET, "bold")
    c.text(646, 119, "GENERATED FILES", 18, MUTED, "bold")
    c.text(1088, 119, "3 shown", 16, DIM, anchor="ra")

    changed = t >= 6.35
    settled = t >= 16.65
    source_edge = GREEN if settled else VIOLET if 6.3 <= t < 9.0 else EDGE
    c.rect((32, 152, 502, 439), PANEL, 16, source_edge, 1.3)
    c.text(55, 169, ".agents/project/skills/", 17, DIM, "mono")
    c.text(55, 195, "team-auth/SKILL.md", 24, WHITE, "mono")
    c.line([(54, 235), (480, 235)], EDGE)
    c.text(55, 252, "# Team security", 23, MUTED, "mono")
    c.text(55, 300, "- Never log authorization", 23, WHITE, "mono")
    c.text(55, 332, "  headers.", 23, WHITE, "mono")

    if changed:
        strength = ease((t-6.35)/.3)
        c.rect((45, 377, 488, 419), mix(PANEL, "#21382f" if settled else "#2d2944", strength), 7)
        c.rect((45, 377, 48, 419), GREEN if settled else VIOLET, 1)
        new_line = typed("- Never log session tokens.", t, 6.48, 1.2)
        c.text(55, 384, new_line, 23, GREEN if settled else WHITE, "mono")
        if 6.48 <= t < 8.2 and int(t*3) % 2 == 0:
            x = 55 + c.width(new_line, 23, "mono") + 3
            c.rect((x, 387, x+2, 414), VIOLET)
    else:
        c.text(55, 387, "Markdown, in your repository", 19, DIM)

    # Persistent branching paths connect the editable source to native outputs.
    centers = [198, 296, 394]
    for index, y in enumerate(centers):
        path = [(503, 296), (550, 296), (589, y), (635, y)]
        c.line(path, "#24354a", 2)
        phase = output_phase(t, index)
        pulse_start = 2.65+index*.28 if t < 6.3 else 13.6+index*.28
        progress = (t-pulse_start)/.78
        if 0 <= progress <= 1:
            x, py = point_on_path(path, ease(progress))
            c.circle(x, py, 9, "#253c42")
            c.circle(x, py, 4, GREEN)
        if phase in ("synced", "fresh"):
            c.circle(635, y, 3, GREEN)
        elif phase == "stale":
            c.circle(635, y, 3, AMBER)

    names = ["Cursor", "Claude", "Codex"]
    files = ["team-auth.mdc", "team-auth/SKILL.md", "team-auth/SKILL.md"]
    for index, y in enumerate(centers):
        phase = output_phase(t, index)
        color = {"pending": DIM, "synced": GREEN, "stale": AMBER, "fresh": GREEN}[phase]
        border = {"pending": EDGE, "synced": "#31564c", "stale": "#786141", "fresh": "#31564c"}[phase]
        c.rect((646, y-45, 1088, y+45), PANEL, 13, border)
        c.rect((664, y-24, 703, y+23), "#19273a", 8)
        c.line([(677, y-12), (688, y-12), (693, y-7), (693, y+12), (675, y+12), (675, y-12), (677, y-12)], color, 1.5)
        c.line([(679, y-3), (689, y-3)], color, 1.5)
        c.line([(679, y+3), (687, y+3)], color, 1.5)
        c.text(718, y-32, names[index], 24, WHITE, "bold")
        c.text(718, y+4, files[index], 18, MUTED, "mono")
        status = {"pending": "Ready", "synced": "Synced", "stale": "Stale", "fresh": "Synced"}[phase]
        c.text(1055, y-30, status, 19, color, anchor="ra")
        if phase in ("synced", "fresh"):
            c.tick(1070, y-15, color, .8)
        elif phase == "stale":
            c.text(1070, y-31, "!", 22, color, "bold", "ma")
        if phase == "fresh":
            c.rect((1023, y+9, 1068, y+17), GREEN, 3)
        elif phase == "stale":
            c.rect((1023, y+9, 1048, y+17), AMBER, 3)

    draw_terminal(c, t, evidence)

    # Small persistent chapter rail: only the accent moves.
    steps = [(32, "01", "Write a rule"), (290, "02", "Export"), (548, "03", "Catch drift"), (806, "04", "Refresh & check")]
    active = 0 if t < 1.65 or 6.25 <= t < 9.15 else 1 if t < 6.25 else 2 if t < 12.95 else 3
    for i, (x, number, label) in enumerate(steps):
        color = (AMBER if i == 2 else GREEN if i == 3 else VIOLET) if i == active else DIM
        c.text(x, 620, number, 17, color, "mono")
        c.text(x+32, 616, label, 20, color, "bold" if i == active else "sans")
        if i == active:
            c.rect((x, 650, x+234, 652), color, 1)

    return c.image.resize((W, H), Image.Resampling.LANCZOS)


def frame(t, evidence):
    image = draw_frame(min(t, 19.55), evidence)
    if t >= 19.55:
        # Return to the first editable rule smoothly, without a blank intertitle.
        image = Image.blend(image, draw_frame(0, evidence), ease((t-19.55)/.45))
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-only", action="store_true")
    parser.add_argument("--out", type=Path, default=REPO / "assets/contextos-workflow.gif")
    parser.add_argument("--evidence", type=Path, default=HERE / "evidence")
    args = parser.parse_args()
    evidence = json.loads((args.evidence / "summary.json").read_text(encoding="utf-8"))
    commands = json.loads((args.evidence / "commands.json").read_text(encoding="utf-8"))
    assert evidence["fresh"] == {"status": "pass", "totalFindings": 0, "exitCode": 0}
    assert evidence["stale"]["status"] == "drift" and evidence["stale"]["exitCode"] == 1
    compiled = next(c["stdout"] for c in commands if c["id"] == "compile-before")
    evidence["compiledSkills"] = int(re.search(r"Successfully compiled (\d+) skills", compiled).group(1))
    assert "- Never log authorization headers." in (args.evidence / "source-before.md").read_text(encoding="utf-8")
    assert "- Never log session tokens." in (args.evidence / "source-after.md").read_text(encoding="utf-8")
    preview = HERE / "preview"
    preview.mkdir(exist_ok=True)
    stills = []
    for t, name in TIMES:
        image = frame(t, evidence)
        image.save(preview / f"{name}.png")
        image.resize((850, 501), Image.Resampling.LANCZOS).save(preview / f"{name}-850.png")
        stills.append(image)
    contact = Image.new("RGB", (1120, 1050), "#05080d")
    dc = ImageDraw.Draw(contact)
    for i, ((t, name), still) in enumerate(zip(TIMES, stills)):
        x, y = (i % 2)*560, (i//2)*350
        contact.paste(still.resize((560,330), Image.Resampling.LANCZOS), (x,y))
        dc.text((x+12,y+332), f"{t:.1f}s  /  {name}", fill="#98abc3")
    contact.save(preview / "contact-sheet.png")
    print(f"Preview: {preview / 'contact-sheet.png'}", flush=True)
    if args.preview_only:
        return

    # A single palette preserves static pixels between frames. GIF delta frames
    # then encode only the caret, source edit, status cards and flowing dots.
    palette_source = Image.new("RGB", (W, H*len(stills)))
    for i, still in enumerate(stills):
        palette_source.paste(still, (0, i*H))
    adaptive = palette_source.quantize(colors=112, method=Image.Quantize.MEDIANCUT)
    # Reserve semantic colors before adding adaptive antialiasing colors. A
    # weighted palette alone can desaturate a thin amber warning into gray.
    reserved = [BG, PANEL, EDGE, WHITE, MUTED, DIM, VIOLET, GREEN, AMBER,
                "#0c1521", "#31564c", "#786141", "#142e2a", "#342a20"]
    colors = [channel for color in reserved for channel in rgb(color)] + adaptive.getpalette()[:112*3]
    colors += [0] * (768-len(colors))
    palette = Image.new("P", (1,1))
    palette.putpalette(colors)
    frames = []
    for i in range(FPS*SECONDS):
        image = frame(i/FPS, evidence).quantize(palette=palette, dither=Image.Dither.NONE)
        frames.append(image)
        if i % (FPS*4) == 0:
            print(f"Rendered {i/FPS:.0f}/{SECONDS}s", flush=True)
    args.out.parent.mkdir(exist_ok=True)
    # Alternating 60/70ms durations exactly represent 16fps in GIF's 10ms units.
    durations = [60 if i % 4 != 3 else 70 for i in range(len(frames))]
    frames[0].save(args.out, save_all=True, append_images=frames[1:], duration=durations,
                   loop=0, optimize=False, disposal=1)
    with Image.open(args.out) as gif:
        duration = 0
        actual_stills = []
        decoded_checks = []
        target = iter(TIMES)
        next_target = next(target, None)
        for i in range(gif.n_frames):
            gif.seek(i)
            frame_duration = gif.info.get("duration", 0)
            # Identical frames are coalesced into holds by Pillow. Extract the
            # frame whose display interval CONTAINS each target, not the next
            # change after it (which can belong to a different story beat).
            while next_target and duration <= next_target[0]*1000 < duration + frame_duration:
                screenshot = gif.convert("RGB")
                if next_target[0] in (4.7, 11.7, 18.0):
                    expected = frame(next_target[0], evidence).quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
                    assert ImageChops.difference(screenshot, expected).getbbox() is None, f"GIF decode differs at {next_target[0]}s"
                    decoded_checks.append({"timeSeconds": next_target[0], "matchesQuantizedSourceExactly": True})
                screenshot.resize((850,501), Image.Resampling.LANCZOS).save(preview / f"gif-{next_target[1]}-850.png")
                actual_stills.append((next_target, screenshot))
                next_target = next(target, None)
            duration += frame_duration
        assert gif.size == (W,H) and duration == SECONDS*1000
        info = {"width": W, "height": H, "durationMs": duration,
                "frames": gif.n_frames, "nominalFps": FPS, "loop": gif.info.get("loop"),
                "bytes": args.out.stat().st_size,
                "sha256": hashlib.sha256(args.out.read_bytes()).hexdigest(),
                "decodedReferenceChecks": decoded_checks,
                "evidence": (args.evidence / "commands.json").resolve().relative_to(REPO).as_posix()
                    if (args.evidence / "commands.json").resolve().is_relative_to(REPO) else str((args.evidence / "commands.json").resolve()),
                "format": "Continuous reconstructed CLI demo; selected output excerpts, editorial timing"}
        (HERE / "manifest.json").write_text(json.dumps(info, indent=2)+"\n", encoding="utf-8")
        gif_contact = Image.new("RGB", (1120,1050), "#05080d")
        dg = ImageDraw.Draw(gif_contact)
        for i, ((t,name), still) in enumerate(actual_stills):
            x, y = (i % 2)*560, (i//2)*350
            gif_contact.paste(still.resize((560,330), Image.Resampling.LANCZOS), (x,y))
            dg.text((x+12,y+332), f"GIF {t:.1f}s / {name}", fill="#98abc3")
        gif_contact.save(preview / "gif-contact-sheet.png")
    print(json.dumps(info, indent=2), flush=True)


if __name__ == "__main__":
    main()
