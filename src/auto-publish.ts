import { createHash } from 'node:crypto';
import { readFileSync,writeFileSync,existsSync,mkdirSync,renameSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { digest,canonical } from './model.ts';
import { checkCampaign,publicPaths,type Campaign } from './auto-research.ts';
import { planResearch,validateAnalysis } from './llm-research.ts';
import {appendLabPublication as appendFrontierPublication,validateLabRecord as validateFrontierRecord} from './frontier-publication.ts';
import { appendLabPublication,validateLabRecord } from './lab-publication.ts';
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
const json=(s:string)=>JSON.parse(s);
export function validatePublication(record:any){
 const c=record.campaign as Campaign;checkCampaign(c,c.startsAt);
 if(record.format!=='mevy-publication/v1'||!Number.isSafeInteger(record.slot)||canonical(record.paths)!==canonical(publicPaths(c.id,record.slot))||canonical(Object.keys(record.files).sort())!==canonical(Object.values(record.paths).sort()))throw Error('Unexpected publication paths');
 for(const text of Object.values(record.files) as string[])if(typeof text!=='string'||text.length>8_000_000||/sk-(?:proj|svcacct)-|github_pat_|ghp_|-----BEGIN [A-Z ]*PRIVATE KEY-----|\/Users\//.test(text))throw Error('Secret or private artifact rejected');
 const bundle=json(record.files[record.paths.bundle]),audit=json(record.files[record.paths.audit]),plan=json(record.files[record.paths.plan]),analysis=json(record.files[record.paths.analysis]);
 const prepared=planResearch(bundle,audit,'0.250000000',c.model),{analysisHash,...body}=analysis;
 if(bundle.experiment.id!==c.id||canonical(plan)!==canonical(prepared.plan)||digest(body)!==analysisHash||analysisHash!==record.analysisHash||analysis.planHash!==plan.planHash||analysis.bundleHash!==bundle.bundleHash||analysis.contextHash!==plan.contextHash||!analysis.model.startsWith(c.model)||analysis.state!=='AWAITING_HUMAN_REVIEW'||analysis.livePromotion!=='DISABLED'||record.observations!==bundle.observations.length||record.quotes!==plan.quotes||record.createdAt!==analysis.createdAt||record.decision!==analysis.analysis.decision||Date.parse(analysis.createdAt)<c.startsAt*1000||Date.parse(analysis.createdAt)>=c.endsAt*1000)throw Error('Publication evidence mismatch');
 validateAnalysis(analysis.analysis,prepared.context);
 return {analysis,bundle,plan};
}
export function quoteShards(record:any,bundle:any){
 const files:Record<string,string>={},entries=[];
 for(let offset=0;offset<bundle.observations.length;offset+=40){
  const observations=bundle.observations.slice(offset,offset+40),path=record.paths.bundle.replace(/-bundle\.json$/,`-quotes-${String(offset/40).padStart(2,'0')}.json`);
  if(path===record.paths.bundle)throw Error('Invalid source shard path');
  files[path]=JSON.stringify({format:'mevy-quote-source/v1',bundleHash:bundle.bundleHash,observations},null,2)+'\n';
  entries.push({path,firstBlock:observations[0].block,lastBlock:observations.at(-1).block,observations:observations.length});
 }
 return {files,entries};
}
export function publicationEntry(record:any){
 const {analysis,bundle}=validatePublication(record),first=bundle.observations[0],last=bundle.observations.at(-1);
 return {quoteShards:quoteShards(record,bundle).entries,id:record.analysisHash,createdAt:analysis.createdAt,decision:analysis.analysis.decision,model:analysis.model,observations:record.observations,quotes:record.quotes,paths:record.paths,bootstrap:record.slot===0,window:{firstBlock:first.block,lastBlock:last.block,startAt:first.timestamp,endAt:last.timestamp}};
}
export function appendPublication(record:any,index:any,manifest:any,read:(p:string)=>string){
 const entry=publicationEntry(record),shards=quoteShards(record,json(record.files[record.paths.bundle]));
 const immutableFiles={...record.files,...shards.files};
 if(index&&index.format!=='mevy-research-index/v1')throw Error('Unsupported public research index');
 const reports=index?.reports??[];
 if(reports.some((r:any)=>r.id===entry.id)){
  if(Object.entries(immutableFiles).some(([p,t])=>read(p)!==t))throw Error('Already published evidence bytes conflict');return null;
 }
 for(const [p,t] of Object.entries(immutableFiles))if(manifest.files[p]&&read(p)!==t)throw Error('Cannot overwrite published evidence');
 const next={format:'mevy-research-index/v1',campaign:record.campaign,reports:[entry,...reports].sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))};
 const files={...immutableFiles,'evidence/research-index.json':JSON.stringify(next,null,2)+'\n'} as Record<string,string>;
 const hashes={...manifest.files};for(const [p,t] of Object.entries(files))hashes[p]=sha(t);
 files['PUBLIC_FILES.json']=JSON.stringify({algorithm:'sha256',files:Object.fromEntries(Object.entries(hashes).sort(([a],[b])=>a.localeCompare(b,'en')))},null,2)+'\n';
 return files;
}
export function legacyIndex(read:(p:string)=>string){
 const r=json(read('evidence/llm-analysis-2026-10-21.json')),b=json(read('evidence/preliminary-vps-2026-10-21.json'));
 return {format:'mevy-research-index/v1',reports:[{id:r.analysisHash,createdAt:r.createdAt,decision:r.analysis.decision,model:r.model,observations:b.observations.length,quotes:b.observations.reduce((n:number,o:any)=>n+o.quotes.length,0),paths:{analysis:'evidence/llm-analysis-2026-10-21.json',plan:'evidence/llm-plan-2026-10-21.json',bundle:'evidence/preliminary-vps-2026-10-21.json',audit:'evidence/history-source-audit-2026-10-21.json'},bootstrap:false,window:{firstBlock:b.observations[0].block,lastBlock:b.observations.at(-1).block,startAt:b.observations[0].timestamp,endAt:b.observations.at(-1).timestamp}}]};
}
export function publishGit(record:any,root:string,sshKey:string,knownHosts:string){
 const frontier=record.format==='mevy-frontier-publication/v1',lab=record.format==='mevy-lab-publication/v1'||frontier;if(frontier)validateFrontierRecord(record);else if(lab)validateLabRecord(record);else validatePublication(record);if(!checkCampaign(record.campaign,Math.floor(Date.now()/1000)))throw Error('Publication campaign expired');
 if(!resolve(root).startsWith('/var/lib/mevy-publisher/'))throw Error('Publisher must use its dedicated checkout');
 const env:NodeJS.ProcessEnv={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_SSH_COMMAND:`ssh -i ${sshKey} -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=${knownHosts}`,GIT_AUTHOR_NAME:'Mevy Research',GIT_COMMITTER_NAME:'Mevy Research',GIT_AUTHOR_EMAIL:'193773860+sproutagentai@users.noreply.github.com',GIT_COMMITTER_EMAIL:'193773860+sproutagentai@users.noreply.github.com'};
 if(env.OPENAI_API_KEY)throw Error('Publisher must not receive OpenAI credentials');
 const git=(...args:string[])=>execFileSync('git',args,{cwd:root,env,encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe']}).trimEnd();
 mkdirSync(root,{recursive:true,mode:0o700});
 if(!existsSync(join(root,'.git')))git('clone','--no-checkout','git@github.com:sproutagentai/mevhood.git','.');
 if(git('remote','get-url','origin')!=='git@github.com:sproutagentai/mevhood.git')throw Error('Wrong publisher repository');
 git('fetch','origin','main');git('reset','--hard','origin/main');
 const read=(p:string)=>readFileSync(join(root,p),'utf8'),manifest=json(read('PUBLIC_FILES.json'));
 const tracked=git('ls-files','-z').split('\0').filter(Boolean).sort(),listed=[...Object.keys(manifest.files),'PUBLIC_FILES.json'].sort();
 if(canonical(tracked)!==canonical(listed))throw Error('Remote file allowlist differs from tracked source');
 for(const [p,h] of Object.entries(manifest.files))if(sha(read(p))!==h)throw Error('Remote tree does not match reviewed manifest');
 const index=existsSync(join(root,'evidence/research-index.json'))?json(read('evidence/research-index.json')):legacyIndex(read);
 const labIndex=existsSync(join(root,'evidence/discovery-index.json'))?json(read('evidence/discovery-index.json')):null;
 const frontierIndex=existsSync(join(root,'evidence/frontier-index.json'))?json(read('evidence/frontier-index.json')):null;
 const files=frontier?appendFrontierPublication(record,frontierIndex,manifest,read):lab?appendLabPublication(record,labIndex,manifest,read):appendPublication(record,index,manifest,read);if(!files)return {state:'ALREADY_PUBLISHED',commit:git('rev-parse','HEAD')};
 for(const [p,text] of Object.entries(files)){if(!/^evidence\/(?:auto-[a-z0-9-]+-(?:analysis|plan|bundle|audit|quotes-\d{2})\.json|lab-[a-z0-9-]+\.json|(?:research|discovery|frontier|learning)-index\.json)$/.test(p)&&p!=='PUBLIC_FILES.json')throw Error('Publisher path outside evidence allowlist');if(!existsSync(join(root,p))||read(p)!==text)writeFileSync(join(root,p),text,{mode:0o644});}
 const changed=git('status','--porcelain').split('\n').filter(Boolean).map(x=>x.slice(3));if(changed.some(p=>!Object.keys(files).includes(p)))throw Error('Unexpected publisher checkout change');
 git('add','--',...Object.keys(files));git('commit','--no-gpg-sign','-m',lab?`Mevy strategy research: ${record.id}`:`Mevy research: ${record.campaign.id} / slot ${record.slot} / ${record.decision}`);
 if(!checkCampaign(record.campaign,Math.floor(Date.now()/1000)))throw Error('Campaign expired before publication push');
 git('push','origin','HEAD:main');return {state:'PUBLISHED',commit:git('rev-parse','HEAD')};
}
