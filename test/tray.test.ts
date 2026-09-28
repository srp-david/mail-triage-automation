import {test} from 'vitest';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {LocalRuntime} from '../apps/local-app/src/runtime.js';
import {WindowsTray} from '../apps/local-app/src/tray.js';

function fixture(){
  let sourceId='source',loggedIn=true;
  const records=new Map<string,unknown>();
  const store={async read(key:string){if(key==='device-runner')return {id:'runner',userId:'user',credential:'synthetic'};if(!records.has(key))throw Object.assign(new Error(),{code:'ENOENT'});return records.get(key);},async write(key:string,value:unknown){records.set(key,value);}};
  const runtime=new LocalRuntime({request:async()=>null} as any,{selection:async()=>({sourceId,runnerId:'runner',original:{}})} as any,{token:async()=>{if(!loggedIn)throw new Error('LOGIN_REQUIRED');return 'synthetic';},identity:async()=>({userId:'user'})} as any,store,store,{execute:async()=>null});
  return {runtime,changeSource:()=>sourceId='other',logout:()=>loggedIn=false};
}
test('tray pause is repeatable and resume starts only the previously running loop',async()=>{
  const {runtime}=fixture();
  try{
    await assert.rejects(runtime.resume(),/NO_PAUSED_WORK/);
    await runtime.start('analysis');await runtime.pause();await runtime.pause();
    assert.equal(runtime.trayStatus().canResume,true);assert.equal(runtime.status().sync,'stopped');
    await runtime.resume();assert.equal(runtime.trayStatus().canResume,false);assert.equal(runtime.trayStatus().canPause,true);assert.equal(runtime.status().sync,'stopped');
    await runtime.pause();await runtime.start('analysis');assert.equal(runtime.trayStatus().canResume,false);
    await runtime.pause();await runtime.stop();await assert.rejects(runtime.resume(),/NO_PAUSED_WORK/);
  }finally{await runtime.stop();}
});
test('tray resume rechecks session and source; reconfigure and drain cannot resume old work',async()=>{
  for(const change of ['logout','source','reconfigure','drain'] as const){
    const f=fixture();try{
      await f.runtime.start('sync');await f.runtime.pause();
      if(change==='logout')f.logout();if(change==='source')f.changeSource();
      if(change==='reconfigure')await f.runtime.reconfigure(async()=>undefined);
      if(change==='drain')await f.runtime.drain();
      await assert.rejects(f.runtime.resume(),new RegExp({logout:'LOGIN_REQUIRED',source:'SOURCE_CHANGED',reconfigure:'NO_PAUSED_WORK',drain:'UPDATE_IN_PROGRESS'}[change]));
      assert.equal(f.runtime.status().sync,'stopped');
    }finally{await f.runtime.stop();}
  }
});
test('tray accepts only menu commands, serializes actions and closes its child',async()=>{
  const child:any=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();
  const updates:any[]=[];child.stdin.on('data',(data:Buffer)=>updates.push(JSON.parse(data.toString())));
  child.stdin.on('finish',()=>child.emit('close',0));child.kill=()=>child.emit('close',0);
  const actions:string[]=[];let finish!:()=>void;
  const tray=new WindowsTray('synthetic',()=>({analysis:'idle',sync:'stopped',canPause:true,canResume:false}),async command=>{actions.push(command);await new Promise<void>(resolve=>finish=resolve);},()=>child);
  tray.start();child.stdout.write('ready\nmalicious\npa');child.stdout.write('use\nquit\n');
  assert.deepEqual(actions,['pause']);assert.equal(updates.at(-1).busy,true);finish();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(updates.at(-1).busy,false);await tray.close();assert.equal(child.stdin.writableEnded,true);
});
