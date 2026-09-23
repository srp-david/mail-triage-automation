import {z} from 'zod';
import {HttpError} from './config.js';

export const analysisStatus=z.enum(['all','unanalysed','queued','running','needs_input','completed','failed','handled','legacy']);
type Status=z.infer<typeof analysisStatus>;
type Summary={mailId:string|number;runCount:number;legacyCount:number;latestStatus:string|null;handledAt?:unknown};
type SearchArgs={query?:string;from_address?:string;sent_after?:string;sent_before?:string;limit:number;offset:number};

export function matchesAnalysis(status:Status,summary?:Summary){
  if(status==='all')return true;
  if(status==='unanalysed')return !summary||(!summary.runCount&&!summary.legacyCount);
  if(status==='handled')return !!summary?.handledAt;
  if(status==='legacy')return (summary?.legacyCount??0)>0;
  return summary?.latestStatus===status;
}

// Filter the complete upstream search before slicing; a page-only filter would
// hide matches on later pages and report incorrect totals/next offsets.
export async function searchByAnalysis(args:SearchArgs,status:Status,
  search:(args:SearchArgs)=>Promise<any>,summaries:(ids:number[])=>Promise<Summary[]>){
  if(status==='all')return search(args);
  let offset=0,total=0,lastSync;const emails:any[]=[];const seen=new Set<number>();
  for(;;){
    const page=await search({...args,limit:100,offset});
    if(!Array.isArray(page.emails))throw new HttpError(502,'메일 검색 응답을 확인할 수 없습니다.');
    lastSync=page.lastSync;
    const rows=await summaries(page.emails.map((m:any)=>Number(m.id)));
    const byId=new Map(rows.map(row=>[Number(row.mailId),row]));
    for(const mail of page.emails){
      const id=Number(mail.id);if(seen.has(id))continue;seen.add(id);
      if(!matchesAnalysis(status,byId.get(id)))continue;
      if(total>=args.offset&&emails.length<args.limit)emails.push(mail);
      total++;
    }
    if(page.nextOffset==null)break;
    if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset<=offset||!page.emails.length)
      throw new HttpError(502,'메일 검색 페이지가 진행되지 않았습니다. 다시 검색하세요.');
    offset=page.nextOffset;
  }
  return {emails,total,nextOffset:args.offset+emails.length<total?args.offset+emails.length:null,lastSync};
}
