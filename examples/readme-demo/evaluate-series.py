"""Evaluate completed runs in offline containers, with no credentials or inference."""
import argparse
import json
from pathlib import Path
import subprocess

HERE=Path(__file__).resolve().parent
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--series',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
p.add_argument('--image',default='contextos-readme-demo:20261004')
a=p.parse_args()
if a.out.exists(): raise SystemExit('Choose a fresh evaluation output')
a.out.mkdir(parents=True)
order=json.loads((a.series/'series.json').read_text())['order']
reports=[]
for run_id in order:
    run=a.series/run_id
    if not (run/'summary.json').exists():
        reports.append({'id':run_id,'status':'not completed / no recorded summary'})
        continue
    out=a.out/run_id;out.mkdir()
    mounts=[(HERE/'evaluator','/evaluator',True),(HERE/'fixture','/baseline',True),
            (run/'result','/candidate',True),(run/'initial','/initial',True),(out,'/out',False)]
    cmd=['docker','run','--rm','--network','none','--security-opt','no-new-privileges','--memory','1g','--pids-limit','128']
    for src,dst,readonly in mounts:
        cmd+=['--mount',f'type=bind,source={src.resolve()},target={dst}'+(',readonly' if readonly else '')]
    cmd += [a.image,'node','/evaluator/evaluate.mjs','--project','/candidate','--baseline','/baseline','--initial','/initial','--out','/out']
    r=subprocess.run(cmd,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=120)
    (out/'driver.json').write_text(json.dumps({'argv':cmd,'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2))
    reports.append({'id':run_id,'driverExitCode':r.returncode,'evaluation':json.loads((out/'evaluation.json').read_text()) if (out/'evaluation.json').exists() else None})
    (a.out/'all-evaluations.json').write_text(json.dumps(reports,indent=2))
    print(run_id,r.returncode,r.stdout.strip()[:450],flush=True)
