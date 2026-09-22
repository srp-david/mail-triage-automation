import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,mkdir,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {evidenceServer,validateEvidenceRoots} from '../packages/agent-adapters/src/evidence.js';
test('evidence MCP permits bounded reads and refuses writes, arbitrary SQL, traversal and browser access',async()=>{
  const root=await mkdtemp(join(tmpdir(),'evidence-'));await writeFile(join(root,'sample.sql'),'select 36');await writeFile(join(root,'secrets.json'),'PRIVATE');
  for(const name of ['application.properties','application-prod.yml','context.xml','appsettings.json','plain.json','business.java'])await writeFile(join(root,name),'password = "synthetic-private"');
  if(process.platform!=='win32')await symlink(join(root,'application.properties'),join(root,'notes.md'));
  let queries=0;const server=await evidenceServer({mail:async()=>({id:17}),roots:{erp:root},queries:{quantity:{parameters:z.object({style:z.literal('synthetic')}).strict(),read:async()=>{queries++;return {total:36};}}}});
  const client=new Client({name:'test',version:'1'});
  try{
    assert.equal((await fetch(server.url,{method:'POST'})).status,403);
    assert.equal((await fetch(server.url,{method:'POST',headers:{Authorization:'Bearer '+server.token,Origin:'https://other.invalid'}})).status,403);
    await client.connect(new StreamableHTTPClientTransport(new URL(server.url),{requestInit:{headers:{Authorization:'Bearer '+server.token}}}));
    assert.deepEqual((await client.listTools()).tools.map(t=>t.name).sort(),['list_code','query_evidence','read_code','read_context','read_mail']);
    assert.equal((await client.callTool({name:'read_mail',arguments:{}})).isError,undefined);
    assert.equal((await client.callTool({name:'read_code',arguments:{root:'erp',path:'sample.sql'}})).isError,undefined);
    assert.equal((await client.callTool({name:'query_evidence',arguments:{queryId:'quantity',parameters:{style:'synthetic'}}})).isError,undefined);
    for(const request of [
      {name:'write_file',arguments:{path:'sample.sql',text:'DELETE'}},
      {name:'read_code',arguments:{root:'erp',path:'../outside.txt'}},
      {name:'read_code',arguments:{root:'__proto__',path:'sample.sql'}},
      {name:'read_code',arguments:{root:'erp',path:'secrets.json'}},
      {name:'query_evidence',arguments:{queryId:'quantity',parameters:{style:'synthetic',sql:'delete from test'}}},
      {name:'query_evidence',arguments:{queryId:'DELETE',parameters:{}}},
    ])assert.equal((await client.callTool(request)).isError,true,request.name);
    for(const path of ['application.properties','application-prod.yml','context.xml','appsettings.json','plain.json','business.java',...(process.platform!=='win32'?['notes.md']:[])])assert.equal((await client.callTool({name:'read_code',arguments:{root:'erp',path}})).isError,true,path);
    assert.equal(queries,1);assert.equal(server.events.length,3);
  }finally{await client.close();await server.close();await rm(root,{recursive:true,force:true});}
});
test('evidence roots reject private storage, its parents and relative paths',async()=>{
  const root=await mkdtemp(join(tmpdir(),'evidence-roots-')),privateRoot=join(root,'app'),codeRoot=join(root,'erp');await mkdir(privateRoot);await mkdir(codeRoot);
  try{await validateEvidenceRoots({erp:codeRoot},privateRoot);await assert.rejects(validateEvidenceRoots({bad:privateRoot},privateRoot),/PRIVATE_EVIDENCE/);await assert.rejects(validateEvidenceRoots({bad:root},privateRoot),/PRIVATE_EVIDENCE/);await assert.rejects(validateEvidenceRoots({bad:'relative'},privateRoot),/ABSOLUTE_EVIDENCE/);}finally{await rm(root,{recursive:true,force:true});}
});
