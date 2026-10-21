import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { canonical,digest,observationSchema,verifyExperiment,type Experiment,type Observation } from './model.ts';

export class Store {
  db:DatabaseSync;
  constructor(path:string){mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec(`
    PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS experiments(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS observations(experiment TEXT NOT NULL REFERENCES experiments(id), block INTEGER NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(experiment,block));
    CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, previous TEXT NOT NULL, hash TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS proposals(hash TEXT PRIMARY KEY,experiment TEXT NOT NULL REFERENCES experiments(id),body TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS no_experiment_update BEFORE UPDATE ON experiments BEGIN SELECT RAISE(ABORT,'immutable experiment'); END;
    CREATE TRIGGER IF NOT EXISTS no_observation_update BEFORE UPDATE ON observations BEGIN SELECT RAISE(ABORT,'immutable observation'); END;
    CREATE TRIGGER IF NOT EXISTS no_experiment_delete BEFORE DELETE ON experiments BEGIN SELECT RAISE(ABORT,'immutable experiment'); END;
    CREATE TRIGGER IF NOT EXISTS no_observation_delete BEFORE DELETE ON observations BEGIN SELECT RAISE(ABORT,'immutable observation'); END;
    CREATE TRIGGER IF NOT EXISTS no_event_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
    CREATE TRIGGER IF NOT EXISTS no_event_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'immutable journal'); END;
  `);}
  close(){this.db.close();}
  transaction<T>(fn:()=>T):T{this.db.exec('BEGIN IMMEDIATE');try{const v=fn();this.db.exec('COMMIT');return v;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  event(body:unknown){const previous=(this.db.prepare('SELECT hash FROM events ORDER BY seq DESC LIMIT 1').get() as {hash:string}|undefined)?.hash??'0x'+'0'.repeat(64);
    const h=digest({previous,body});this.db.prepare('INSERT INTO events(previous,hash,body) VALUES(?,?,?)').run(previous,h,canonical(body));}
  freeze(e:Experiment){verifyExperiment(e);return this.transaction(()=>{this.db.prepare('INSERT INTO experiments VALUES(?,?)').run(e.id,canonical(e));this.event({type:'freeze',id:e.id,commitment:e.commitment});});}
  experiment(id:string):Experiment{const row=this.db.prepare('SELECT body FROM experiments WHERE id=?').get(id) as {body:string}|undefined;if(!row)throw Error('Unknown experiment');const e=JSON.parse(row.body);verifyExperiment(e);return e;}
  add(id:string,o:Observation){observationSchema.parse(o);const e=this.experiment(id);if(o.block<=e.freezeBlock || o.timestamp<e.createdAt)throw Error('Observation predates commitment');
    return this.transaction(()=>{const old=this.db.prepare('SELECT hash FROM observations WHERE experiment=? AND block=?').get(id,o.block) as {hash:string}|undefined;
      if(old){if(old.hash!==digest(o))throw Error('Reorg or conflicting duplicate');return false;}
      this.db.prepare('INSERT INTO observations VALUES(?,?,?,?)').run(id,o.block,digest(o),canonical(o));this.event({type:'observe',id,block:o.block,hash:digest(o)});return true;});}
  observations(id:string):Observation[]{return (this.db.prepare('SELECT hash,body FROM observations WHERE experiment=? ORDER BY block').all(id) as {hash:string;body:string}[]).map(r=>{const o=observationSchema.parse(JSON.parse(r.body));if(digest(o)!==r.hash)throw Error('Observation tampered');return o;});}
  verifyJournal(){let previous='0x'+'0'.repeat(64),freezes=0,observations=0,proposals=0;
    for(const r of this.db.prepare('SELECT previous,hash,body FROM events ORDER BY seq').all() as {previous:string;hash:string;body:string}[]){
      const body=JSON.parse(r.body);if(r.previous!==previous||digest({previous,body})!==r.hash)throw Error('Journal tampered');previous=r.hash;
      if(body.type==='freeze'){freezes++;if(this.experiment(body.id).commitment!==body.commitment)throw Error('Freeze record tampered');}
      else if(body.type==='observe'){observations++;const o=this.db.prepare('SELECT hash,body FROM observations WHERE experiment=? AND block=?').get(body.id,body.block) as {hash:string;body:string}|undefined;if(!o||o.hash!==body.hash||digest(JSON.parse(o.body))!==body.hash)throw Error('Observation missing or tampered');}
      else if(body.type==='proposal'){proposals++;const p=this.db.prepare('SELECT body FROM proposals WHERE hash=? AND experiment=?').get(body.hash,body.id) as {body:string}|undefined;if(!p||digest(JSON.parse(p.body))!==body.hash)throw Error('Proposal missing or tampered');}
      else throw Error('Unknown journal event');
    }
    for(const [table,n] of [['experiments',freezes],['observations',observations],['proposals',proposals]] as const){const count=this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as {n:number};if(count.n!==n)throw Error('Unjournalled state');}
    return previous;
  }
  proposal(id:string,body:unknown){return this.transaction(()=>{this.experiment(id);const count=this.db.prepare('SELECT COUNT(*) AS n FROM proposals WHERE experiment=?').get(id) as {n:number};if(count.n>=3)throw Error('Proposal cap reached');const h=digest(body);this.db.prepare('INSERT INTO proposals VALUES(?,?,?)').run(h,id,canonical(body));this.event({type:'proposal',id,hash:h});return h;});}
}
