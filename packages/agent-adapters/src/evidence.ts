import express from 'express';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {realpath,readFile,stat,readdir,lstat} from 'node:fs/promises';
import {resolve,relative,isAbsolute,extname,join} from 'node:path';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
export type EvidenceRoot=string|{path:string;files?:string[]};
export type EvidenceProviders={mail:()=>Promise<unknown>;context?:()=>Promise<unknown>;roots:Record<string,EvidenceRoot>;queries?:Record<string,{parameters:z.ZodType<Record<string,string>>;read:(parameters:Record<string,string>)=>Promise<unknown>}>};
const allowedExtensions=new Set(['.java','.jsp','.xml','.sql','.md','.txt','.ts','.js']);
const sensitiveName=/(^|[._-])(config|conf|credential[s]?|secret[s]?|auth|password|token|key|datasource|jdbc|application|appsettings|context|server|web)([._-]|$)/i;
const rootPath=(root:EvidenceRoot)=>typeof root==='string'?root:root.path;
const fileAllowed=(root:EvidenceRoot,path:string)=>!path.split('/').some(p=>sensitiveName.test(p))&&(allowedExtensions.has(extname(path).toLowerCase())||typeof root!=='string'&&root.files?.includes(path));
const safePath=z.string().min(1).max(1000).refine(p=>!p.includes('\\')&&!p.includes(':')&&!isAbsolute(p)&&p.split('/').every(s=>s&&s!=='.'&&s!=='..'&&!s.startsWith('.')));
async function scopedFile(root:EvidenceRoot,path:string){
  const base=await realpath(rootPath(root)),file=await realpath(resolve(base,path)),rel=relative(base,file);
  let cursor=base;for(const segment of path.split('/')){cursor=join(cursor,segment);if((await lstat(cursor)).isSymbolicLink())throw new Error('EVIDENCE_LINK_DENIED');}
  if(rel.startsWith('..')||isAbsolute(rel)||!fileAllowed(root,path)||!fileAllowed(root,rel.replaceAll('\\','/')))throw new Error('EVIDENCE_PATH_DENIED');
  if((await stat(file)).size>1000000)throw new Error('EVIDENCE_TOO_LARGE');return file;
}
export async function validateEvidenceRoots(roots:Record<string,EvidenceRoot>,privateRoot:string){
  const privatePath=await realpath(privateRoot),home=await realpath(process.env.USERPROFILE??process.env.HOME??privateRoot);
  const contains=(a:string,b:string)=>{const p=relative(a,b);return !p||!p.startsWith('..')&&!isAbsolute(p);};
  for(const root of Object.values(roots)){const path=rootPath(root);if(!isAbsolute(path))throw new Error('ABSOLUTE_EVIDENCE_ROOT_REQUIRED');const canonical=await realpath(path);
    if(!(await stat(canonical)).isDirectory()||contains(canonical,privatePath)||contains(privatePath,canonical)||contains(canonical,home)||canonical.split(/[\\/]/).some(p=>p.startsWith('.')||sensitiveName.test(p)))throw new Error('PRIVATE_EVIDENCE_ROOT_DENIED');
    if(typeof root!=='string')for(const file of root.files??[])safePath.parse(file);
  }
}
async function sourceText(file:string){const text=await readFile(file,'utf8');
  if(/(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key)\s*["']?\s*(?:[:=]|>)/i.test(text)||/(?:name|key)\s*=\s*["'](?:password|secret|token|api[_-]?key)["']/i.test(text)||/-----BEGIN [A-Z ]*PRIVATE KEY-----|:\/\/[^\s/@:]+:[^\s/@]+@/i.test(text))throw new Error('SENSITIVE_EVIDENCE_DENIED');
  return text;
}
export async function evidenceServer(providers:EvidenceProviders,onRead?:(kind:string)=>Promise<void>){
  const token=randomBytes(32).toString('base64url'),events:{kind:string;reference:string}[]=[];
  const app=express();app.disable('x-powered-by');let port=0;
  app.use((req,res,next)=>{
    const provided=Buffer.from(req.get('authorization')??''),expected=Buffer.from('Bearer '+token);
    if(req.get('host')!==`127.0.0.1:${port}`||req.get('origin')||provided.length!==expected.length||!timingSafeEqual(provided,expected))return res.sendStatus(403);next();
  });app.use(express.json({limit:'256kb'}));
  app.post('/mcp',async(req,res)=>{
    const server=new McpServer({name:'triage-readonly',version:'1.0.0'});
    const result=async(kind:string,reference:string,read:()=>Promise<unknown>)=>{try{const value=JSON.stringify(await read());if(value.length>1000000)throw new Error();await onRead?.(kind);events.push({kind,reference});return {content:[{type:'text' as const,text:value}]};}catch{return {isError:true,content:[{type:'text' as const,text:'READ_ONLY_EVIDENCE_UNAVAILABLE'}]};}};
    const annotations={readOnlyHint:true,destructiveHint:false,openWorldHint:false};
    server.registerTool('read_mail',{description:'Read the single mail authorized for this run. No send/delete/sync.',inputSchema:z.object({}).strict(),annotations},()=>result('mail','mail:current',providers.mail));
    server.registerTool('read_context',{description:'Read the user answer and prior report for this run. A prior report is historical analysis, not newly verified ERP evidence.',inputSchema:z.object({}).strict(),annotations},()=>result('document','context:current',providers.context??(async()=>({}))));
    server.registerTool('read_code',{description:'Read approved source files. Configuration/credential files are denied. Roots: '+Object.keys(providers.roots).join(', '),inputSchema:z.object({root:z.string(),path:safePath}).strict(),annotations},async({root,path})=>result('code',root+'/'+path,async()=>{if(!Object.hasOwn(providers.roots,root))throw new Error();return sourceText(await scopedFile(providers.roots[root],path));}));
    server.registerTool('list_code',{description:'List up to 200 source filenames in one configured root directory.',inputSchema:z.object({root:z.string(),path:safePath.optional()}).strict(),annotations},async({root,path})=>result('code',root+'/'+(path??''),async()=>{
      if(!Object.hasOwn(providers.roots,root))throw new Error();const base=await realpath(rootPath(providers.roots[root])),directory=await realpath(join(base,path??'')),rel=relative(base,directory);if(rel.startsWith('..')||isAbsolute(rel))throw new Error();
      return (await readdir(directory,{withFileTypes:true})).filter(f=>!f.name.startsWith('.')&&!f.isSymbolicLink()&&!sensitiveName.test(f.name)&&(f.isDirectory()||fileAllowed(providers.roots[root],(path?path+'/':'')+f.name))).slice(0,200).map(f=>({name:f.name,directory:f.isDirectory()}));
    }));
    server.registerTool('query_evidence',{description:'Run one approved read-only query preset; SQL text is never accepted. Presets: '+Object.keys(providers.queries??{}).join(', '),inputSchema:z.object({queryId:z.string(),parameters:z.record(z.string(),z.string())}).strict(),annotations},async({queryId,parameters})=>result('db','query:'+queryId,async()=>{const q=providers.queries?.[queryId];if(!q||!Object.hasOwn(providers.queries!,queryId))throw new Error();return q.read(q.parameters.parse(parameters));}));
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    res.on('close',()=>{void transport.close();void server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  const http=app.listen(0,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));port=(http.address() as any).port;
  return {url:`http://127.0.0.1:${port}/mcp`,token,events,close:()=>new Promise<void>(r=>http.close(()=>r()))};
}
