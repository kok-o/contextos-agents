"""Record source-edit -> stale exports -> refreshed exports, without model calls."""
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--project',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args()
if a.out.exists(): raise SystemExit('Choose a fresh output directory')
shutil.copytree(a.project,a.out/'project',ignore=shutil.ignore_patterns('.git'))
e=a.out/'evidence';e.mkdir()
commands=[]
npx=shutil.which('npx.cmd') or shutil.which('npx')
def run(args,expected):
    t=time.monotonic(); start=dt.datetime.now(dt.timezone.utc).isoformat()
    r=subprocess.run([npx,'--no-install','contextos',*args],cwd=a.out/'project',capture_output=True,text=True,encoding='utf-8',timeout=120)
    commands.append({'argv':['npx','--no-install','contextos',*args],'startedUtc':start,'durationMs':round((time.monotonic()-t)*1000),'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr})
    (e/'commands.json').write_text(json.dumps(commands,indent=2),encoding='utf-8')
    print(' '.join(args),'exit',r.returncode,flush=True)
    assert r.returncode==expected, r.stderr
    return r
run(['export','all','--check','--json'],0)
source=a.out/'project/.agents/project/skills/team-order/SKILL.md'
before=source.read_text(encoding='utf-8')
source.write_text(before+'\n- Reject normalized item names longer than 80 characters.\n',encoding='utf-8')
(e/'source-before.md').write_text(before,encoding='utf-8')
shutil.copyfile(source,e/'source-after.md')
run(['compile'],0)
stale=run(['export','all','--check','--json'],1)
run(['export','all'],0)
fresh=run(['export','all','--check','--json'],0)
(e/'summary.json').write_text(json.dumps({'sourceSha256Before':hashlib.sha256(before.encode()).hexdigest(),
    'sourceSha256After':hashlib.sha256(source.read_bytes()).hexdigest(),'stale':json.loads(stale.stdout),'fresh':json.loads(fresh.stdout),
    'codeChanged':False,'newClientRun':False,'scope':'Export consistency only. The new 80-character rule is not implemented in application code.'},indent=2),encoding='utf-8')
