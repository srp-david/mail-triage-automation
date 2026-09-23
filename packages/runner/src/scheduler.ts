import {setTimeout as delay} from 'node:timers/promises';
export type LoopState='stopped'|'idle'|'working'|'retrying'|'recovery_required';
// Sequential, interruptible polling. Only explicit start can resume a stopped loop.
export class Scheduler {
  private controller?:AbortController;
  private sleep?:AbortController;
  private task?:Promise<void>;
  private draining=false;
  state:LoopState='stopped';
  lastError?:string;
  constructor(private tick:(signal:AbortSignal)=>Promise<unknown>,private intervalMs=3000,private maxBackoffMs=30000){}
  start(){if(this.task)return false;this.draining=false;this.controller=new AbortController();const signal=this.controller.signal;this.task=this.run(signal).finally(()=>{this.task=undefined;this.controller=undefined;this.sleep=undefined;this.state='stopped';});return true;}
  async stop(){this.controller?.abort();await this.task;}
  async drain(){this.draining=true;this.sleep?.abort();await this.task;}
  private async run(signal:AbortSignal){let failures=0,idle=0;
    while(!signal.aborted&&!this.draining){let wait=this.intervalMs;
      try{this.state='working';const result=await this.tick(signal);this.state='idle';this.lastError=undefined;failures=0;
        idle=result===null?idle+1:0;wait=Math.min(this.maxBackoffMs,this.intervalMs*2**Math.min(idle,10));}
      catch(error:any){if(signal.aborted)break;const code=String(error?.code??error?.message??'');
        if(error?.status===401||error?.status===403||/RECOVERY|UNCERTAIN|NO_RECOVERABLE|LOGIN_REQUIRED|IDENTITY_DENIED|RUNNER_DENIED|SOURCE_NOT_FOUND|LEASE_|RESULT_CONFLICT|SOURCE_CHANGED|ORIGINAL_UNAVAILABLE|NOT_RELEASE_APPROVED/.test(code)){
          this.state='recovery_required';this.lastError='ACTION_REQUIRED';
          if(this.draining)break;
          this.sleep=new AbortController();
          await delay(2147483647,undefined,{signal:AbortSignal.any([signal,this.sleep.signal])}).catch(()=>{});
          this.sleep=undefined;break;
        }
        this.state='retrying';this.lastError='TEMPORARY_FAILURE';wait=Math.min(this.maxBackoffMs,this.intervalMs*2**Math.min(++failures,10));
      }
      if(this.draining)break;
      this.sleep=new AbortController();
      await delay(wait,undefined,{signal:AbortSignal.any([signal,this.sleep.signal])}).catch(()=>{});
      this.sleep=undefined;
    }
  }
}
