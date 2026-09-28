import {readFile,writeFile,rename,unlink,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import {validateEvidenceRoots} from '../../../packages/agent-adapters/src/evidence.js';
import {agentCommandSchema} from '../../../packages/agent-adapters/src/command.js';

export const endpointSchema=z.string().trim().max(2000).transform(value=>{
  try{const url=new URL(value);if(url.hostname==='localhost')url.hostname='127.0.0.1';
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&url.hostname==='127.0.0.1'))throw new Error();
    return url.href;
  }catch{throw new ApiError(400,'INVALID_MCP_ENDPOINT');}
});
const command=agentCommandSchema;
export const connectionSchema=z.object({
  mailMcpUrl:endpointSchema.optional(),dbMcpUrl:endpointSchema.optional(),
  agents:z.object({codex:command.optional(),claude:command.optional()}).strict().default({}),
  evidenceRoots:z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,39}$/),z.union([z.string().trim().min(1).max(2000),z.object({path:z.string().trim().min(1).max(2000),files:z.array(z.string()).max(200).optional()}).strict()])).default({}),
}).strict();
export type Connections=z.infer<typeof connectionSchema>;
export const localSettingsSchema=z.object({
  localPort:z.number().int().min(1024).max(65535).default(3080),historyUrl:z.string().url(),
  auth:z.object({mode:z.literal('username'),issuer:z.string().url(),audience:z.string().min(1)}).strict(),
  ...connectionSchema.shape,
}).passthrough();
export function connectionsOf(value:Record<string,unknown>):Connections{
  return connectionSchema.parse({mailMcpUrl:value.mailMcpUrl,dbMcpUrl:value.dbMcpUrl,agents:value.agents,evidenceRoots:value.evidenceRoots});
}
const revision=(body:string)=>createHash('sha256').update(body).digest('hex');
export class ConnectionStore {
  private chain:Promise<unknown>=Promise.resolve();
  constructor(private root:string){}
  private async document(){const path=join(this.root,'config','settings.json'),info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||info.size>1_000_000)throw new ApiError(409,'LOCAL_SETTINGS_UNAVAILABLE');
    const body=await readFile(path,'utf8');return {path,body,value:localSettingsSchema.parse(JSON.parse(body))};
  }
  async read(){const {body,value}=await this.document();return {revision:revision(body),connections:connectionsOf(value)};}
  async save(input:unknown,apply:(value:Connections,persist:()=>Promise<void>)=>Promise<void>){
    const task=async()=>{
      const request=z.object({revision:z.string().regex(/^[a-f0-9]{64}$/),connections:connectionSchema}).strict().parse(input);
      const before=await this.document();if(revision(before.body)!==request.revision)throw new ApiError(409,'CONNECTION_SETTINGS_CHANGED');
      try{await validateEvidenceRoots(request.connections.evidenceRoots,this.root);}catch{throw new ApiError(400,'INVALID_EVIDENCE_ROOT');}
      await apply(request.connections,async()=>{
        if(revision((await this.document()).body)!==request.revision)throw new ApiError(409,'CONNECTION_SETTINGS_CHANGED');
        const value={...before.value,...request.connections};
        // Optional endpoint removal must remove its old value as well.
        for(const key of ['mailMcpUrl','dbMcpUrl'] as const)if(!request.connections[key])delete value[key];
        const temporary=before.path+'.'+randomUUID()+'.tmp';
        try{await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});await rename(temporary,before.path);}
        finally{await unlink(temporary).catch(()=>{});}
      });
      return this.read();
    };
    const result=this.chain.then(task,task);this.chain=result.catch(()=>{});return result;
  }
}
