import {AgentAdapter} from '../packages/agent-adapters/src/index.ts';
import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const [agent,executable,...prefix]=process.argv.slice(2);
if(!['codex','claude'].includes(agent)||!executable)throw new Error('agent and executable required');
const adapter=new AgentAdapter({agent,command:{executable,prefix},version:agent==='codex'?'0.154.0':'2.1.276'});
const directory=await mkdtemp(join(tmpdir(),'triage-agent-'));await adapter.prepare(directory);
const fixture=JSON.stringify({quantity:12,unitPrice:3});await writeFile(join(directory,'fixture.json'),fixture);
const started=Date.now();let evidence;
try{
  const {result,events}=await adapter.execute({directory,synthetic:true},new AbortController().signal);
  assert.ok(result.report.includes('36'));assert.equal(await readFile(join(directory,'fixture.json'),'utf8'),fixture);
  evidence={agent,ok:true,ms:Date.now()-started,events,result,sandboxWriteDenialVerified:false,mcpVerified:false};
}catch(error){evidence={agent,ok:false,ms:Date.now()-started,error:error.message};process.exitCode=1;}
await mkdir('.runtime/agent-validation',{recursive:true});await writeFile('.runtime/agent-validation/'+agent+'.json',JSON.stringify(evidence,null,2));
await writeFile('.runtime/agent-validation/'+agent+'-events.jsonl',adapter.lastSyntheticOutput);
console.log(JSON.stringify({agent,ok:evidence.ok,ms:evidence.ms,error:evidence.error}));
