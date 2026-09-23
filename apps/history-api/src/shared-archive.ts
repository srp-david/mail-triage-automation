import {randomUUID} from 'node:crypto';
import type {PoolClient} from 'pg';
import {z} from 'zod';
import {transaction} from './db.js';
import {lockShared,lock,member,sourceAccess,digest} from './directory.js';
import {historyAccess,freshProof} from './shared-history.js';
import {ApiError,uuid,type Principal} from '../../../packages/contracts/src/v1.js';
const hash=z.string().regex(/^[a-f0-9]{64}$/);
const relativePath=z.string().min(1).max(1000).refine(x=>!x.startsWith('/')&&!x.includes('\\')&&!x.includes(':')&&!x.split('/').some(p=>p==='..'||p==='.'||!p));
export async function collectionAccess(c:PoolClient,actor:Principal,id:string,write=false){
  const m=await member(c,actor);
  const r=(await c.query(`SELECT lc.*,a.can_write FROM legacy_collection lc JOIN membership own ON own.user_id=lc.owner_user_id AND own.team_id=$3 AND own.active
    LEFT JOIN legacy_collection_access a ON a.collection_id=lc.id AND a.user_id=$2 WHERE lc.id=$1 AND (lc.owner_user_id=$2 OR a.user_id IS NOT NULL)`,[id,actor.userId,m.team_id])).rows[0];
  if(!r||write&&(m.role==='viewer'||r.owner_user_id!==actor.userId&&!r.can_write))throw new ApiError(404,'COLLECTION_NOT_FOUND');return r;
}
async function documentAccess(c:PoolClient,actor:Principal,id:string,write=false){
  const r=(await c.query('SELECT d.*,cd.collection_id FROM legacy_document d JOIN legacy_collection_document cd ON cd.document_id=d.id WHERE d.id=$1',[id])).rows[0];
  if(!r)throw new ApiError(404,'DOCUMENT_NOT_FOUND');await collectionAccess(c,actor,r.collection_id,write);return r;
}
export class SharedArchive {
  async collections(actor:Principal){return transaction(async c=>{await lockShared(c);const m=await member(c,actor);
    return (await c.query(`SELECT lc.id,lc.name,lc.owner_user_id FROM legacy_collection lc JOIN membership own ON own.user_id=lc.owner_user_id AND own.team_id=$2 AND own.active
      LEFT JOIN legacy_collection_access a ON a.collection_id=lc.id AND a.user_id=$1 WHERE lc.owner_user_id=$1 OR a.user_id IS NOT NULL ORDER BY lc.name,lc.id`,[actor.userId,m.team_id])).rows;
  });}
  async create(actor:Principal,input:unknown){const b=z.object({name:z.string().trim().min(1).max(200),requestId:uuid}).strict().parse(input);
    return transaction(async c=>{await lock(c);if((await member(c,actor)).role==='viewer')throw new ApiError(403,'WRITE_DENIED');
      const previous=(await c.query('SELECT * FROM legacy_collection WHERE id=$1',[b.requestId])).rows[0];
      if(previous){if(previous.owner_user_id!==actor.userId||previous.name!==b.name)throw new ApiError(409,'REQUEST_CONFLICT');return {id:previous.id};}
      await c.query('INSERT INTO legacy_collection(id,owner_user_id,name) VALUES($1,$2,$3)',[b.requestId,actor.userId,b.name]);return {id:b.requestId};
    });
  }
  async grant(actor:Principal,id:string,input:unknown){const b=z.object({userId:uuid,permission:z.enum(['none','read','write'])}).strict().parse(input);
    return transaction(async c=>{await lock(c);const collection=await collectionAccess(c,actor,id,true);
      if(collection.owner_user_id!==actor.userId)throw new ApiError(403,'OWNER_REQUIRED');
      const owner=await member(c,actor),target=await member(c,{userId:b.userId});if(owner.team_id!==target.team_id)throw new ApiError(403,'TEAM_MISMATCH');
      if(b.permission==='none')await c.query('DELETE FROM legacy_collection_access WHERE collection_id=$1 AND user_id=$2',[id,b.userId]);
      else await c.query('INSERT INTO legacy_collection_access VALUES($1,$2,$3) ON CONFLICT(collection_id,user_id) DO UPDATE SET can_write=$3',[id,b.userId,b.permission==='write']);
      await c.query("INSERT INTO audit_event(actor_id,action,target_id) VALUES($1,'collection.grant',$2)",[actor.userId,id]);return {ok:true};
    });
  }
  async import(actor:Principal,collectionId:string,input:unknown){
    const b=z.object({namespace:z.string().min(1).max(200),path:relativePath,hash,kind:z.enum(['report','log']),body:z.string().min(1).max(1000000)}).strict().parse(input);
    if(digest(b.body)!==b.hash)throw new ApiError(409,'HASH_MISMATCH');
    return transaction(async c=>{await lock(c);await collectionAccess(c,actor,collectionId,true);
      const existing=(await c.query('SELECT d.id,cd.collection_id FROM legacy_document d LEFT JOIN legacy_collection_document cd ON cd.document_id=d.id WHERE namespace=$1 AND source_path=$2 AND source_hash=$3',[b.namespace,b.path,b.hash])).rows[0];
      if(existing){if(existing.collection_id!==collectionId)throw new ApiError(409,'DOCUMENT_MAPPING_REQUIRED');return {id:existing.id,imported:false};}
      const id=randomUUID();await c.query('INSERT INTO legacy_document(id,namespace,source_path,source_hash,kind,body) VALUES($1,$2,$3,$4,$5,$6)',[id,b.namespace,b.path,b.hash,b.kind,b.body]);
      await c.query('INSERT INTO legacy_collection_document VALUES($1,$2)',[collectionId,id]);return {id,imported:true};
    });
  }
  async list(actor:Principal,collectionId:string,offset=0,query=''){return transaction(async c=>{await lockShared(c);await collectionAccess(c,actor,collectionId);
    return (await c.query(`SELECT d.id,d.namespace,d.source_path,d.source_hash,d.kind,d.imported_at FROM legacy_document d JOIN legacy_collection_document cd ON cd.document_id=d.id
      WHERE cd.collection_id=$1 AND ($3='' OR strpos(lower(d.source_path),lower($3))>0 OR strpos(lower(d.body),lower($3))>0) ORDER BY d.imported_at DESC,d.id LIMIT 100 OFFSET $2`,[collectionId,offset,query])).rows;
  });}
  async get(actor:Principal,id:string){return transaction(async c=>{await lockShared(c);return documentAccess(c,actor,id);});}
  async link(actor:Principal,id:string,input:unknown){
    const b=z.object({sourceId:uuid,hash,mailId:z.number().int().positive().safe(),messageId:z.string().min(1).max(2000),subject:z.string().max(2000),verifiedAt:freshProof}).strict().parse(input);
    return transaction(async c=>{await lock(c);const d=await documentAccess(c,actor,id,true),s=await sourceAccess(c,actor,b.sourceId,true);
      if(d.source_hash!==b.hash||d.kind!=='report')throw new ApiError(409,'DOCUMENT_VERSION_MISMATCH');
      const old=(await c.query('SELECT m.* FROM legacy_link l JOIN mail_identity m ON m.id=l.mail_key WHERE l.document_id=$1',[id])).rows[0];
      if(old){if(old.store_id!==s.store_id||Number(old.mail_id)!==b.mailId||old.message_id!==b.messageId)throw new ApiError(409,'DOCUMENT_ALREADY_LINKED');return {id,linked:true};}
      let mail=(await c.query('SELECT * FROM mail_identity WHERE store_id=$1 AND mail_id=$2',[s.store_id,b.mailId])).rows[0];
      if(mail&&mail.message_id!==b.messageId)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');
      if(!mail)mail=(await c.query('INSERT INTO mail_identity(id,store_id,mail_id,message_id,subject) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),s.store_id,b.mailId,b.messageId,b.subject])).rows[0];
      await c.query('INSERT INTO legacy_link(document_id,mail_key,proof) VALUES($1,$2,$3)',[id,mail.id,JSON.stringify({...b,verifiedBy:actor.userId})]);return {id,linked:true};
    });
  }
  async mailDocuments(actor:Principal,sourceId:string,mailId:number){return transaction(async c=>{await lockShared(c);const s=await sourceAccess(c,actor,sourceId),m=await member(c,actor);
    return (await c.query(`SELECT d.id,d.source_path,d.source_hash,d.kind,d.imported_at FROM legacy_document d JOIN legacy_link l ON l.document_id=d.id JOIN mail_identity mi ON mi.id=l.mail_key
      JOIN legacy_collection_document cd ON cd.document_id=d.id JOIN legacy_collection lc ON lc.id=cd.collection_id JOIN membership own ON own.user_id=lc.owner_user_id AND own.team_id=$4 AND own.active
      LEFT JOIN legacy_collection_access a ON a.collection_id=lc.id AND a.user_id=$3
      WHERE mi.store_id=$1 AND mi.mail_id=$2 AND (lc.owner_user_id=$3 OR a.user_id IS NOT NULL) ORDER BY d.imported_at,d.id`,[s.store_id,mailId,actor.userId,m.team_id])).rows;
  });}
  async prepareKnowledge(actor:Principal,input:unknown){
    const b=z.object({runId:uuid,namespace:z.string().min(1).max(200),target:relativePath.refine(x=>/^erp\/(gg|gg-fac|d-code)\/docs\/.+\.md$/.test(x)),baseHash:hash,reportHash:hash,nextHash:hash}).strict().parse(input);
    return transaction(async c=>{await lock(c);await historyAccess(c,actor,b.runId,true);
      const report=(await c.query('SELECT result FROM report_version WHERE run_id=$1',[b.runId])).rows[0]?.result;
      if(!report?.knowledge?.trim()||digest(report.report)!==b.reportHash)throw new ApiError(409,'KNOWLEDGE_VERSION_MISMATCH');
      const addition=`\n\n<!-- triage-knowledge:${b.runId}:${b.reportHash} -->\n${report.knowledge.trim()}\n`;
      await c.query(`INSERT INTO knowledge_proposal(id,run_id,namespace,target_path,base_hash,report_hash,addition,next_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(run_id,namespace,target_path,base_hash) DO NOTHING`,[randomUUID(),b.runId,b.namespace,b.target,b.baseHash,b.reportHash,addition,b.nextHash]);
      const row=(await c.query('SELECT * FROM knowledge_proposal WHERE run_id=$1 AND namespace=$2 AND target_path=$3 AND base_hash=$4',[b.runId,b.namespace,b.target,b.baseHash])).rows[0];
      if(row.next_hash!==b.nextHash||row.report_hash!==b.reportHash)throw new ApiError(409,'KNOWLEDGE_VERSION_MISMATCH');
      const {owner_hash,...safe}=row;return safe;
    });
  }
  async knowledge(actor:Principal,id:string){return transaction(async c=>{await lockShared(c);const r=(await c.query('SELECT * FROM knowledge_proposal WHERE id=$1',[id])).rows[0];if(!r)throw new ApiError(404,'KNOWLEDGE_NOT_FOUND');await historyAccess(c,actor,r.run_id);const {owner_hash,...safe}=r;return safe;});}
}
