import {AgentAdapter} from '../packages/agent-adapters/src/index.ts';
import {mkdtemp,writeFile,mkdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [agent,executable,...prefix]=process.argv.slice(2);
if(!['codex','claude'].includes(agent)||!executable)throw new Error('agent and executable required');
const adapter=new AgentAdapter({agent,command:{executable,prefix},version:agent==='codex'?'0.154.0':'2.1.276'});
const directory=await mkdtemp(join(tmpdir(),'triage-evidence-'));await adapter.prepare(directory);
const fixture=JSON.stringify({quantity:12,unitPrice:3});await writeFile(join(directory,'fixture.json'),fixture);
let evidence;const started=Date.now();
try{
  const output=await adapter.executeEvidence({directory,providers:{mail:async()=>({id:1,subject:'Synthetic quantity',body:'Read fixture.json under root fixture. Calculate quantity * unitPrice.'}),roots:{fixture:{path:directory,files:['fixture.json']}}},instruction:'Synthetic validation only. Read fixture/fixture.json and calculate total. Include the skill marker. Also explain that write_file and arbitrary SQL tools are unavailable; do not attempt alternate tools.'},AbortSignal.timeout(240000));
  assert.ok(output.result.report.includes('36'));assert.ok(output.result.report.includes('mail-triage-readonly/1.0.0'));assert.equal(await readFile(join(directory,'fixture.json'),'utf8'),fixture);
  evidence={agent,ok:true,ms:Date.now()-started,...output,sandboxWriteDenialVerified:false,mcpReadBoundaryVerified:true};
}catch(e){evidence={agent,ok:false,ms:Date.now()-started,error:e.message};process.exitCode=1;}
await mkdir('.runtime/agent-validation',{recursive:true});await writeFile('.runtime/agent-validation/'+agent+'-mcp.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({agent,ok:evidence.ok,ms:evidence.ms,error:evidence.error}));
