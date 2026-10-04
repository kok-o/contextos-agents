#!/usr/bin/env python3
"""Render an evidence-driven, clearly labelled replay from a scenes.json file.

Requires Pillow and ffmpeg on PATH; never calls a model or a network service.
No experiment values are inferred: titles, code, tables and captions come from input.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import wave

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
BG = "#0c1422"
PANEL = "#121f31"
INK = "#f4f7fa"
MUTED = "#a6b5c9"
CYAN = "#62e0d0"
RED = "#ff9696"
GREEN = "#99e9b4"
AMBER = "#ffcf7a"
FONT_PATHS = {
    "regular": ["C:/Windows/Fonts/segoeui.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"],
    "bold": ["C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"],
    "mono": ["C:/Windows/Fonts/consola.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"],
}


def font(size: int, kind: str = "regular") -> ImageFont.FreeTypeFont:
    for candidate in FONT_PATHS[kind]:
        if Path(candidate).is_file():
            return ImageFont.truetype(candidate, size)
    raise ValueError(f"No readable {kind} font; edit FONT_PATHS for this platform")


def width(draw, value, face):
    return draw.textlength(str(value), font=face)


def wrap(draw, text, face, max_width):
    """Wrap prose without silently truncating evidence or long identifiers."""
    result = []
    for paragraph in str(text).split("\n"):
        line = ""
        for word in paragraph.split():
            if width(draw, word, face) > max_width:
                raise ValueError(f"Unbreakable text is too wide: {word!r}")
            combined = f"{line} {word}".strip()
            if line and width(draw, combined, face) > max_width:
                result.append(line)
                line = word
            else:
                line = combined
        result.append(line)
    return result


def prose(draw, text, x, y, max_width, size=34, color=INK, bold=False, spacing=1.35):
    face = font(size, "bold" if bold else "regular")
    for line in wrap(draw, text, face, max_width):
        draw.text((x, y), line, font=face, fill=color)
        y += round(size * spacing)
    return y


def body_lines(scene):
    body = scene.get("body", [])
    return [body] if isinstance(body, str) else body


def chrome(draw, data, scene, index, count, elapsed, total):
    draw.rectangle((0, 0, W, 7), fill=CYAN)
    draw.text((80, 40), "CONTEXTOS / EVIDENCE DEMO", font=font(26, "bold"), fill=CYAN)
    badge = "Replay of recorded runs"
    badge_face = font(26)
    badge_w = width(draw, badge, badge_face) + 38
    draw.rounded_rectangle((W - 80 - badge_w, 30, W - 80, 80), radius=13, fill="#263245")
    draw.text((W - 61 - badge_w, 36), badge, font=badge_face, fill=INK)
    kicker = scene.get("kicker", f"SCENE {index + 1:02d} / {count:02d}")
    draw.text((80, 106), kicker.upper(), font=font(24, "bold"), fill=MUTED)
    title_end = prose(draw, scene["title"], 76, 145, W - 156, 58, bold=True, spacing=1.16)
    if title_end > 280:
        raise ValueError(f"Scene {scene['id']}: title exceeds two lines")
    draw.line((80, 994, W - 80, 994), fill="#304059", width=1)
    footer = scene.get("footer", data.get("candidate", ""))
    face = font(23)
    if width(draw, footer, face) > 1500:
        raise ValueError(f"Scene {scene['id']}: footer too long")
    draw.text((80, 1012), footer, font=face, fill=MUTED)
    counter = f"{index + 1:02d} / {count:02d}"
    draw.text((W - 80 - width(draw, counter, font(25, "mono")), 1010), counter, font=font(25, "mono"), fill=CYAN)
    draw.rectangle((80, 1060, W - 80, 1065), fill="#233047")
    draw.rectangle((80, 1060, 80 + (W - 160) * (elapsed + scene["duration"]) / total, 1065), fill=CYAN)
    return max(290, title_end + 24)


def render_code(draw, code, x, top, panel_width, bottom=958):
    text = code.get("text", "")
    lines = text.splitlines() or [""]
    size = int(code.get("font_size", 32))
    if not 26 <= size <= 42:
        raise ValueError("code.font_size must be 26..42 for readability")
    face = font(size, "mono")
    line_h = round(size * 1.36)
    draw.rounded_rectangle((x, top, x + panel_width, bottom), radius=20, fill="#08101b", outline="#33455e", width=2)
    draw.rounded_rectangle((x, top, x + panel_width, top + 61), radius=20, fill="#1c2a3d")
    draw.rectangle((x + 1, top + 34, x + panel_width - 1, top + 61), fill="#1c2a3d")
    for i, color in enumerate(["#f17979", "#eabf68", "#80c8a5"]):
        draw.ellipse((x + 23 + 24 * i, top + 25, x + 34 + 24 * i, top + 36), fill=color)
    code_title = code.get("title", "Recorded excerpt")
    if width(draw, code_title, font(25)) > panel_width - 140:
        raise ValueError("Code panel title is too long")
    draw.text((x + 112, top + 13), code_title, font=font(25), fill=MUTED)
    yy = top + 86
    highlights = set(code.get("highlight_lines", []))
    diff_lines = set(code.get("diff_lines", []))
    for n, line in enumerate(lines, 1):
        if yy + line_h > bottom - 17:
            raise ValueError(f"Too many code lines ({len(lines)}); split into another scene")
        if width(draw, line, face) > panel_width - 50:
            raise ValueError(f"Code line is too wide at {size}px: {line!r}; split explicitly")
        color = INK
        if n in diff_lines and line.startswith("+"):
            color = GREEN
        elif n in diff_lines and line.startswith("-"):
            color = RED
        elif line.startswith(("$", ">")):
            color = CYAN
        elif line.startswith("#"):
            color = MUTED
        if n in highlights:
            draw.rounded_rectangle((x + 12, yy - 2, x + panel_width - 12, yy + line_h - 1), radius=5, fill="#1d3447")
        draw.text((x + 25, yy), line, font=face, fill=color)
        yy += line_h


def render_table(draw, scene, top):
    y = top
    for paragraph in body_lines(scene):
        y = prose(draw, paragraph, 80, y, W - 160, 31, MUTED) + 12
    y += 10
    table = scene["table"]
    columns = table["columns"]
    labels = [c if isinstance(c, str) else c["label"] for c in columns]
    weights = [1 if isinstance(c, str) else c.get("width", 1) for c in columns]
    table_width = W - 160
    col_widths = [table_width * item / sum(weights) for item in weights]
    rows = table["rows"]
    if not 1 <= len(rows) <= 9:
        raise ValueError("Tables require 1..9 rows; split larger comparisons across scenes")
    size = int(table.get("font_size", 31))
    if not 26 <= size <= 38:
        raise ValueError("table.font_size must be 26..38 for readability")
    face = font(size)
    headface = font(size, "bold")
    header_lines = [wrap(draw, label, headface, cw - 30) for label, cw in zip(labels, col_widths)]
    header_height = max(66, max(map(len, header_lines)) * (size + 7) + 28)
    row_lines = []
    row_heights = []
    for row in rows:
        if len(row) != len(labels):
            raise ValueError("Every table row must have one value per column")
        wrapped = [wrap(draw, value, face, cw - 30) for value, cw in zip(row, col_widths)]
        row_lines.append(wrapped)
        row_heights.append(max(58, max(map(len, wrapped)) * (size + 7) + 22))
    if y + header_height + sum(row_heights) > 963:
        raise ValueError("Table exceeds available height; reduce text or split the scene")
    draw.rounded_rectangle((80, y, W - 80, y + header_height), radius=12, fill="#243a4c")
    x = 80
    for lines, cw in zip(header_lines, col_widths):
        for j, line in enumerate(lines):
            draw.text((x + 16, y + 12 + j * (size + 7)), line, font=headface, fill=CYAN)
        x += cw
    y += header_height
    for i, (row, wrapped, rh) in enumerate(zip(rows, row_lines, row_heights)):
        draw.rectangle((80, y, W - 80, y + rh - 1), fill=PANEL if i % 2 == 0 else "#152437")
        x = 80
        for value, lines, cw in zip(row, wrapped, col_widths):
            status = str(value).strip().upper()
            color = GREEN if status in {"PASS", "PASSED"} else RED if status in {"FAIL", "FAILED"} else INK
            for j, line in enumerate(lines):
                draw.text((x + 16, y + 8 + j * (size + 7)), line, font=face, fill=color)
            x += cw
        y += rh


def render_scene(data, scene, index, elapsed, total):
    im = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(im)
    top = chrome(draw, data, scene, index, len(data["scenes"]), elapsed, total)
    if "table" in scene:
        render_table(draw, scene, top)
    else:
        has_code = "code" in scene
        body_width = 620 if has_code else 1650
        y = top + 8
        paragraphs = body_lines(scene)
        body_size = int(scene.get("body_font_size", 35 if has_code else 40))
        if not 30 <= body_size <= 48:
            raise ValueError("body_font_size must be 30..48 for readability")
        for paragraph in paragraphs:
            if len(paragraphs) > 1:
                draw.rounded_rectangle((80, y + 14, 86, y + 35), radius=2, fill=CYAN)
            y = prose(draw, paragraph, 106 if len(paragraphs) > 1 else 80, y, body_width, body_size) + 27
        if y > 963:
            raise ValueError(f"Scene {scene['id']}: body too long; split scene")
        if has_code:
            render_code(draw, scene["code"], 780, top, W - 860)
        if scene.get("callout"):
            if has_code:
                raise ValueError("callout is supported only in a full-width prose scene")
            callout_top = max(y + 22, 650)
            draw.rounded_rectangle((80, callout_top, W - 80, 944), radius=20, fill="#173d42")
            end = prose(draw, scene["callout"], 116, callout_top + 25, W - 232, 43, CYAN, bold=True)
            if end > 935:
                raise ValueError("callout overflows; use fewer words")
    return im


def srt_time(seconds):
    milliseconds = round(seconds * 1000)
    s, ms = divmod(milliseconds, 1000)
    minutes, sec = divmod(s, 60)
    hours, minute = divmod(minutes, 60)
    return f"{hours:02d}:{minute:02d}:{sec:02d},{ms:03d}"


def write_subtitles(scenes, destination):
    entries, elapsed = [], 0.0
    for scene in scenes:
        captions = scene.get("captions", [scene["title"]])
        if not captions:
            raise ValueError(f"Scene {scene['id']} has no captions")
        step = scene["duration"] / len(captions)
        previous_end = 0.0
        for i, caption in enumerate(captions):
            if isinstance(caption, str):
                start, end, value = step * i, step * (i + 1), caption
            else:
                start, end, value = caption["start"], caption["end"], caption["text"]
            if not 0 <= start < end <= scene["duration"] + 0.001 or start < previous_end:
                raise ValueError(f"Invalid or overlapping captions in {scene['id']}")
            previous_end = end
            entries.append(f"{len(entries) + 1}\n{srt_time(elapsed + start)} --> {srt_time(elapsed + end)}\n{value}\n")
        elapsed += scene["duration"]
    destination.write_text("\n".join(entries), encoding="utf-8")


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(command, records):
    completed = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    records.append({"command": command, "exit_code": completed.returncode, "stdout": completed.stdout, "stderr": completed.stderr})
    if completed.returncode:
        raise RuntimeError(f"Command failed ({completed.returncode}): {command[0]}\n{completed.stderr[-6000:]}")
    return completed


def concat_file(entries, path):
    def quote(p):
        return str(p.resolve()).replace("\\", "/").replace("'", "'\\''")
    content = ["ffconcat version 1.0"]
    for frame, duration in entries:
        content.extend([f"file '{quote(frame)}'", f"duration {duration:.6f}"])
    content.append(f"file '{quote(entries[-1][0])}'")
    path.write_text("\n".join(content) + "\n", encoding="utf-8")


def narration_track(data, base, output, ffmpeg, records):
    if not any(s.get("narration") for s in data["scenes"]):
        return None
    rate = 48000
    audio_path = output / "narration.wav"
    with tempfile.TemporaryDirectory(prefix="contextos-media-") as td, wave.open(str(audio_path), "wb") as target:
        target.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        for i, scene in enumerate(data["scenes"]):
            expected_samples = round(scene["duration"] * rate)
            samples = b""
            if scene.get("narration"):
                src = (base / scene["narration"]).resolve()
                normalized = Path(td) / f"{i}.wav"
                run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(src), "-ac", "1", "-ar", str(rate), "-c:a", "pcm_s16le", str(normalized)], records)
                with wave.open(str(normalized), "rb") as source:
                    samples = source.readframes(source.getnframes())
                if len(samples) // 2 > expected_samples:
                    raise ValueError(f"Narration exceeds scene {scene['id']} duration; increase duration (audio is never silently truncated)")
            target.writeframes(samples)
            target.writeframes(b"\0" * (2 * expected_samples - len(samples)))
    return audio_path


def contact_sheet(frames, scenes, path):
    columns = min(3, len(frames))
    cell_w, cell_h = 640, 398
    sheet = Image.new("RGB", (cell_w * columns, cell_h * math.ceil(len(frames) / columns)), "#172233")
    draw = ImageDraw.Draw(sheet)
    for i, (frame, scene) in enumerate(zip(frames, scenes)):
        x, y = (i % columns) * cell_w, (i // columns) * cell_h
        with Image.open(frame) as im:
            sheet.paste(im.resize((640, 360), Image.Resampling.LANCZOS), (x, y))
        draw.text((x + 12, y + 363), f"{i + 1:02d}  {scene['id']}  /  {scene['duration']:g}s", font=font(22), fill=INK)
    sheet.save(path)


def validate(data):
    scenes = data.get("scenes")
    if not isinstance(scenes, list) or not scenes:
        raise ValueError("scenes must be a nonempty array")
    seen = set()
    for scene in scenes:
        sid = scene.get("id", "")
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", sid) or sid in seen:
            raise ValueError(f"Scene id must be unique lowercase filename-safe text: {sid!r}")
        seen.add(sid)
        if not isinstance(scene.get("title"), str) or not scene["title"]:
            raise ValueError(f"Scene {sid} requires title")
        if not isinstance(scene.get("duration"), (int, float)) or not 0 < scene["duration"] <= 120:
            raise ValueError(f"Scene {sid}: duration must be >0 and <=120 seconds")
        if "code" in scene and "table" in scene:
            raise ValueError(f"Scene {sid}: choose code or table")
    return sum(scene["duration"] for scene in scenes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenes", type=Path)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--preview-only", action="store_true", help="PNG, contact sheet, SRT and manifest only")
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--prefix", default="contextos-readme-demo")
    args = parser.parse_args()
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", args.prefix):
        parser.error("--prefix must be filename-safe text")
    if args.fps < 1 or args.fps > 60:
        parser.error("--fps must be 1..60")
    source = args.scenes.resolve()
    data = json.loads(source.read_text(encoding="utf-8-sig"))
    duration = validate(data)
    output = args.out_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    frame_dir = output / "frames"
    frame_dir.mkdir(exist_ok=True)
    records, frames, elapsed = [], [], 0.0
    manifest = {"source": str(source), "source_sha256": sha256(source), "resolution": [W, H], "fps": args.fps, "duration_seconds": duration, "replay_label": "Replay of recorded runs", "scenes": [], "commands": records}
    manifest_path = output / "render-manifest.json"
    try:
        for i, scene in enumerate(data["scenes"]):
            frame = frame_dir / f"{i + 1:02d}-{scene['id']}.png"
            render_scene(data, scene, i, elapsed, duration).save(frame)
            frames.append(frame)
            entry = {"id": scene["id"], "start": elapsed, "end": elapsed + scene["duration"], "frame": str(frame.relative_to(output)), "frame_sha256": sha256(frame), "evidence": scene.get("evidence", [])}
            if scene.get("narration"):
                audio = (source.parent / scene["narration"]).resolve()
                entry.update({"narration": str(audio), "narration_sha256": sha256(audio)})
            manifest["scenes"].append(entry)
            elapsed += scene["duration"]
        write_subtitles(data["scenes"], output / f"{args.prefix}.srt")
        contact_sheet(frames, data["scenes"], output / "contact-sheet.png")
        concat = output / "video.ffconcat"
        concat_file(list(zip(frames, [s["duration"] for s in data["scenes"]])), concat)
        if not args.preview_only:
            ffmpeg = shutil.which("ffmpeg")
            if not ffmpeg:
                raise ValueError("ffmpeg not found on PATH; previews remain available")
            run([ffmpeg, "-version"], records)
            audio = narration_track(data, source.parent, output, ffmpeg, records)
            video_path = output / f"{args.prefix}.mp4"
            command = [ffmpeg, "-hide_banner", "-loglevel", "warning", "-y", "-f", "concat", "-safe", "0", "-i", str(concat)]
            if audio:
                command += ["-i", str(audio), "-c:a", "aac", "-b:a", "128k"]
            command += ["-vf", f"fps={args.fps},format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-threads", "4", "-t", str(duration), "-movflags", "+faststart", str(video_path)]
            run(command, records)
            gif = data.get("gif", {})
            segments = gif.get("segments")
            if not segments:
                indices = sorted(set(round(i * (len(frames) - 1) / 4) for i in range(5)))
                segments = [{"scene": data["scenes"][i]["id"], "duration": 28 / len(indices)} for i in indices]
            mapping = dict(zip([s["id"] for s in data["scenes"]], frames))
            if any(s["scene"] not in mapping or s["duration"] <= 0 for s in segments):
                raise ValueError("GIF segments require existing scene IDs and positive durations")
            gif_duration = sum(s["duration"] for s in segments)
            if not 25 <= gif_duration <= 30:
                raise ValueError("GIF duration must be 25..30 seconds")
            gif_width, gif_fps = int(gif.get("width", 960)), int(gif.get("fps", 12))
            if not 640 <= gif_width <= W or not 1 <= gif_fps <= 30:
                raise ValueError("GIF width must be 640..1920; fps must be 1..30")
            gif_concat = output / "gif.ffconcat"
            concat_file([(mapping[s["scene"]], s["duration"]) for s in segments], gif_concat)
            gif_path = output / f"{args.prefix}.gif"
            run([ffmpeg, "-hide_banner", "-loglevel", "warning", "-y", "-f", "concat", "-safe", "0", "-i", str(gif_concat), "-filter_complex", f"fps={gif_fps},scale={gif_width}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3", "-t", str(gif_duration), "-loop", "0", str(gif_path)], records)
            manifest["gif"] = {"duration_seconds": gif_duration, "segments": segments, "width": gif_width, "fps": gif_fps}
            manifest["outputs"] = {p.name: {"bytes": p.stat().st_size, "sha256": sha256(p)} for p in [video_path, gif_path, output / f"{args.prefix}.srt"]}
            ffprobe = shutil.which("ffprobe")
            if ffprobe:
                for media in [video_path, gif_path]:
                    probe = run([ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height,duration,nb_frames", "-of", "json", str(media)], records)
                    manifest.setdefault("probe", {})[media.name] = json.loads(probe.stdout)
        manifest["status"] = "preview complete" if args.preview_only else "render complete"
        print(json.dumps({"status": manifest["status"], "output": str(output), "duration_seconds": duration, "scenes": len(frames)}, indent=2))
    except Exception as error:
        manifest["status"] = "failed"
        manifest["error"] = str(error)
        raise
    finally:
        manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
