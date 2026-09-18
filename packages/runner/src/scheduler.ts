import {setTimeout as delay} from 'node:timers/promises';
export type LoopState='stopped'|'idle'|'working'|'retrying'|'recovery_required';
// Sequential, interruptible polling. Only explicit start can resume a stopped loop.
export class Scheduler {
  private controller?:AbortController;
  private task?:Promise<void>;
  state:LoopState='stopped';
  lastError?:string;
  constructor(private tick:(signal:AbortSignal)=>Promise<unknown>,private intervalMs=3000,private maxBackoffMs=30000){}
  start(){if(this.task)return;this.controller=new AbortController();const signal=this.controller.signal;this.task=this.run(signal).finally(()=>{this.task=undefined;this.controller=undefined;this.state='stopped';});}
  async stop(){this.controller?.abort();await this.task;}
  private async run(signal:AbortSignal){let failures=0;
    while(!signal.aborted){let wait=this.intervalMs;
      try{this.state='working';await this.tick(signal);this.state='idle';this.lastError=undefined;failures=0;}
      catch(error:any){if(signal.aborted)break;const code=String(error?.code??error?.message??'');
        if(/RECOVERY|UNCERTAIN|NO_RECOVERABLE|LOGIN_REQUIRED|IDENTITY_DENIED|RUNNER_DENIED|SOURCE_NOT_FOUND|LEASE_|RESULT_CONFLICT|SOURCE_CHANGED|ORIGINAL_UNAVAILABLE|NOT_RELEASE_APPROVED/.test(code)){
          this.state='recovery_required';this.lastError='ACTION_REQUIRED';
          await delay(2147483647,undefined,{signal}).catch(()=>{});break;
        }
        this.state='retrying';this.lastError='TEMPORARY_FAILURE';wait=Math.min(this.maxBackoffMs,this.intervalMs*2**Math.min(++failures,10));
      }
      await delay(wait,undefined,{signal}).catch(()=>{});
    }
  }
}
