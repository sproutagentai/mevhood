import { readFileSync,readdirSync,existsSync,mkdirSync,writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { digest } from './model.ts';
import { publishGit } from './auto-publish.ts';
const configPath=process.env.MEVY_CAMPAIGN_CONFIG;
if(!configPath)throw Error('Root-owned campaign configuration required');
const campaign=JSON.parse(readFileSync(configPath,'utf8'));
const spool=process.env.MEVY_PUBLIC_SPOOL,root=process.env.MEVY_PUBLISH_CHECKOUT,key=process.env.MEVY_PUBLISH_KEY,hosts=process.env.MEVY_PUBLISH_HOSTS,state=process.env.MEVY_PUBLISH_STATE;
if(!spool||!root||!key||!hosts||!state)throw Error('Explicit publisher configuration required');
mkdirSync(state,{recursive:true,mode:0o700});
for(const name of readdirSync(spool).filter(x=>/^(?:slot-\d+|lab-[a-z0-9-]+)\.json$/.test(x)).sort()){
 if(existsSync(join(state,name)))continue;
 try{
  const record=JSON.parse(readFileSync(join(spool,name),'utf8'));
  if(digest(record.campaign)!==digest(campaign))throw Error('Publisher campaign differs from root authorization');
  const result=publishGit(record,root,key,hosts);
  const tmp=join(state,'.'+name);writeFileSync(tmp,JSON.stringify({slot:record.slot,analysisHash:record.analysisHash,runId:record.id,reportHash:record.reportHash,kind:record.format,...result,publishedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});renameSync(tmp,join(state,name));console.log(JSON.stringify({slot:record.slot,runId:record.id,...result}));
 }catch{console.error(JSON.stringify({state:'PUBLICATION_FAILED_RETRY_WITHOUT_INFERENCE',slotFile:name}));process.exitCode=1;break;}
}
