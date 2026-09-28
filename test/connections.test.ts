import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import express from 'express';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {z} from 'zod';
import {ConnectionStore,endpointSchema} from '../apps/local-app/src/connections.js';
import {configEndpoints} from '../apps/local-app/src/discover-connections.js';
import {checkMcp,dbEvidence} from '../apps/local-app/src/mcp-connections.js';
import {createBrowserApp} from '../apps/local-app/src/browser-app.js';
import {connectionRoutes} from '../apps/local-app/src/connection-routes.js';
import {LocalRuntime} from '../apps/local-app/src/runtime.js';

async function fixture(){
  const home=await mkdtemp(join(tmpdir(),'triage-connections-'));await mkdir(join(home,'config'));
  const value={localPort:3090,historyUrl:'https://example.test/history',auth:{mode:'username',issuer:'https://example.test',audience:'fixture'},custom:{preserve:true},mailMcpUrl:'http://127.0.0.1:17082/mcp',evidenceRoots:{}};
  const path=join(home,'config/settings.json');await writeFile(path,JSON.stringify(value));return {home,path,value,store:new ConnectionStore(home)};
}
test('connection saves preserve deployment fields, reject stale edits, and keep the prior file on apply failure',async()=>{
  const {store,path,value}=await fixture(),first=await store.read();
  const next={...first.connections,mailMcpUrl:undefined,dbMcpUrl:'http://localhost:17080/mcp',agents:{claude:{executable:'C:\\tools\\claude.exe'}}};
  const saved=await store.save({revision:first.revision,connections:next},async(_value,persist)=>persist());
  const disk=JSON.parse(await readFile(path,'utf8'));assert.equal(disk.historyUrl,value.historyUrl);assert.equal(disk.localPort,3090);assert.deepEqual(disk.auth,value.auth);assert.deepEqual(disk.custom,value.custom);
  assert.equal(disk.mailMcpUrl,undefined);assert.equal(disk.dbMcpUrl,'http://127.0.0.1:17080/mcp');
  await assert.rejects(store.save({revision:first.revision,connections:next},async(_value,persist)=>persist()),/CONNECTION_SETTINGS_CHANGED/);
  await assert.rejects(store.save({revision:saved.revision,connections:next},async()=>{throw new Error('BUSY');}),/BUSY/);
  assert.equal((await store.read()).revision,saved.revision);
  await assert.rejects(store.save({revision:saved.revision,connections:{...next,evidenceRoots:{erp:'relative/path'}}},async(_value,persist)=>persist()),/INVALID_EVIDENCE_ROOT/);
  assert.equal((await store.read()).revision,saved.revision);
});
test('discovery imports plain Codex and Claude HTTP URLs, excludes credentials, disabled servers and executable commands',()=>{
  const toml=`[mcp_servers.mail]\nurl = "http://localhost:17082/mcp"\n[mcp_servers.private]\nurl = "https://private.test/mcp"\nbearer_token_env_var = "SECRET"\n[mcp_servers.disabled]\nurl = 'https://disabled.test/mcp'\nenabled = false\n[mcp_servers.db]\nurl = 'http://127.0.0.1:17080/mcp'\n[mcp_servers.header]\nurl = "https://header.test/mcp"\n[mcp_servers.header.http_headers]\nAuthorization = "secret"`;
  assert.deepEqual(configEndpoints(toml,'toml','Codex').map(x=>x.url),['http://127.0.0.1:17082/mcp','http://127.0.0.1:17080/mcp']);
  const json=JSON.stringify({mcpServers:{mail:{url:'http://localhost:17082/mcp'},stdio:{command:'npx',args:['untrusted']},auth:{url:'https://example.test/mcp',headers:{Authorization:'secret'}},query:{url:'https://example.test/mcp?token=secret'}}});
  assert.equal(configEndpoints(json,'json','Claude').length,1);
  for(const url of ['http://remote.test/mcp','https://user:pass@example.test/mcp','https://example.test/mcp?key=x'])assert.throws(()=>endpointSchema.parse(url));
});
test('MCP connection checks only list tools; DB evidence exposes fixed metadata readers without SQL',async()=>{
  const app=express();app.use(express.json());const calls:string[]=[];
  app.post('/mcp',async(req,res)=>{
    const server=new McpServer({name:'synthetic-db',version:'1'});
    const schemas={list_databases:z.object({}),list_schemas:z.object({database:z.string()}),list_tables:z.object({database:z.string(),schema:z.string()}),describe_table:z.object({database:z.string(),schema:z.string(),table:z.string()})};
    for(const [name,inputSchema] of Object.entries(schemas))server.registerTool(name,{inputSchema},async()=>{calls.push(name);return {content:[{type:'text',text:'synthetic metadata'}]};});
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});res.on('close',()=>{void transport.close();void server.close();});await server.connect(transport);await transport.handleRequest(req,res,req.body);
  });
  const http=app.listen(0,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));const url=`http://127.0.0.1:${(http.address() as any).port}/mcp`;
  try{assert.equal((await checkMcp(url,'db')).compatible,true);assert.equal((await checkMcp(url,'mail')).compatible,false);assert.deepEqual(calls,[]);
    const queries=dbEvidence(url)!;assert.equal(queries.execute_query,undefined);assert.equal(queries.db_execute_query,undefined);
    await assert.rejects(queries.db_list_schemas.read({database:'fixture',sql:'DELETE FROM x'}));assert.deepEqual(calls,[]);
    await queries.db_list_schemas.read({database:'fixture'});assert.deepEqual(calls,['list_schemas']);
  }finally{await new Promise<void>(r=>http.close(()=>r()));}
});
test('connection routes retain local bootstrap, origin and CSRF protection',async()=>{
  const {store}=await fixture(),control='synthetic-control-'.repeat(3);
  const probe=createServer();await new Promise<void>(r=>probe.listen(0,'127.0.0.1',r));const port=(probe.address() as any).port;await new Promise<void>(r=>probe.close(()=>r()));
  const session:any={usernameMode:true,token:async()=> 'fixture',identity:async()=>({userId:'fixture'}),status:async()=>({})};
  const http=createBrowserApp(session,{port,controlToken:control,features:app=>connectionRoutes(app,store,async(_value,persist)=>persist())}).listen(port,'127.0.0.1');await new Promise<void>(r=>http.once('listening',r));
  const url=`http://127.0.0.1:${port}`,host={Host:`127.0.0.1:${port}`};
  try{
    assert.equal((await fetch(url+'/api/connections',{headers:host})).status,401);
    assert.equal((await fetch(url+'/api/connections',{headers:{...host,Origin:'https://foreign.test'}})).status,403);
    const cli={...host,authorization:'Bearer '+control,'x-local-client':'1'};
    assert.equal((await fetch(url+'/api/connections',{headers:cli})).status,200);
    const ticket=await (await fetch(url+'/api/browser-ticket',{method:'POST',headers:cli})).json();
    const boot=await fetch(url+new URL(ticket.url).pathname+new URL(ticket.url).search,{headers:host,redirect:'manual'});
    const cookie=boot.headers.get('set-cookie')!.split(';')[0];
    assert.equal((await fetch(url+'/api/connections',{method:'POST',headers:{...host,Cookie:cookie,Origin:url,'Content-Type':'application/json'},body:'{}'})).status,403);
  }finally{await new Promise<void>(r=>http.close(()=>r()));}
});
test('runtime refuses changes during work and refreshes executor availability after save',async()=>{
  const runtime=new LocalRuntime({} as any,{} as any,{} as any,{} as any,{} as any);
  (runtime as any).loops.set('analysis',{state:'working'});let applied=false;
  await assert.rejects(runtime.reconfigure(async()=>{applied=true;return undefined;}),/CONNECTION_WORK_IN_PROGRESS/);assert.equal(applied,false);
  (runtime as any).loops.clear();await runtime.reconfigure(async()=>({execute:async()=>({})} as any));assert.equal(runtime.status().analysisAvailable,true);
  await runtime.drain();await assert.rejects(runtime.reconfigure(async()=>undefined),/UPDATE_IN_PROGRESS/);
});
