import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {z} from 'zod';
import {endpointSchema} from './connections.js';
import type {EvidenceProviders} from '../../../packages/agent-adapters/src/evidence.js';

async function connected<T>(endpoint:string,action:(client:Client,signal:AbortSignal)=>Promise<T>){
  const client=new Client({name:'mail-triage-connections',version:'1.0.0'}),signal=AbortSignal.timeout(8000);
  const transport=new StreamableHTTPClientTransport(new URL(endpointSchema.parse(endpoint)),{requestInit:{signal}});
  try{await client.connect(transport,{timeout:8000,signal});return await action(client,signal);}
  finally{await client.close().catch(()=>{});}
}
const required={mail:['get_email','search_emails','sync'],db:['list_databases','list_schemas','list_tables','describe_table']};
export async function checkMcp(endpoint:string,kind:'mail'|'db'){
  try{return await connected(endpoint,async(client,signal)=>{
    const names=new Set<string>();let cursor:string|undefined;
    for(let page=0;page<5;page++){const result=await client.listTools(cursor?{cursor}:undefined,{timeout:8000,signal});for(const tool of result.tools)names.add(tool.name);cursor=result.nextCursor;if(!cursor)break;}
    const missing=required[kind].filter(name=>!names.has(name));
    return {connected:true,compatible:missing.length===0,missing};
  });}catch{return {connected:false,compatible:false,missing:[] as string[]};}
}
// Only fixed metadata readers are exposed. Arbitrary SQL and mutation tools are never forwarded.
export function dbEvidence(endpoint?:string):EvidenceProviders['queries']{
  if(!endpoint)return {};
  const text=z.string().min(1).max(200),shapes={
    list_databases:z.object({}).strict(),list_schemas:z.object({database:text}).strict(),
    list_tables:z.object({database:text,schema:text}).strict(),describe_table:z.object({database:text,schema:text,table:text}).strict(),
  };
  return Object.fromEntries(Object.entries(shapes).map(([name,parameters])=>['db_'+name,{parameters,read:async(input:Record<string,string>)=>{
    const args=parameters.parse(input);
    return connected(endpoint,async(client,signal)=>{const result=await client.callTool({name,arguments:args},undefined,{timeout:8000,signal});
      if(result.isError)throw new Error('DB_EVIDENCE_UNAVAILABLE');return result.structuredContent??result.content;
    });
  }}]));
}
