"""Copy a reviewable, credential-free local evidence bundle; does not upload anything."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import zipfile

HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--work',type=Path,required=True)
a=p.parse_args(); w=a.work.resolve(); out=HERE/'evidence'
out.mkdir(exist_ok=True)
def scrub(text):
    # Only machine-specific path labels are replaced. Original bytes stay in work.
    text=text.replace(str(w),'[LOCAL_DEMO_WORK]').replace(str(w).replace('\\','\\\\'),'[LOCAL_DEMO_WORK]')
    text=text.replace(str(HERE.parents[1]),'[REPOSITORY]').replace(str(HERE.parents[1]).replace('\\','\\\\'),'[REPOSITORY]')
    text=re.sub(r'C:(?:\\\\|\\)Users(?:\\\\|\\)esenb','[USER_HOME]',text,flags=re.I)
    if re.search(r'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}',text):
        raise ValueError('Possible secret; evidence assembly stopped')
    return text
def copytext(src,dst):
    dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_text(scrub(src.read_text(encoding='utf-8')),encoding='utf-8')
for name in ('commands.json','preparation.json','rule-created.json'):
    copytext(w/'prepared-v3/evidence'/name,out/'setup'/name)
copytext(w/'prepared/evidence/commands.json',out/'setup/failed-esm-bootstrap.json')
for f in (w/'drift/evidence').iterdir():
    if f.is_file():copytext(f,out/'drift'/f.name)
for id in ('A0','B0','C0'):
    request=json.loads((w/'exact-capture'/id/'request-1.json').read_text(encoding='utf-8'))
    copytext(w/'exact-capture'/id/'request-1.json',out/'isolation'/f'{id}-request.json')
    copytext(w/'exact-capture'/id/'launch.json',out/'isolation'/f'{id}-launch.json')
    copytext(w/'exact-capture'/id/'summary.json',out/'isolation'/f'{id}-summary.json')
copytext(w/'loader-probe-v2/summary.json',out/'isolation/offline-probe-summary.json')
copytext(w/'loader-probe-v2/image-inspect.json',out/'isolation/image-inspect.json')
copytext(w/'results.json',HERE/'results.json')
order=json.loads((w/'series/series.json').read_text(encoding='utf-8'))['order']
for id in order:
    run=w/'series'/id; ev=w/'evaluations'/id
    if not (run/'summary.json').exists():continue
    for filename in ('events.jsonl','event-timestamps.jsonl','changes.diff','status.txt','launch.json','stderr.txt'):
        if (run/filename).exists():copytext(run/filename,out/'runs'/id/filename)
    for filename in ('evaluation.json','independent-cases.json','agent-tests-final.stdout.txt','agent-tests-baseline.stdout.txt'):
        if (ev/filename).exists():copytext(ev/filename,out/'runs'/id/filename)
    for part in ('src','test','tests'):
        if (run/'result'/part).exists():
            for file in (run/'result'/part).rglob('*'):
                if file.is_file():copytext(file,out/'runs'/id/'result'/file.relative_to(run/'result'))
    # Full request/response bodies are kept in a local audit archive, never headers.
with zipfile.ZipFile(out/'recorded-transport.zip','w',zipfile.ZIP_DEFLATED) as z:
    for id in order:
        run=w/'series'/id
        for pattern in ('request-*.json','response-*.sse','summary.json'):
            for file in run.glob(pattern):z.writestr(f'{id}/{file.name}',scrub(file.read_text(encoding='utf-8')))
    z.writestr('README.txt','Native Codex request/response transport. No headers or API credentials are recorded. Machine-specific host paths are labelled. The guard legacy field invoiceCostKnown denotes available cache-write usage only, not an invoice. See results.json and REPORT.md for correctly labelled token-rate estimates. Original unmodified files remain in the private local work folder.\n')
manifest=[]
for file in sorted(out.rglob('*')):
    if file.is_file() and file.name!='manifest.json':
        manifest.append({'path':file.relative_to(out).as_posix(),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(out/'manifest.json').write_text(json.dumps({'machinePathRedaction':True,'files':manifest},indent=2),encoding='utf-8')
print(f'Assembled {len(manifest)} evidence files at {out}')
