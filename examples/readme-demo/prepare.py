"""Prepare three instruction conditions and record real ContextOS commands. No model calls."""
import argparse
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
import shutil
import subprocess
import time

HERE = Path(__file__).resolve().parent

def sha(data):
    return hashlib.sha256(data).hexdigest()

def inventory(root):
    return {p.relative_to(root).as_posix(): sha(p.read_bytes()) for p in sorted(root.rglob('*'))
            if p.is_file() and not set(p.relative_to(root).parts) & {'node_modules', '.git'}}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    if out.exists():
        raise SystemExit('Refusing to overwrite preparation: choose a fresh --out directory')
    out.mkdir(parents=True)
    evidence = out / 'evidence'
    evidence.mkdir()
    commands = []
    def run(argv, cwd, expected=0):
        started = dt.datetime.now(dt.timezone.utc).isoformat()
        t = time.monotonic()
        r = subprocess.run(argv, cwd=cwd, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
        record = {'index':len(commands)+1,'argv':argv,'cwd':str(cwd),'startedUtc':started,
                  'durationMs':round((time.monotonic()-t)*1000),'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr}
        commands.append(record)
        (evidence / 'commands.json').write_text(json.dumps(commands,indent=2),encoding='utf-8')
        print(f"[{record['index']}] {' '.join(argv)} -> {r.returncode}",flush=True)
        if expected is not None and r.returncode != expected:
            raise RuntimeError(record)
        return r
    npm = shutil.which('npm.cmd') or shutil.which('npm')
    npx = shutil.which('npx.cmd') or shutil.which('npx')
    registry = json.loads(run([npm,'view','contextos-agents@2.3.1','version','dist.integrity','dist.tarball','--json'],out).stdout)
    packed = json.loads(run([npm,'pack','contextos-agents@2.3.1','--ignore-scripts','--json'],out).stdout)[0]
    archive = out / packed['filename']
    for condition in ('A','B','C'):
        shutil.copytree(HERE/'fixture',out/condition)
        run(['git','init','--quiet'],out/condition)
        run(['git','config','core.autocrlf','false'],out/condition)
    c = out/'C'
    run([npm,'install','--save-dev','--save-exact','--ignore-scripts','contextos-agents@2.3.1'],c)
    run([npx,'--no-install','contextos','--version'],c)
    # Published 2.3.1's init auto-export executes a copied CommonJS .js under
    # the consumer's ESM package scope. The supported skip flag avoids that
    # bootstrap subprocess; subsequent commands execute the installed CLI.
    run([npx,'--no-install','contextos','init','--minimal','--skip-compile'],c)
    run([npx,'--no-install','contextos','skill','add','typescript'],c)
    target = c/'.agents/project/skills/team-order'
    shutil.copytree(HERE/'team-order',target)
    (evidence/'rule-created.json').write_text(json.dumps({'action':'copy prepared project skill','from':'team-order',
        'to':'.agents/project/skills/team-order','files':inventory(target)},indent=2),encoding='utf-8')
    run([npx,'--no-install','contextos','compile'],c)
    run([npx,'--no-install','contextos','resolve','Implement @team-order TypeScript normalization','--files','src/order.ts','--explain'],c)
    run([npx,'--no-install','contextos','resolve','Implement @team-order TypeScript normalization','--files','src/order.ts','--json'],c)
    run([npx,'--no-install','contextos','export','all'],c)
    run([npx,'--no-install','contextos','export','all','--check','--json'],c)
    # B has identical available skill bytes/resources, but a manual root index and
    # always-loaded team rule instead of native skill discovery. No ContextOS code.
    shutil.copytree(c/'.agents/skills',out/'B/team-guidance/skills')
    shutil.copy2(c/'.agents/AGENTS.md',out/'B/team-guidance/project-instructions.md')
    rule = (target/'SKILL.md').read_text(encoding='utf-8').split('---',2)[2].strip()
    index = ['# Manual project guidance','',rule,'','## Additional available guidance','',
             'Read the relevant instruction documents when their descriptions apply.','']
    for entry in sorted((out/'B/team-guidance/skills').glob('*/SKILL.md')):
        txt=entry.read_text(encoding='utf-8')
        match=re.search(r'^description: *([^\n]*)\n((?:[ \t]+[^\n]*\n)*)',txt,re.M)
        desc=(match.group(2).strip() if match.group(1).strip() in ('>','>-','|','|-') else match.group(1).strip()) if match else ''
        desc=' '.join(desc.split())
        index.append(f"- {entry.parent.name}: {desc} ({entry.relative_to(out/'B').as_posix()})")
    index += ['','Project instruction reference: team-guidance/project-instructions.md','']
    (out/'B/AGENTS.md').write_text('\n'.join(index),encoding='utf-8')
    parity={p.relative_to(c/'.agents/skills').as_posix():sha(p.read_bytes()) for p in (c/'.agents/skills').rglob('*') if p.is_file()}
    for rel,digest in parity.items():
        assert sha((out/'B/team-guidance/skills'/rel).read_bytes())==digest
    for condition in ('A','B','C'):
        run(['git','add','--all'],out/condition)
        run(['git','-c','user.name=Demo Fixture','-c','user.email=demo@example.invalid','commit','--quiet','-m','Frozen demo starting state'],out/condition)
    manifest={'preparedUtc':dt.datetime.now(dt.timezone.utc).isoformat(),'candidate':'published npm package',
        'registry':registry,'archive':{'filename':archive.name,'sha256':sha(archive.read_bytes()),'npmIntegrity':packed['integrity']},
        'fixture':inventory(HERE/'fixture'),'taskSha256':sha((HERE/'task.txt').read_bytes()),
        'conditions':{x:inventory(out/x) for x in ('A','B','C')},'manualNativeDocumentParity':parity,
        'node':run(['node','--version'],out).stdout.strip(),
        'repositoryRevision':run(['git','rev-parse','HEAD'],HERE,expected=None).stdout.strip() or 'unavailable (standalone copy)'}
    (evidence/'preparation.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    print(f'Prepared conditions and evidence in {out}')

if __name__ == '__main__':
    main()
