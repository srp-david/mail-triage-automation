import { test } from 'vitest';
import assert from 'node:assert/strict';
import { toolProgress } from '../src/progress.js';

test('progress exposes fixed facts only, without tool or model content',()=>{
  const event={type:'item.completed',item:{type:'mcp_tool_call',server:'mail',tool:'get_email',status:'completed',arguments:{body:'private'},result:{content:[{text:'private'}]}}};
  assert.deepEqual(toolProgress(event),{kind:'mail_read',outcome:'completed'});
  assert.deepEqual(toolProgress({...event,item:{...event.item,server:'db'}}),{kind:'db_tool',outcome:'completed'});
  assert.deepEqual(toolProgress({...event,item:{...event.item,result:{isError:true}}}),{kind:'mail_read',outcome:'failed'});
  assert.deepEqual(toolProgress({...event,item:{...event.item,status:'failed',error:{message:'private'}}}),{kind:'mail_read',outcome:'failed'});
  assert.equal(toolProgress({...event,type:'item.started'}),null);
  for(const type of ['reasoning','agent_message','unknown'])assert.equal(toolProgress({type:'item.completed',item:{type,text:'private'}}),null);
  assert.equal(toolProgress(null),null);
  assert.deepEqual(toolProgress({type:'item.completed',item:{type:'command_execution',status:'completed',exit_code:0,command:'private',aggregated_output:'private'}}),{kind:'local_tool',outcome:'completed'});
  assert.deepEqual(toolProgress({type:'item.completed',item:{type:'command_execution',status:'completed',exit_code:1}}),{kind:'local_tool',outcome:'failed'});
});
