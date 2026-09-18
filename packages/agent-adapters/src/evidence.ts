import express from 'express';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {realpath,readFile,stat,readdir} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
export type EvidenceProviders={mail:()=>Promise<unknown>;roots:Record<string,string>;queries?:Record<string,{parameters:z.ZodType<Record<string,string>>;read:(parameters:Record<string,string>)=>Promise<unknown>}>};
const allowedExtensions=new Set(['.java','.xml','.sql','.md','.txt','.ts','.js','.json','.yaml','.yml','.properties']);
const safePath=z.string().min(1).max(1000).refine(p=>!p.includes('\\')&&!p.includes(':')&&!isAbsolute(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.startsWith('.')));
async function scopedFile(root:string,path:string){
  const base=await realpath(root),file=await realpath(resolve(base,path)),rel=relative(base,file);
  if(rel.startsWith('..')||isAbsolute(rel)||!allowedExtensions.has(extname(file).toLowerCase())||/^(config|credentials|secrets|auth)\./i.test(path.split('/').pop()!))throw new Error('EVIDENCE_PATH_DENIED');
  if((await stat(file)).size>1000000)throw new Error('EVIDENCE_TOO_LARGE');return file;
}
export async function evidenceServer(providers:EvidenceProviders){
  const token=randomBytes(32).toString('base64url'),events:{kind:string;reference:string}[]=[];
  const app=express();app.disable('x-powered-by');let port=0;
  app.use((req,res,next)=>{
    const provided=Buffer.from(req.get('authorization')??''),expected=Buffer.from('Bearer '+token);
    if(req.get('host')!==`127.0.0.1:${port}`||req.get('origin')||provided.length!==expected.length||!timingSafeEqual(provided,expected))return res.sendStatus(403);next();
  });app.use(express.json({limit:'256kb'}));
  app.post('/mcp',async(req,res)=>{
    const server=new McpServer({name:'triage-readonly',version:'1.0.0'});
    const result=async(kind:string,reference:string,read:()=>Promise<unknown>)=>{try{const value=JSON.stringify(await read());if(value.length>1000000)throw new Error();events.push({kind,reference});return {content:[{type:'text' as const,text:value}]};}catch{return {isError:true,content:[{type:'text' as const,text:'READ_ONLY_EVIDENCE_UNAVAILABLE'}]};}};
    const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
    server.registerTool('read_mail',{description:'Read the single mail authorized for this run. No send/delete/sync.',inputSchema:z.object({}).strict(),annotations},()=>result('mail','mail:current',providers.mail));
    server.registerTool('read_code',{description:'Read a file under one configured evidence root. Roots: '+Object.keys(providers.roots).join(', '),inputSchema:z.object({root:z.string(),path:safePath}).strict(),annotations},async({root,path})=>result('code',root+'/'+path,async()=>{if(!Object.hasOwn(providers.roots,root))throw new Error();return readFile(await scopedFile(providers.roots[root],path),'utf8');}));
    server.registerTool('list_code',{description:'List up to 200 source filenames in one configured root directory.',inputSchema:z.object({root:z.string(),path:safePath.optional()}).strict(),annotations},async({root,path})=>result('code',root+'/'+(path??''),async()=>{
      if(!Object.hasOwn(providers.roots,root))throw new Error();const base=await realpath(providers.roots[root]),directory=await realpath(join(base,path??'')),rel=relative(base,directory);if(rel.startsWith('..')||isAbsolute(rel))throw new Error();
      return (await readdir(directory,{withFileTypes:true})).filter(f=>!f.name.startsWith('.')&&!f.isSymbolicLink()&&(f.isDirectory()||allowedExtensions.has(extname(f.name)))).slice(0,200).map(f=>({name:f.name,directory:f.isDirectory()}));
    }));
    server.registerTool('query_evidence',{description:'Run one approved read-only query preset; SQL text is never accepted. Presets: '+Object.keys(providers.queries??{}).join(', '),inputSchema:z.object({queryId:z.string(),parameters:z.record(z.string(),z.string())}).strict(),annotations},async({queryId,parameters})=>result('db','query:'+queryId,async()=>{const q=providers.queries?.[queryId];if(!q||!Object.hasOwn(providers.queries!,queryId))throw new Error();return q.read(q.parameters.parse(parameters));}));
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close();void server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  const http=app.listen(0,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));port=(http.address() as any).port;
  return {url:`http://127.0.0.1:${port}/mcp`,token,events,close:()=>new Promise<void>(r=>http.close(()=>r()))};
}
