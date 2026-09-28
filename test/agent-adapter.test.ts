import {test} from 'vitest';
import assert from 'node:assert/strict';
import {childEnvironment,normalizeEvent,AgentAdapter} from '../packages/agent-adapters/src/index.js';
test('agent environment strips history DB/device tokens and normalized progress drops tool contents',async()=>{
  process.env.TRIAGE_TOKEN='synthetic';process.env.DATABASE_URL='synthetic';process.env.ANTHROPIC_API_KEY='synthetic';
  const env=childEnvironment();assert.equal(env.TRIAGE_TOKEN,undefined);assert.equal(env.DATABASE_URL,undefined);assert.equal(env.ANTHROPIC_API_KEY,undefined);
  assert.deepEqual(normalizeEvent('codex',{type:'item.completed',item:{type:'command_execution',exit_code:0,command:'private',aggregated_output:'private'}}),{kind:'code_read',outcome:'completed'});
  const adapter=new AgentAdapter({agent:'codex',command:{executable:'never-called'}});
  await assert.rejects(adapter.execute({directory:'.',synthetic:false} as any,new AbortController().signal),/NOT_RELEASE_APPROVED/);
});
