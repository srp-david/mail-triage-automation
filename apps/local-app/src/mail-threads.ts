import {HttpError} from './config.js';
import {matchesAnalysis,searchByAnalysis} from './mail-search.js';
import type {ThreadLink,ThreadMailIdentity} from '../../../src/thread-links.js';

type Mail={id:number;messageId?:string|null;inReplyTo?:string[];references?:string[];subject?:string;sentAt?:string|null;fetchedAt?:string;[key:string]:unknown};
type Thread={id:string;emails:Mail[];manualLinkIds:string[];totalMembers:number};
const messageId=(value:unknown):value is string=>typeof value==='string'&&/^<[^<>\s]+>$/.test(value);
const timestamp=(mail:Mail)=>{const value=Date.parse(mail.sentAt??mail.fetchedAt??'');return Number.isFinite(value)?value:0;};
const newest=(a:Mail,b:Mail)=>timestamp(b)-timestamp(a)||b.id-a.id;

// Virtual ancestors also join replies whose original message is absent from the
// search. Subjects are never evidence of a reply relationship. IDs retain case.
export function groupThreads(emails:Mail[],links:ThreadLink[]=[]):Thread[]{
  const parents=new Map<string,string>();
  const root=(key:string)=>{
    if(!parents.has(key))parents.set(key,key);
    let result=key;
    while(parents.get(result)!==result)result=parents.get(result)!;
    while(key!==result){const next=parents.get(key)!;parents.set(key,result);key=next;}
    return result;
  };
  const join=(a:string,b:string)=>{const x=root(a),y=root(b);if(x!==y)parents.set(y,x);};
  for(const mail of emails){
    const key='mail:'+mail.id;
    root(key);
    for(const id of [mail.messageId,...(mail.inReplyTo??[]),...(mail.references??[])]){
      if(messageId(id))join(key,'message:'+id);
    }
  }
  const byId=new Map(emails.map(mail=>[mail.id,mail]));
  const current=(identity:ThreadMailIdentity)=>{const mail=byId.get(identity.id);return !!mail&&(mail.messageId??null)===identity.messageId&&mail.fetchedAt===identity.fetchedAt;};
  // Stale/missing identities stay manageable but cannot silently connect a reused ID.
  const validLinks=links.filter(link=>current(link.source)&&current(link.target));
  for(const link of validLinks)join('mail:'+link.source.id,'mail:'+link.target.id);
  const linkIds=new Map<string,string[]>();
  for(const link of validLinks){const key=root('mail:'+link.source.id);const ids=linkIds.get(key)??[];ids.push(link.id);linkIds.set(key,ids);}
  const mailLinks=new Map<number,string[]>();
  for(const link of validLinks)for(const endpoint of [link.source,link.target]){const ids=mailLinks.get(endpoint.id)??[];ids.push(link.id);mailLinks.set(endpoint.id,ids);}
  const groups=new Map<string,Mail[]>();
  for(const mail of emails){const key=root('mail:'+mail.id);const group=groups.get(key)??[];group.push({...mail,manualLinkIds:mailLinks.get(mail.id)??[]});groups.set(key,group);}
  return [...groups.entries()].map(([key,members])=>({id:'thread:'+members.reduce((min,mail)=>Math.min(min,mail.id),Infinity),emails:members.sort(newest),manualLinkIds:linkIds.get(key)??[],totalMembers:members.length}))
    .sort((a,b)=>newest(a.emails[0],b.emails[0]));
}

export async function scanThreadMails(conditions:Parameters<typeof searchByAnalysis>[0],search:Parameters<typeof searchByAnalysis>[2]){
  const emails:Mail[]=[];const seen=new Set<number>();let offset=0,lastSync;
  for(;;){
    const page=await search({...conditions,limit:100,offset});
    if(!Array.isArray(page.emails))throw new HttpError(502,'메일 검색 응답을 확인할 수 없습니다.');
    for(const mail of page.emails){
      if(!Number.isSafeInteger(mail.id)||mail.id<1)throw new HttpError(502,'메일 식별자를 확인할 수 없습니다.');
      if(!Array.isArray(mail.inReplyTo)||!Array.isArray(mail.references))
        throw new HttpError(502,'스레드 보기에 필요한 메일 MCP 업데이트가 필요합니다. 개별 보기를 이용해 주세요.');
      if(!seen.has(mail.id)){seen.add(mail.id);emails.push(mail);}
    }
    lastSync=page.lastSync;
    if(page.nextOffset==null)break;
    if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset||!page.emails.length)
      throw new HttpError(502,'메일 검색 페이지가 진행되지 않았습니다. 다시 검색하세요.');
    offset=page.nextOffset;
  }
  return {emails,lastSync};
}

export async function searchThreads(args:Parameters<typeof searchByAnalysis>[0],status:Parameters<typeof searchByAnalysis>[1],
  search:Parameters<typeof searchByAnalysis>[2],summaries:Parameters<typeof searchByAnalysis>[3],links:ThreadLink[]=[],
  scan=(conditions:Parameters<typeof searchByAnalysis>[0])=>scanThreadMails(conditions,search)){
  const {emails,lastSync}=await scan(args);
  // Keep the whole header graph for cases where a filtered-out intermediate
  // reply is the only link, while displaying only matching messages.
  const filtered=!!(args.query||args.from_address||args.sent_after||args.sent_before);
  const graph=links.length&&filtered?(await scan({limit:100,offset:0})).emails:emails;
  const visible=new Set(emails.map(mail=>mail.id));
  let threads=groupThreads(graph,links).map(thread=>({...thread,emails:thread.emails.filter(mail=>visible.has(mail.id))})).filter(thread=>thread.emails.length);
  if(status!=='all'){
    const matching=new Set<number>();
    for(let start=0;start<emails.length;start+=100){
      const batch=emails.slice(start,start+100);const rows=await summaries(batch.map(m=>m.id));
      const byId=new Map(rows.map(row=>[Number(row.mailId),row]));
      for(const mail of batch)if(matchesAnalysis(status,byId.get(mail.id)))matching.add(mail.id);
    }
    threads=threads.map(thread=>({...thread,emails:thread.emails.filter(mail=>matching.has(mail.id))})).filter(thread=>thread.emails.length);
    // Re-sort by the latest matching message, not a hidden status-filtered one.
  }
  threads.sort((a,b)=>newest(a.emails[0],b.emails[0]));
  const page=threads.slice(args.offset,args.offset+args.limit);
  return {threads:page,total:threads.length,mailTotal:threads.reduce((sum,thread)=>sum+thread.emails.length,0),
    nextOffset:args.offset+page.length<threads.length?args.offset+page.length:null,lastSync};
}
