import {createServer} from 'node:net';
import {readFile,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyRelease} from './release.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export async function diagnoseRelease(path){
  path=resolve(path);
  const manifest=await verifyRelease(path);await access(join(path,'node.exe'));await access(join(path,'dist/apps/local-app/src/main.js'));
  if(process.platform==='win32')await exec(join(path,'node.exe'),['--input-type=module','-e',"await import('./dist/apps/local-app/src/browser-app.js');await import('./dist/apps/local-app/src/executor.js');await import('./dist/apps/local-app/src/runtime.js');"],{cwd:path,windowsHide:true,timeout:10000,maxBuffer:100000});
  return {version:manifest.version,contractVersion:manifest.contractVersion,releaseApproved:manifest.releaseApproved,nodeVersion:manifest.nodeVersion};
}
export async function diagnoseLocal(path,home,{connectMcp=false}={}){
  path=resolve(path);home=resolve(home);
  const release=await diagnoseRelease(path),settings=JSON.parse(await readFile(join(home,'config/settings.json'),'utf8'));
  const {AgentAdapter,childEnvironment}=await import(pathToFileURL(join(path,'dist/packages/agent-adapters/src/index.js')).href);
  const agents={};for(const agent of ['codex','claude']){
    const command=settings.agents?.[agent];if(!command){agents[agent]={configured:false};continue;}
    try{const probe=await new AgentAdapter({agent,command,version:agent==='codex'?'0.154.0':'2.1.276'}).probe();let credentialPresent=false;
      try{const args=agent==='codex'?['login','status']:['auth','status'];const out=await exec(command.executable,[...(command.prefix??[]),...args],{env:childEnvironment(),windowsHide:true,timeout:10000,maxBuffer:100000});credentialPresent=agent==='codex'||JSON.parse(out.stdout).loggedIn===true;}catch{}
      agents[agent]={configured:true,installed:true,supported:probe.supported,credentialPresent,providerAccessVerified:false};
    }catch{agents[agent]={configured:true,installed:false,credentialPresent:false};}
  }
  let mailMcp={configured:!!settings.mailMcpUrl,checked:false};
  if(connectMcp&&settings.mailMcpUrl){
    const endpoint=new URL(settings.mailMcpUrl);if(endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!(endpoint.protocol==='https:'||endpoint.protocol==='http:'&&endpoint.hostname==='127.0.0.1'))throw new Error('INVALID_MCP_ENDPOINT');
    const {Client}=await import('@modelcontextprotocol/sdk/client/index.js'),{StreamableHTTPClientTransport}=await import('@modelcontextprotocol/sdk/client/streamableHttp.js');const client=new Client({name:'triage-diagnose',version:'1'});
    try{await client.connect(new StreamableHTTPClientTransport(endpoint));const names=(await client.listTools()).tools.map(t=>t.name);mailMcp={configured:true,checked:true,connected:true,requiredTools:['get_email','search_emails','sync'].every(n=>names.includes(n))};}catch{mailMcp={configured:true,checked:true,connected:false};}finally{await client.close().catch(()=>{});}
  }
  if(settings.auth?.mode!=='username')throw new Error('USERNAME_AUTH_SETTINGS_REQUIRED');
  return {...release,portAvailable:await portAvailable(settings.localPort??3080),agents,mailMcp,authentication:'username login and live server session verification required'};
}
export async function portAvailable(port=3080){return new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(process.argv[3]?await diagnoseLocal(process.argv[2],process.argv[3],{connectMcp:process.argv.includes('--connect-mcp')}):{...await diagnoseRelease(process.argv[2]),portAvailable:await portAvailable()}));}catch{console.error('LOCAL_DIAGNOSTICS_FAILED');process.exitCode=1;}}
