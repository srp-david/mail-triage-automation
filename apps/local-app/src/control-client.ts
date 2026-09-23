import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
export async function controlRequest(control:{port:number;token:string;pid:number},path:string,body?:unknown,transport:typeof fetch=fetch){
  if(!Number.isInteger(control.port)||control.port<1024||control.port>65535||typeof control.token!=='string'||control.token.length<32||!Number.isSafeInteger(control.pid)||control.pid<1||!/^\/api\/[a-zA-Z0-9/-]+$/.test(path))throw new Error('INVALID_LOCAL_CONTROL');
  try{process.kill(control.pid,0);}catch{throw new Error('LOCAL_PROCESS_NOT_RUNNING');}
  const origin='http://127.0.0.1:'+control.port,nonce=randomBytes(32).toString('hex');
  // Authenticate the listener before disclosing the DPAPI capability. A stale
  // port reused by an unrelated process sees only this one-time random challenge.
  const challenge=await transport(origin+'/api/local-challenge?nonce='+nonce,{redirect:'error',signal:AbortSignal.timeout(10000)});
  const proof=challenge.ok?(await challenge.json()).proof:null;
  if(typeof proof!=='string'||!/^([a-f0-9]{64})$/.test(proof)||!timingSafeEqual(Buffer.from(proof,'hex'),createHmac('sha256',control.token).update(nonce).digest()))throw new Error('LOCAL_SERVER_IDENTITY_MISMATCH');
  const response=await transport(origin+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:'Bearer '+control.token,'x-local-client':'1','content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(typeof data.code==='string'&&/^[A-Z_]{1,80}$/.test(data.code)?data.code:'LOCAL_REQUEST_FAILED');}return response;
}
