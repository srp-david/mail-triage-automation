import {ApiError,runFailureCode,type RunFailureCode} from '../../contracts/src/v1.js';

export function transientHistoryError(error:unknown){
  return error instanceof ApiError?[408,429,500,502,503,504].includes(error.status):
    error instanceof TypeError||error instanceof DOMException&&error.name==='TimeoutError';
}
export function failureCode(error:unknown,fromHistory=false):RunFailureCode{
  if((fromHistory||error instanceof ApiError)&&transientHistoryError(error))return 'NETWORK_ERROR';
  if(error instanceof ApiError){
    if([401,403,404].includes(error.status))return 'AUTH_REJECTED';
    if(error.code==='CANCEL_REQUESTED')return 'CANCELLED';
    if(error.code.startsWith('LEASE_'))return 'LEASE_EXPIRED';
  }
  const known=runFailureCode.safeParse(error instanceof Error?error.message:undefined);
  return known.success?known.data:'AGENT_FAILED';
}

// A failed request never extends the last confirmed lease. Cleanup also fences
// an in-flight reply so it cannot restart timers or affect a subsequent run.
export function watchLease(controller:AbortController,until:string,
  request:(signal:AbortSignal)=>Promise<{leaseUntil:string;cancelRequested?:boolean}|null>,interval=30000){
  let pulse:ReturnType<typeof setTimeout>|undefined,deadline:ReturnType<typeof setTimeout>|undefined;
  let stopped=false,failures=0;const pending=new AbortController();
  const stop=()=>{stopped=true;clearTimeout(pulse);clearTimeout(deadline);pending.abort();controller.signal.removeEventListener('abort',stop);};
  const abort=(code:RunFailureCode)=>controller.abort(new Error(code));
  const arm=(leaseUntil:string)=>{
    clearTimeout(deadline);const remaining=Date.parse(leaseUntil)-Date.now()-1000;
    if(!Number.isFinite(remaining)||remaining<=0){abort('LEASE_EXPIRED');return;}
    deadline=setTimeout(()=>abort('LEASE_EXPIRED'),remaining);
  };
  const schedule=(ms:number)=>{if(!stopped&&!controller.signal.aborted)pulse=setTimeout(()=>void beat(),ms);};
  const beat=async()=>{
    if(stopped||controller.signal.aborted)return;
    try{
      const response=await request(pending.signal);
      if(stopped||controller.signal.aborted)return;
      if(!response||typeof response.leaseUntil!=='string'||response.cancelRequested!==undefined&&typeof response.cancelRequested!=='boolean'){abort('AGENT_FAILED');return;}
      if(response.cancelRequested){abort('CANCELLED');return;}
      arm(response.leaseUntil);failures=0;schedule(interval);
    }catch(error){
      if(stopped||controller.signal.aborted)return;
      if(!transientHistoryError(error)){abort(failureCode(error));return;}
      const wait=[5000,15000,30000][failures++];
      if(wait===undefined){abort('NETWORK_ERROR');return;}
      schedule(wait);
    }
  };
  controller.signal.addEventListener('abort',stop,{once:true});
  if(controller.signal.aborted)stop();else{arm(until);schedule(interval);}
  return stop;
}
