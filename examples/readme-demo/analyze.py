"""Join frozen evaluation and native client evidence; never infer absent telemetry."""
import argparse
import hashlib
import json
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--series',type=Path,required=True)
p.add_argument('--evaluations',type=Path,required=True)
p.add_argument('--out',type=Path,required=True)
a=p.parse_args()
def read(p): return p.read_text(encoding='utf-8')
def load(p): return json.loads(read(p))
def strings(v):
    if isinstance(v,str): return v
    if isinstance(v,list): return '\n'.join(strings(x) for x in v)
    if isinstance(v,dict): return '\n'.join(strings(x) for x in v.values())
    return ''
def digest(s): return hashlib.sha256(s.encode()).hexdigest()
here=Path(__file__).resolve().parent
body=read(here/'team-order/SKILL.md').split('---',2)[2].strip().replace('\r\n','\n')
series=load(a.series/'series.json')
rows=[]
for run_id in series['order']:
    root=a.series/run_id
    if not (root/'summary.json').exists():
        rows.append({'id':run_id,'condition':run_id[0],'status':'NOT RUN'})
        continue
    summary=load(root/'summary.json')
    events=[json.loads(l) for l in read(root/'events.jsonl').splitlines() if l.strip()]
    requests=[load(f) for f in sorted(root.glob('request-*.json'),key=lambda f:int(f.stem.split('-')[-1]))]
    first=requests[0]['body'] if requests else {}
    initial=strings(first).replace('\r\n','\n')
    reads=[]
    loaded={}
    native_docs={}
    if (root/'initial/.agents/skills').exists():
        for doc in (root/'initial/.agents/skills').glob('*/SKILL.md'):
            s=read(doc).replace('\r\n','\n')
            native_docs[doc.parent.name]=s.split('---',2)[2].strip() if s.startswith('---') else s.strip()
    for i,e in enumerate(events):
        it=e.get('item',{})
        if e['type']!='item.completed' or it.get('type')!='command_execution' or it.get('exit_code')!=0: continue
        output=it.get('aggregated_output','').replace('\r\n','\n')
        command=it.get('command','')
        if body in output:
            reads.append({'eventIndex':i,'command':command,'exitCode':0,'fullBodyContained':True,
                          'nativePathInCommand':'.agents/skills/team-order/SKILL.md' in command})
        for name,text in native_docs.items():
            if text and text in output:loaded.setdefault(name,[]).append(i)
    if run_id[0]=='A':loading='N/A'
    elif run_id[0]=='B':loading='native AGENTS body injected' if body in initial else 'NOT VERIFIED'
    else:loading='native skill body read' if any(x['nativePathInCommand'] for x in reads) else ('body read; routing unverified' if reads else 'NOT VERIFIED')
    usage=[x.get('usage') for x in summary['calls']]
    usage_complete=bool(usage) and all(isinstance(x,dict) and 'input_tokens' in x and 'output_tokens' in x for x in usage)
    tokens={'input':sum(x['input_tokens'] for x in usage),'cachedInput':sum(x.get('input_tokens_details',{}).get('cached_tokens',0) for x in usage),'output':sum(x['output_tokens'] for x in usage)} if usage_complete else None
    charges=[x.get('charge') for x in summary['calls']]
    cost=sum(x['standardRateEstimateUsd'] for x in charges) if charges and all(charges) else None
    evpath=a.evaluations/run_id/'evaluation.json';ev=load(evpath) if evpath.exists() else None
    row={'id':run_id,'condition':run_id[0],'status':'COMPLETE' if summary['exitCode']==0 and not summary['timedOut'] and any(e['type']=='turn.completed' for e in events) else 'ERROR/INCOMPLETE',
         'clientExitCode':summary['exitCode'],'timedOut':summary['timedOut'],'wallSeconds':round(summary['elapsedMs']/1000,3),
         'requests':len(summary['calls']),'tokens':tokens,'tokenRateEstimateUsd':cost,'invoiceCost':'not measured',
         'initialContext':{'hasContextOS':'ContextOS' in initial,'hasTeamMetadata':'team-order' in initial,'hasFullTeamBody':body in initial,
                           'builtInInstructionsSha256':digest(str(first.get('instructions'))),'toolDefinitionsSha256':digest(json.dumps(first.get('tools'),sort_keys=True))},
         'teamLoading':loading,'teamReadEvidence':reads,'loadedNativeBodies':loaded,
         'independent':ev['independent']['summary'] if ev else None,'usefulRegression':ev['agentTests']['usefulRegression'] if ev else None,
         'agentTests':{'count':ev['agentTests']['final'].get('tests'),'exitCode':ev['agentTests']['final']['exitCode']} if ev else None,
         'scope':ev['scope'] if ev else None}
    rows.append(row)
report={'schemaVersion':1,'candidate':'published contextos-agents@2.3.1','model':series['model'],'reasoning':series['effort'],
        'order':series['order'],'runs':rows,'limitations':['One task, three repetitions per arm; no general superiority claim.',
        'A has less team information. B/C delivery differs; resolver is not isolated.',
        'Token-rate estimates are not invoices. Initial metadata is not skill-body loading.',
        'Drift checks validate exported configuration, not application behavior.']}
a.out.parent.mkdir(parents=True,exist_ok=True)
a.out.write_text(json.dumps(report,indent=2),encoding='utf-8')
for r in rows: print(r['id'],r['status'],r.get('independent'),r.get('teamLoading'))
