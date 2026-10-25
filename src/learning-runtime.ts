import {DatabaseSync} from 'node:sqlite';import {existsSync,readdirSync} from 'node:fs';import {join} from 'node:path';
import {buildLearningEvidence,clusterId,type LearningEpoch} from './failure-learning.ts';import {digest,type Experiment} from './model.ts';import {labSizes,searchCells,type LabGraph,type LabFrame,type LabCell} from './frontier-source.ts';
export function loadLearningEvidence(stateRoot:string,cutoff:number,control:Experiment){
 const parent=join(stateRoot,'frontier-epochs'),epochs:LearningEpoch[]=[];if(!existsSync(parent))return buildLearningEvidence([]);
 for(const name of readdirSync(parent).filter(n=>/^\d+$/.test(n)).sort()){const p=join(parent,name,'frontier.sqlite');if(!existsSync(p))continue;const db=new DatabaseSync(p,{readOnly:true});try{const list=(kind:string)=>(db.prepare('SELECT body FROM lab_items WHERE kind=? ORDER BY id').all(kind) as {body:string}[]).map(x=>JSON.parse(x.body)),graph=list('graph')[0];
   const anchored=list('trial').map(t=>{const row=db.prepare('SELECT body FROM lab_items WHERE kind=? AND id=?').get('anchor',t.id) as {body:string}|undefined;return {...t,publicAnchor:row?JSON.parse(row.body):null};});
   if(graph&&anchored.length)epochs.push({graph,control,trials:anchored,frames:list('frame').filter(f=>f.control.block<=cutoff)});
  }finally{db.close();}}
 return buildLearningEvidence(epochs);
}
export type SearchGuide={id:string;createdAt:string;kind:string;directionId:string;label:string;cells:LabCell[];suspendedClusters:string[];reason:string;newInformation:string;addressesFailureIds:string[];analysisHash:string;learningEvidenceHash:string};
export function selectLearningCells(g:LabGraph,frames:LabFrame[],mandatory:LabCell[],guide?:SearchGuide){
 if(!guide)return searchCells(g,frames,mandatory);const all=g.routes.flatMap(r=>labSizes.map(sizeWei=>({routeId:r.id,sizeWei}))),counts=new Map<string,number>();for(const f of frames)for(const q of f.quotes){const id=digest({routeId:q.routeId,sizeWei:q.sizeWei});counts.set(id,(counts.get(id)??0)+1);}const order=(xs:LabCell[])=>xs.sort((a,b)=>(counts.get(digest(a))??0)-(counts.get(digest(b))??0)||digest(a).localeCompare(digest(b)));
 const selected=new Map(mandatory.map(c=>[digest(c),c]));const add=(c:LabCell)=>{if(g.routes.some(r=>r.id===c.routeId)&&selected.size<12)selected.set(digest(c),c);};
 for(const c of order(guide.cells.filter(c=>g.routes.some(r=>r.id===c.routeId))).slice(0,3))add(c);
 const suspended=all.filter(c=>guide.suspendedClusters.includes(clusterId(g,c.routeId)));if(suspended.length)add(order(suspended)[0]!);
 for(const c of order(all.filter(c=>!guide.suspendedClusters.includes(clusterId(g,c.routeId))))){if(selected.size>=6)break;add(c);}if(!selected.size&&all.length)add(order(all)[0]!);return [...selected.values()];
}
export function latestSearchState(stateRoot:string){
 const parent=join(stateRoot,'frontier-epochs');let latest:{guide:SearchGuide;outcomes:{kind:string;body:any}[]}|null=null;if(!existsSync(parent))return null;
 for(const name of readdirSync(parent).filter(n=>/^\d+$/.test(n))){const p=join(parent,name,'frontier.sqlite');if(!existsSync(p))continue;const db=new DatabaseSync(p,{readOnly:true});try{for(const row of db.prepare('SELECT body FROM lab_items WHERE kind=?').all('guide') as {body:string}[]){const guide=JSON.parse(row.body) as SearchGuide;if(latest&&latest.guide.createdAt>guide.createdAt)continue;const outcomes=['action-result','scan-failure'].flatMap(kind=>{const r=db.prepare('SELECT body FROM lab_items WHERE kind=? AND id=?').get(kind,guide.id) as {body:string}|undefined;return r?[{kind,body:JSON.parse(r.body)}]:[];});if(!latest||guide.createdAt>latest.guide.createdAt||outcomes.length>latest.outcomes.length)latest={guide,outcomes};}}finally{db.close();}}
 return latest;
}
