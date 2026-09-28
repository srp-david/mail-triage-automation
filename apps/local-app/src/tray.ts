import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {controlRequest} from './control-client.js';
import type {UpdateState} from '../../../packages/contracts/src/update-state.js';

type TrayCommand='open'|'settings'|'updates'|'pause'|'resume'|'quit';
type TrayState={analysis:string;sync:string;canPause:boolean;canResume:boolean;update?:UpdateState};
const allowed=new Set(['open','settings','updates','pause','resume','quit']);
const labels:Record<string,string>={stopped:'중지',idle:'대기',working:'작업 중',retrying:'재시도',recovery_required:'복구 필요'};
export async function openLocalBrowser(control:{port:number;token:string;pid:number},page?:'settings'|'updates'){
  const {url}=await (await controlRequest(control,'/api/browser-ticket',page?{page}:{})).json();
  if(typeof url!=='string'||!/^http:\/\/127\.0\.0\.1:[0-9]{4,5}\/auth\/bootstrap\?ticket=[A-Za-z0-9_-]{43}$/.test(url))throw new Error('INVALID_BOOTSTRAP');
  await new Promise<void>((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Start-Process -FilePath $env:TRIAGE_BROWSER_URL -WindowStyle Hidden'],{windowsHide:true,env:{...process.env,TRIAGE_BROWSER_URL:url},stdio:'ignore'});
    child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('BROWSER_OPEN_FAILED')));
  });
}
export class WindowsTray {
  private child?:ChildProcessWithoutNullStreams;
  private timer?:ReturnType<typeof setInterval>;
  private closed=false;
  private busy=false;
  private restarts=0;
  private notified?:string;
  constructor(private executable:string,private state:()=>TrayState,private action:(command:TrayCommand)=>Promise<unknown>,private launch=(file:string)=>spawn(file,[],{windowsHide:true,stdio:['pipe','pipe','pipe']})){}
  start(){
    if(this.closed||this.child)return;
    const child=this.launch(this.executable);this.child=child;let pending='';
    child.stderr.resume();child.stdin.on('error',()=>{});
    child.stdout.on('data',(chunk:Buffer)=>{
      pending+=chunk.toString('utf8');if(pending.length>4096){child.kill();return;}
      let newline:number;while((newline=pending.indexOf('\n'))>=0){const line=pending.slice(0,newline).trim();pending=pending.slice(newline+1);
        if(allowed.has(line)&&!this.busy)void this.perform(line as TrayCommand);
      }
    });
    const ended=()=>{
      if(this.child!==child)return;this.child=undefined;if(this.timer)clearInterval(this.timer);
      if(!this.closed&&this.restarts++<2)setTimeout(()=>this.start(),1000).unref();
    };
    child.once('error',ended);child.once('close',ended);
    this.update();this.timer=setInterval(()=>this.update(),1000);this.timer.unref();
  }
  private send(value:object){if(!this.closed&&this.child?.stdin.writable)this.child.stdin.write(JSON.stringify(value)+'\n');}
  private update(message?:string){const s=this.state(),u=s.update;
    const available=u?.status==='offered'&&u.phase==='idle'&&!u.deferred;
    if(available&&u.update&&this.notified!==u.update.releaseId){this.notified=u.update.releaseId;message??=`새 버전 ${u.update.version}이 있습니다. 업데이트 확인 메뉴에서 설치할 수 있습니다.`;}
    this.send({label:`분석 ${labels[s.analysis]??'확인 필요'} · 동기화 ${labels[s.sync]??'확인 필요'}`,canPause:s.canPause,canResume:s.canResume,busy:this.busy,
      updateLabel:available?`새 버전 ${u.update?.version} · 업데이트 확인`:u?.phase==='checking'?'업데이트 확인 중':u?.phase==='error'?'업데이트 확인 필요':u&&['downloading','verifying','waiting','installing'].includes(u.phase)?'업데이트 진행 중':'업데이트 확인',...(message?{message}:{})});}
  private async perform(command:TrayCommand){
    this.busy=true;this.update();
    try{await this.action(command);}
    catch(error){const code=error instanceof Error?error.message:'';
      this.update(/LOGIN|UNAUTHENTICATED|PASSWORD|SESSION/.test(code)?'웹 화면에서 로그인 상태를 확인하세요.':/NO_PAUSED_WORK/.test(code)?'재개할 작업이 없습니다. 웹 화면에서 실행을 켜세요.':'요청을 완료하지 못했습니다. 웹 화면에서 설정과 실행 상태를 확인하세요.');
    }finally{this.busy=false;this.update();}
  }
  async close(){
    this.closed=true;if(this.timer)clearInterval(this.timer);const child=this.child;if(!child)return;
    await new Promise<void>(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},3000);child.once('close',()=>{clearTimeout(timer);resolve();});child.stdin.end();});
  }
}
