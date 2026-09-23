// Local-only runtime probe. Never deploy this function.
import {argon2id,argon2Verify} from 'npm:hash-wasm@4.12.0';
Deno.serve(async()=>{
 const samples=[];const before=Deno.memoryUsage();
 for(let i=0;i<3;i++){
  const salt=crypto.getRandomValues(new Uint8Array(16)),start=performance.now();
  const hash=await argon2id({password:'Synthetic benchmark password',salt,memorySize:19456,iterations:2,parallelism:1,hashLength:32,outputType:'encoded'});
  const hashMs=performance.now()-start,verifyStart=performance.now();
  if(!await argon2Verify({password:'Synthetic benchmark password',hash}))throw Error('VERIFY_FAILED');
  samples.push({hashMs,verifyMs:performance.now()-verifyStart});
 }
 return Response.json({samples,memoryBefore:before,memoryAfter:Deno.memoryUsage(),note:'local Edge wall time and process/isolate memory; not hosted per-request CPU billing'});
});
