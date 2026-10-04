"""Render the monochrome README story from the existing local CLI capture.

python scripts/readme-gif/render_story.py [--preview-only]
No commands, models, package operations or network requests are run by this file.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from render import font

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
WIDTH, HEIGHT, SCALE, FPS, SECONDS = 1120, 630, 2, 20, 19
BACKGROUND = "#0d1117"
WHITE = "#f0ede6"
GRAY = "#a3a5a8"
DIM = "#686c73"
LINE = "#30363d"
AMBER = "#e6c28b"
GREEN = "#a3c9ad"
STILLS = [(1.3, "hook"), (4.1, "source"), (8.1, "drift"),
          (10.6, "promise"), (13.3, "export"), (16.7, "pass")]


def progress(value):
    return max(0.0, min(1.0, value))


def ease(value):
    p = progress(value)
    return p*p*(3-2*p)


def type_text(value, t, start, duration):
    return value[:math.ceil(len(value)*progress((t-start)/duration))]


def rgb(value):
    return tuple(int(value[i:i+2],16) for i in (1,3,5))


def blend_color(a, b, amount):
    return tuple(round(x+(y-x)*progress(amount)) for x,y in zip(rgb(a),rgb(b)))


class Canvas:
    def __init__(self):
        self.image = Image.new("RGB", (WIDTH*SCALE, HEIGHT*SCALE), BACKGROUND)
        self.draw = ImageDraw.Draw(self.image)

    def text(self, x, y, value, size=28, color=WHITE, kind="sans", anchor=None):
        self.draw.text((round(x*SCALE),round(y*SCALE)),value,font=font(size,kind),fill=color,anchor=anchor)

    def width(self, value, size=28, kind="sans"):
        return self.draw.textlength(value,font=font(size,kind))/SCALE

    def line(self, points, color=LINE, width=1):
        self.draw.line([(round(x*SCALE),round(y*SCALE)) for x,y in points], fill=color,
                       width=round(width*SCALE), joint="curve")

    def rectangle(self, box, fill, radius=0):
        box = tuple(round(v*SCALE) for v in box)
        self.draw.rounded_rectangle(box,radius=radius*SCALE,fill=fill)

    def command(self, y, command, t, start, duration=.75):
        shown = type_text(command,t,start,duration)
        if t < start:
            return
        self.text(84,y,"$",27,DIM,"mono")
        self.text(118,y,shown,27,WHITE,"mono")
        if t < start+duration+.13:
            x=118+self.width(shown,27,"mono")+3
            self.rectangle((x,y+5,x+2,y+31),WHITE)

    def done(self):
        return self.image.resize((WIDTH,HEIGHT),Image.Resampling.LANCZOS)


def hook(t):
    c=Canvas()
    c.text(WIDTH/2,204,"One rule changed.",64,WHITE,"bold","ma")
    c.text(WIDTH/2,292,"Three configs fell behind.",48,GRAY,"sans","ma")
    # A single quiet row makes the abstract "configs" concrete without turning
    # the opening into an integration dashboard or repeating the README brand.
    c.text(WIDTH/2,405,"Cursor   /   Claude   /   Codex",22,DIM,"mono","ma")
    return c.done()


def source_and_drift(t, evidence):
    c=Canvas()
    c.text(82,47,"Change the rule once.",43,WHITE,"bold")
    c.text(84,128,".agents/project/skills/team-auth/SKILL.md",21,GRAY,"mono")
    c.line([(84,169),(1036,169)])
    c.text(100,190,"# Team security",26,DIM,"mono")
    c.text(100,239,"- Never log authorization headers.",29,GRAY,"mono")

    if t>=3.15:
        strength=ease((t-3.15)/.22)
        c.rectangle((84,287,1036,334),blend_color(BACKGROUND,"#181d24",strength),4)
        c.rectangle((84,287,86,334),blend_color(BACKGROUND,WHITE,strength))
        line=type_text("- Never log session tokens.",t,3.17,.90)
        c.text(100,294,line,29,WHITE,"mono")
        if t<4.22 and int(t*4)%2==0:
            x=100+c.width(line,29,"mono")+3
            c.rectangle((x,300,x+2,326),WHITE)

    # Keep the actual edit in place while the CLI inspects the now-stale exports.
    # These are excerpts from the recorded commands, not a fabricated shell.
    c.line([(84,367),(1036,367)])
    c.command(389,"contextos compile",t,4.35,.55)
    c.command(433,"contextos export all --check --json",t,5.18,.84)
    if t>=6.30:
        c.text(118,493,'"status": "drift",',27,AMBER,"mono")
        c.text(118,537,'"hasDrift": true,',27,AMBER,"mono")
        c.text(1034,496,"exit 1",22,AMBER,"mono","ra")
    return c.done()


def promise(t):
    c=Canvas()
    c.text(WIDTH/2,221,"One source.",64,WHITE,"bold","ma")
    c.text(WIDTH/2,310,"Every export in sync.",49,GRAY,"sans","ma")
    return c.done()


def refresh(t, evidence):
    c=Canvas()
    c.text(82,57,"Export. Check.",45,WHITE,"bold")
    c.line([(84,130),(1036,130)])
    c.command(173,"contextos export all",t,11.95,.73)
    if t>=12.93:
        c.text(118,228,"All exports complete …",27,GRAY,"mono")
    c.command(319,"contextos export all --check --json",t,13.72,.93)
    if t>=14.98:
        c.text(118,381,'"status": "pass",',29,GREEN,"mono")
        c.text(118,430,'"totalFindings": 0,',29,WHITE,"mono")
        c.text(1034,383,"exit 0",22,GREEN,"mono","ra")
        c.line([(84,508),(1036,508)])
        c.text(84,544,"Cursor   /   Claude   /   Codex",22,GRAY,"mono")
        c.text(1036,540,"in sync",26,GREEN,"bold","ra")
    return c.done()


def transition(a,b,p,distance=16):
    """A brief upward motion accompanies the dissolve; the page never blanks."""
    p=ease(p)
    def offset(image,y):
        result=Image.new("RGB",(WIDTH,HEIGHT),BACKGROUND)
        result.paste(image,(0,round(y)))
        return result
    return Image.blend(offset(a,-distance*p),offset(b,distance*(1-p)),p)


def frame(t,evidence):
    if t<2.30:
        return hook(t)
    if t<2.72:
        return transition(hook(t),source_and_drift(t,evidence),(t-2.30)/.42)
    if t<9.42:
        return source_and_drift(t,evidence)
    if t<9.84:
        return transition(source_and_drift(t,evidence),promise(t),(t-9.42)/.42)
    if t<11.44:
        return promise(t)
    if t<11.86:
        return transition(promise(t),refresh(t,evidence),(t-11.44)/.42)
    if t<18.55:
        return refresh(t,evidence)
    return transition(refresh(18.55,evidence),hook(0),(t-18.55)/.45,distance=0)


def validate_evidence(evidence_dir):
    summary=json.loads((evidence_dir/"summary.json").read_text(encoding="utf-8"))
    commands={c["id"]:c for c in json.loads((evidence_dir/"commands.json").read_text(encoding="utf-8"))}
    assert commands["compile-after"]["exitCode"]==0
    assert commands["check-stale"]["exitCode"]==1
    stale=json.loads(commands["check-stale"]["stdout"])
    assert stale["status"]=="drift" and stale["hasDrift"] is True
    paths={item.get("path") for item in stale["findings"]["STALE_INPUT"]}
    assert {artifact["path"] for artifact in summary["artifacts"]}.issubset(paths)
    assert commands["export-after"]["exitCode"]==0
    assert "All exports complete" in commands["export-after"]["stdout"]
    fresh=json.loads(commands["check-fresh"]["stdout"])
    assert commands["check-fresh"]["exitCode"]==0 and fresh["status"]=="pass" and fresh["totalFindings"]==0
    before=(evidence_dir/"source-before.md").read_text(encoding="utf-8")
    after=(evidence_dir/"source-after.md").read_text(encoding="utf-8")
    assert "- Never log authorization headers." in before
    assert "- Never log session tokens." not in before
    assert "- Never log session tokens." in after
    return summary


def contact_sheet(stills):
    sheet=Image.new("RGB",(1120,1005),BACKGROUND)
    d=ImageDraw.Draw(sheet)
    for i,((t,name),image) in enumerate(stills):
        x,y=(i%2)*560,(i//2)*335
        sheet.paste(image.resize((560,315),Image.Resampling.LANCZOS),(x,y))
        d.text((x+14,y+316),f"{t:.1f}s / {name}",fill=DIM)
    return sheet


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview-only",action="store_true")
    parser.add_argument("--out",type=Path,default=REPO/"assets/contextos-story.gif")
    parser.add_argument("--evidence",type=Path,default=HERE/"evidence")
    args=parser.parse_args()
    evidence=validate_evidence(args.evidence)
    preview=HERE/"preview"
    preview.mkdir(exist_ok=True)
    stills=[]
    for t,name in STILLS:
        image=frame(t,evidence)
        image.save(preview/f"story-draft-{name}.png")
        image.resize((850,478),Image.Resampling.LANCZOS).save(preview/f"story-draft-{name}-850.png")
        stills.append(((t,name),image))
    contact_sheet(stills).save(preview/"story-draft-contact.png")
    print(f"Preview: {preview/'story-draft-contact.png'}",flush=True)
    if args.preview_only:
        return

    palette_source=Image.new("RGB",(WIDTH,HEIGHT*len(stills)))
    for i,(_,image) in enumerate(stills):
        palette_source.paste(image,(0,i*HEIGHT))
    adaptive=palette_source.quantize(colors=112,method=Image.Quantize.MEDIANCUT)
    reserved=[BACKGROUND,WHITE,GRAY,DIM,LINE,AMBER,GREEN,"#181d24"]
    colors=[ch for color in reserved for ch in rgb(color)]+adaptive.getpalette()[:112*3]
    colors += [0]*(768-len(colors))
    palette=Image.new("P",(1,1))
    palette.putpalette(colors)
    frames=[]
    for i in range(FPS*SECONDS):
        image=frame(i/FPS,evidence).quantize(palette=palette,dither=Image.Dither.NONE)
        frames.append(image)
        if i%(4*FPS)==0:
            print(f"Rendered {i/FPS:.0f}/{SECONDS}s",flush=True)
    frames[0].save(args.out,save_all=True,append_images=frames[1:],duration=1000//FPS,
                   loop=0,optimize=False,disposal=1)
    digest=hashlib.sha256(args.out.read_bytes()).hexdigest()
    prefix=f"story-{digest[:8]}"
    decoded=[]
    checks=[]
    with Image.open(args.out) as gif:
        clock=0
        targets=iter(STILLS)
        target=next(targets,None)
        for i in range(gif.n_frames):
            gif.seek(i)
            duration=gif.info.get("duration",0)
            while target and clock <= target[0]*1000 < clock+duration:
                actual=gif.convert("RGB")
                expected=frame(target[0],evidence).quantize(palette=palette,dither=Image.Dither.NONE).convert("RGB")
                assert ImageChops.difference(actual,expected).getbbox() is None,f"GIF decode mismatch at {target[0]}s"
                checks.append({"seconds":target[0],"exactQuantizedSourceMatch":True})
                actual.resize((850,478),Image.Resampling.LANCZOS).save(preview/f"{prefix}-{target[1]}-850.png")
                if target[1]=="hook":
                    actual.save(preview/f"{prefix}-poster.png")
                    actual.save(args.out.with_name(args.out.stem+"-poster.png"))
                decoded.append((target,actual))
                target=next(targets,None)
            clock+=duration
        assert gif.size==(WIDTH,HEIGHT) and clock==SECONDS*1000
        stats={"width":WIDTH,"height":HEIGHT,"durationMs":clock,"nominalFps":FPS,
               "uniqueFrames":gif.n_frames,"bytes":args.out.stat().st_size,"sha256":digest,
               "background":BACKGROUND,"decodedReferenceChecks":checks,
               "evidence":"scripts/readme-gif/evidence/commands.json",
               "scope":"Reconstructed local CLI workflow. Output excerpts and editorial timing; no client/model claims."}
    contact_sheet(decoded).save(preview/f"{prefix}-contact.png")
    (HERE/"story-manifest.json").write_text(json.dumps(stats,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(stats,indent=2),flush=True)
    print(f"Final previews: {preview/prefix}*",flush=True)


if __name__=="__main__":
    main()
