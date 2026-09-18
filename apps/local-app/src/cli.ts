import {z} from 'zod';
import {uuid} from '../../../packages/contracts/src/v1.js';
export const usage='sources | settings [JSON_FILE] | get RUN | progress RUN | export RUN | begin JSON_FILE | cancel RUN | review RUN JSON_FILE | handling RUN true|false | runner start analysis|sync | runner stop | recovery show|deliver|recover|deliver-sync|archive-analysis|archive-sync | sync start|stop [ID]';
export async function runCommand(args:string[],call:(path:string,body?:unknown)=>Promise<any>,read:(path:string)=>Promise<string>){
  const [command,id,file]=args;
  const input=async(path?:string)=>{if(!path)throw new Error('INPUT_FILE_REQUIRED');return JSON.parse(await read(path));};
  if(command==='sources')return call('/sources');
  if(command==='settings')return call('/settings',id?await input(id):undefined);
  if(command==='get'||command==='progress')return call('/runs/'+uuid.parse(id));
  if(command==='export')return call('/runs/'+uuid.parse(id)+'/export');
  if(command==='begin'){const b=await input(id==='-'?file:id);return call('/runs',b);}
  if(command==='cancel')return call('/runs/'+uuid.parse(id)+'/cancel',{});
  if(command==='review')return call('/runs/'+uuid.parse(id)+'/reviews',await input(file));
  if(command==='handling')return call('/runs/'+uuid.parse(id)+'/handling',{completed:z.enum(['true','false']).parse(file)==='true'});
  if(command==='runner'&&id==='start')return call('/runtime/start',{kind:z.enum(['analysis','sync']).parse(file)});
  if(command==='runner'&&id==='stop')return call('/runtime/stop',{});
  if(command==='recovery')return id==='show'?call('/runtime/recovery'):call('/runtime/recovery',{action:z.enum(['deliver','recover','deliver-sync','archive-analysis','archive-sync']).parse(id)});
  if(command==='sync'&&id==='start')return call('/sync',{});
  if(command==='sync'&&id==='stop')return call('/sync/'+uuid.parse(file)+'/stop',{});
  throw new Error(usage);
}
