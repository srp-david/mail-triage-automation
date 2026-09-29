import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {childEnvironment,normalizeEvent,AgentAdapter} from '../packages/agent-adapters/src/index.js';
test('agent environment strips history DB/device tokens and normalized progress drops tool contents',async()=>{
  process.env.TRIAGE_TOKEN='synthetic';process.env.DATABASE_URL='synthetic';process.env.ANTHROPIC_API_KEY='synthetic';
  const env=childEnvironment();assert.equal(env.TRIAGE_TOKEN,undefined);assert.equal(env.DATABASE_URL,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);
  assert.deepEqual(normalizeEvent('codex',{type:'item.completed',item:{type:'command_execution',exit_code:0,command:'private',aggregated_output:'private'}}),{kind:'code_read',outcome:'completed'});
  const adapter=new AgentAdapter({agent:'codex',command:{executable:'never-called'}});
  await assert.rejects(adapter.execute({directory:'.',synthetic:false} as any,new AbortController().signal),/NOT_RELEASE_APPROVED/);
});

test('packaged skill is installed identically for both agents and synthetic validation remains separate',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'skill-prepare-'));
  const adapter=new AgentAdapter({agent:'codex',command:{executable:'never-called'}});
  try{
    const prepared=await adapter.prepare(directory);
    const source=await readFile(new URL('../packages/skills/mail-triage/SKILL.md',import.meta.url),'utf8');
    for(const name of ['.agents','.claude'])assert.equal(await readFile(join(directory,name,'skills','mail-triage-readonly','SKILL.md'),'utf8'),source);
    const marker='mail-triage-readonly/'+prepared.skillVersion;
    assert.ok(source.includes(marker));
    const result={outcome:'completed',project:'unknown',report:'36 '+marker,question:'',knowledge:'',evidence:[{kind:'document',reference:'fixture.json',verified:true}]};
    assert.deepEqual(adapter.validateResult(result,[{type:'item.completed',item:{type:'command_execution',exit_code:0}}]),result);
  }finally{await rm(directory,{recursive:true,force:true});}
});
