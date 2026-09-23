import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import {unpack} from './mcp.js';
export type MailSearch=(args:Record<string,unknown>)=>Promise<any>;
export interface MailSource {call(name:string,args:Record<string,unknown>):Promise<any>;full(id:number):Promise<any>;attachment(id:number,attachmentId:string):Promise<any>;sync(limit:number,signal:AbortSignal):Promise<any>;withSearch?<T>(action:(search:MailSearch)=>Promise<T>):Promise<T>}
export function mailSource(endpoint:string):MailSource {
  const url=new URL(endpoint);
  if(url.username||url.password||url.hash||url.search||(url.protocol!=='https:'&&!(url.protocol==='http:'&&url.hostname==='127.0.0.1')))throw new Error('INVALID_MCP_ENDPOINT');
  const connected=async<T>(action:(client:Client)=>Promise<T>)=>{
    const client=new Client({name:'mail-triage-local',version:'1.0.0'});
    try{
      try{await client.connect(new StreamableHTTPClientTransport(url));}catch{throw new ApiError(502,'LOCAL_MCP_UNAVAILABLE');}
      return await action(client);
    }finally{await client.close().catch(()=>{});}
  };
  const call=async(client:Client,name:string,args:Record<string,unknown>,raw=false,signal?:AbortSignal)=>{
    try{signal?.throwIfAborted();const result=await client.callTool({name,arguments:args},undefined,{timeout:signal?90000:180000,signal});if(raw)return result;const value=unpack(result);if(value.code)throw new Error('MCP_FAILED');return value;}
    catch{throw new ApiError(502,'LOCAL_MCP_UNAVAILABLE');}
  };
  const request=(name:string,args:Record<string,unknown>,raw=false,signal?:AbortSignal)=>{signal?.throwIfAborted();return connected(client=>call(client,name,args,raw,signal));};
  return {call:request,withSearch:action=>connected(client=>action(args=>call(client,'search_emails',args))),attachment:(id,attachmentId)=>request('get_attachment',{email_id:id,attachment_id:attachmentId},true),async sync(limit,signal){const raw=await request('sync',{max_messages:limit},true,signal);const response=unpack({...raw,isError:false});if(response.code)return {status:'failed',saved:0,failed:0,remaining:null,errors:[{code:response.code}]};if(raw.isError&&!response.status)throw new ApiError(502,'SYNC_OUTCOME_UNCERTAIN');return response;},async full(id){
    let offset=0,body='',first:any;
    for(;;){const page=await request('get_email',{id,body_offset:offset,body_limit:30000});first??=page;
      if(Number(page.id)!==id||page.messageId!==first.messageId||page.fetchedAt!==first.fetchedAt)throw new ApiError(409,'MAIL_IDENTITY_CHANGED');
      body+=page.body??'';if(body.length>5000000)throw new ApiError(413,'MAIL_TOO_LARGE');
      if(page.nextBodyOffset==null)return {...first,body,nextBodyOffset:null,truncated:false};
      if(!Number.isSafeInteger(page.nextBodyOffset)||page.nextBodyOffset<=offset)throw new ApiError(502,'MCP_PAGE_INVALID');offset=page.nextBodyOffset;
    }
  }};
}
