import { z } from 'zod';

// Only fixed categories leave the Worker. Never copy tool arguments, output or model text.
export const progressSchema=z.object({
  kind:z.enum(['analysis_started','mail_read','mail_tool','db_tool','local_tool','other_tool','result_saving']),
  outcome:z.enum(['completed','failed'])
}).strict();
export type ProgressEvent=z.infer<typeof progressSchema>;

export function toolProgress(event:unknown):ProgressEvent|null {
  if(!event||typeof event!=='object')return null;
  const {type,item}=event as {type?:string;item?:any};
  if(type!=='item.completed'||!item)return null;
  if(item.type==='mcp_tool_call'){
    if(!['completed','failed'].includes(item.status))return null;
    const kind=item.server==='mail'?(item.tool==='get_email'?'mail_read':'mail_tool')
      :item.server==='db'?'db_tool':'other_tool';
    return {kind,outcome:item.status==='failed'||item.result?.isError===true||item.error?'failed':'completed'};
  }
  if(item.type==='command_execution'&&['completed','failed'].includes(item.status)){
    // A shell event does not prove which files were read or what was established.
    return {kind:'local_tool',outcome:item.status==='completed'&&item.exit_code===0?'completed':'failed'};
  }
  return null;
}
