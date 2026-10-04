#!/usr/bin/env node
'use strict';
// Native Codex in separate Docker containers. The host-only proxy holds the key
// and applies the existing repository's conservative prepaid reservation guard.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const {Budget, reservation} = require('../../../benchmarks/luna/spending');

const argv=process.argv.slice(2);
function arg(name,fallback){const i=argv.indexOf(name);return i<0?fallback:argv[i+1];}
const prepared=path.resolve(arg('--prepared',''));
const out=path.resolve(arg('--out',''));
const paid=argv.includes('--run-authorized');
const image=arg('--image','contextos-readme-demo:20261004');
const model='gpt-6.1-sol', effort='medium';
const here=path.resolve(__dirname,'..');
const prompt=fs.readFileSync(path.join(here,'task.txt'),'utf8').trim();
const limit=Number(arg('--limit-usd','0'));
if(!arg('--prepared') || !arg('--out')) throw Error('--prepared and --out required');
if(paid && (!Number.isFinite(limit)||limit<=0||limit>5)) throw Error('Explicit approved budget up to USD 5 required');
if(fs.existsSync(out)) throw Error('Output exists; refusing to overwrite attempts');
fs.mkdirSync(out,{recursive:true});
const key=paid ? (process.env.OPENAI_API_KEY || (arg('--auth-file') ? JSON.parse(fs.readFileSync(arg('--auth-file'),'utf8')).OPENAI_API_KEY : null)) : null;
if(paid && !key) throw Error('Host-only OPENAI_API_KEY or --auth-file is required');
const budget=paid ? new Budget(path.join(out,'spend-ledger.json'),{limitUsd:limit}):null;
const token=crypto.randomBytes(32).toString('hex');
const json=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2));
const redact=value=>String(value).split(token).join('[LOCAL_PROXY_TOKEN]').replace(/\bsk-[A-Za-z0-9_-]+/g,'[REDACTED]');
function command(args,options={}) {
  const r=spawnSync(args[0],args.slice(1),{encoding:'utf8',windowsHide:true,maxBuffer:30*1024*1024,timeout:180000,...options});
  if(r.status!==0) throw Error(redact(`Command failed: ${args.join(' ')}\n${r.stderr}\n${r.stdout}`));
  return r.stdout;
}
const unbilled=t=>['function','custom'].includes(t.type)||(t.type==='namespace'&&(t.tools||[]).every(unbilled));
let active=null,busy=false;
function completed(text){for(const l of text.split(/\r?\n/).reverse())if(l.startsWith('data: ')){try{const e=JSON.parse(l.slice(6));if(e.type==='response.completed')return e.response;}catch{}}return null;}
const server=http.createServer(async(req,res)=>{
  if(!active||busy||req.method!=='POST'||req.url!=='/v1/responses'||req.headers.authorization!==`Bearer ${token}`){res.writeHead(403);res.end('Refused');return;}
  busy=true;
  const run=active;
  let ticket,record;
  try{
    let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>190000)throw Error('Request too large');}
    const body=JSON.parse(raw);
    if(body.model!==model || !(body.tools||[]).every(unbilled)) throw Error('Unexpected model or billed provider tool');
    if(run.calls.length>=12)throw Error('Per-attempt request cap reached');
    body.max_output_tokens=4096;body.service_tier='default';body.store=false;
    body.reasoning={...(body.reasoning||{}),effort};
    record={index:run.calls.length+1,startedUtc:new Date().toISOString(),body,forwarded:false};
    run.calls.push(record);json(path.join(run.dir,`request-${record.index}.json`),record);
    if(!paid){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:'Capture only. No inference request was sent.',type:'capture_only'}}));return;}
    ticket=budget.reserve(body);record.reservationMicroUsd=ticket.amount;record.forwarded=true;
    json(path.join(run.dir,`request-${record.index}.json`),record);
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(90000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const text=await response.text();
    record.httpStatus=response.status;record.completedUtc=new Date().toISOString();
    fs.writeFileSync(path.join(run.dir,`response-${record.index}.sse`),redact(text));
    const done=response.ok?completed(text):null;
    record.usage=done?.usage??null;record.responseModel=done?.model??null;
    record.charge=done?budget.settle(ticket,done):null;
    if(!response.ok)record.error=redact(text).slice(0,2000);
    json(path.join(run.dir,`request-${record.index}.json`),record);
    res.writeHead(response.status,{'Content-Type':body.stream?'text/event-stream':'application/json'});res.end(text);
  }catch(e){
    const error=redact(e.message);if(record){record.error=error;json(path.join(run.dir,`request-${record.index}.json`),record);}
    run.proxyErrors.push(error);res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:{message:error,type:'demo_guard'}}));
  }finally{busy=false;}
});

const flags=[
  '-c',`model_reasoning_effort="${effort}"`,
  '-c','model_provider="demo"',
  '-c','model_providers.demo.name="Recorded budgeted transport"',
  '-c','model_providers.demo.env_key="DEMO_PROXY_TOKEN"',
  '-c','model_providers.demo.wire_api="responses"',
  '-c','model_providers.demo.request_max_retries=0',
  '-c','model_providers.demo.stream_max_retries=0',
  '-c','web_search="disabled"',
  ...['apps','plugins','memories','multi_agent','browser_use','computer_use','image_generation','unbounded_connection_retries'].flatMap(x=>['-c',`features.${x}=false`]),
];

async function attempt(id,port) {
  const condition=id[0],dir=path.join(out,id);fs.mkdirSync(dir);
  const name=`ctx-readme-${id.toLowerCase()}-${Date.now()}`;
  const staged=path.join(dir,'initial');
  fs.cpSync(path.join(prepared,condition),staged,{recursive:true,filter:src=>!path.relative(path.join(prepared,condition),src).split(path.sep).includes('.git')});
  const run={id,condition,dir,calls:[],proxyErrors:[]};active=run;
  const create=['docker','create','-i','--name',name,'--hostname','demo','--security-opt','no-new-privileges','--pids-limit','128','--memory','1g','-w','/workspace','-e','HOME=/home/node','-e','CODEX_HOME=/home/node/.codex','-e',`DEMO_PROXY_TOKEN=${token}`,image,'sleep','infinity'];
  try{
    command(create);command(['docker','start',name]);
    command(['docker','exec',name,'mkdir','-p','/workspace','/home/node/.codex']);
    command(['docker','cp',staged+'/.',name+':/workspace']);
    command(['docker','exec','--user','root',name,'chown','-R','node:node','/workspace']);
    command(['docker','exec',name,'git','init','--quiet','/workspace']);
    command(['docker','exec',name,'git','-C','/workspace','config','core.autocrlf','false']);
    command(['docker','exec',name,'git','-C','/workspace','add','--all']);
    command(['docker','exec',name,'git','-C','/workspace','-c','user.name=Demo','-c','user.email=demo@example.invalid','commit','-qm','Frozen initial state']);
    const extra=['-c',`model_providers.demo.base_url="http://host.docker.internal:${port}/v1"`];
    const cli=['codex','exec','--ignore-user-config','--ignore-rules','--strict-config','--json','--color','never','--dangerously-bypass-approvals-and-sandbox','--model',model,'-C','/workspace',...flags,...extra,'-'];
    const cliArgs=['docker','exec','-i',name,...cli];
    json(path.join(dir,'launch.json'),{id,condition,image,model,reasoningEffort:effort,argv:cli,prompt,limits:{seconds:180,requests:12,maxOutputTokensPerRequest:4096,attempts:1},isolation:'Fresh container; no host mounts; clean home; no evaluator files; only dummy proxy credential'});
    const envAudit=command(['docker','exec',name,'sh','-c','find /home/node /etc/codex -maxdepth 4 -type f 2>/dev/null || true']);
    fs.writeFileSync(path.join(dir,'home-audit.txt'),envAudit);
    const start=Date.now();run.startedUtc=new Date(start).toISOString();
    const events=fs.createWriteStream(path.join(dir,'events.jsonl'));
    const stamped=fs.createWriteStream(path.join(dir,'event-timestamps.jsonl'));
    const errors=fs.createWriteStream(path.join(dir,'stderr.txt'));
    let pending='';
    const child=spawn(cliArgs[0],cliArgs.slice(1),{windowsHide:true,stdio:['pipe','pipe','pipe']});
    child.stdout.on('data',data=>{events.write(data);pending+=data;let i;while((i=pending.indexOf('\n'))>=0){const line=pending.slice(0,i);pending=pending.slice(i+1);stamped.write(JSON.stringify({observedUtc:new Date().toISOString(),elapsedMs:Date.now()-start,event:line})+'\n');}});
    child.stderr.on('data',data=>errors.write(redact(data)));
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;spawnSync('docker',['kill',name],{windowsHide:true});child.kill();},180000);
    child.stdin.on('error',()=>{});child.stdin.end(prompt);
    const code=await new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});clearTimeout(timer);
    await Promise.all([new Promise(r=>events.end(r)),new Promise(r=>stamped.end(r)),new Promise(r=>errors.end(r))]);
    run.exitCode=code;run.timedOut=timedOut;run.elapsedMs=Date.now()-start;
    // Copying from a stopped container is supported. No host secrets are present.
    command(['docker','cp',name+':/workspace',path.join(dir,'result')]);
    command(['docker','cp',name+':/home/node/.codex',path.join(dir,'client-state')]);
    if(!timedOut){
      command(['docker','exec',name,'git','-C','/workspace','add','-N','--all']);
      fs.writeFileSync(path.join(dir,'changes.diff'),command(['docker','exec',name,'git','-C','/workspace','diff','--no-ext-diff','--no-textconv','HEAD']));
      fs.writeFileSync(path.join(dir,'status.txt'),command(['docker','exec',name,'git','-C','/workspace','status','--short']));
    }
    const summary={...run,dir:undefined,calls:run.calls.map(({body,...x})=>x),remainingConservativeBudgetUsd:budget?.remainingUsd??null};
    json(path.join(dir,'summary.json'),summary);
    console.log(JSON.stringify({id,exitCode:code,timedOut,elapsedMs:run.elapsedMs,requests:run.calls.length,proxyErrors:run.proxyErrors}));
    return summary;
  }finally{active=null;spawnSync('docker',['rm','-f',name],{windowsHide:true,stdio:'ignore'});}
}

(async()=>{
  await new Promise(r=>server.listen(0,'0.0.0.0',r));
  const order=paid?['A1','B1','C1','B2','C2','A2','C3','A3','B3']:['A0','B0','C0'];
  json(path.join(out,'series.json'),{createdUtc:new Date().toISOString(),paid,model,effort,order,budgetUsd:paid?limit:0,image,prompt});
  const all=[];
  try{
    const started=Date.now();
    for(const id of order){
      if(Date.now()-started>1800000)throw Error('Global 30-minute series limit');
      const result=await attempt(id,server.address().port);all.push(result);json(path.join(out,'summaries.json'),all);
      if(paid && result.calls.some(x=>x.httpStatus && x.httpStatus!==200))throw Error('Provider failure: stop series; do not silently retry attempts');
      if(paid && result.proxyErrors.length)throw Error('Proxy guard stopped series');
    }
  }finally{server.close();}
})().catch(e=>{console.error(redact(e.stack));process.exitCode=1;server.close();});
