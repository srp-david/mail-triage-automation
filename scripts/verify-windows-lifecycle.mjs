import {createServer} from 'node:net';
import {installRelease,uninstallApplication} from '../installer/windows/release.mjs';
import {startApp,stopApp,pauseApp,createShortcut} from '../installer/windows/lifecycle.mjs';
import {mkdir,mkdtemp,writeFile,readFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import assert from 'node:assert/strict';
const payload=resolve(process.argv[2]);await mkdir('.runtime/lifecycle',{recursive:true});const home=await mkdtemp(resolve('.runtime/lifecycle/한글 설치-'));
await installRelease(home,payload,{allowCandidate:true});
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin='http://127.0.0.1:'+port;
await writeFile(join(home,'config/settings.json'),JSON.stringify({localPort:port,historyUrl:'https://synthetic.invalid',auth:{mode:'username',issuer:'https://synthetic.invalid/',audience:'synthetic'}}));
let running=false;
try{
  await assert.rejects(startApp(home,{open:false}),/CANDIDATE_NOT_APPROVED/);
  await startApp(home,{allowCandidate:true,open:false});running=true;
  const control=await new ProtectedStore(join(home,'secrets')).read('cli-control');
  assert.equal((await fetch(origin+'/api/session')).status,401);
  assert.equal((await fetch(origin+'/api/app-pause',{method:'POST'})).status,401);
  assert.equal((await pauseApp(home)).ok,true);
  const ticket=await (await fetch(origin+'/api/browser-ticket',{method:'POST',headers:{authorization:'Bearer '+control.token,'x-local-client':'1'}})).json();
  const enter=await fetch(ticket.url,{redirect:'manual'});assert.equal(enter.status,302);const cookie=enter.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await fetch(origin+'/api/session',{headers:{cookie}})).json()).authenticated,false);
  await createShortcut(home,join(home,'synthetic.lnk'));await access(join(home,'synthetic.lnk'));
  await stopApp(home);running=false;await assert.rejects(access(join(home,'app.lock')));
  assert.ok(await readFile(join(home,'config/settings.json'),'utf8'));assert.equal((await uninstallApplication(home)).privateStatePreserved,true);
  console.log(JSON.stringify({home,candidateBlocked:true,packagedAppStarted:true,bootstrapProtected:true,controlledPause:true,shortcut:true,gracefulStop:true,settingsPreserved:true,realAuthentication:false}));
}finally{if(running)await stopApp(home);}
