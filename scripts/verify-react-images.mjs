// Isolated UI smoke tests: no production mounts, credentials, DB or MCP.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const docker=args=>execFileSync('docker',args,{encoding:'utf8'}).trim();
const results=[];
for(const [variant,image] of [['legacy',process.env.LEGACY_IMAGE??'mail-triage-web:pre-react-97525f6'],['react',process.env.REACT_IMAGE??'mail-triage-web:local']]){
 const name='triage-ui-smoke-'+variant+'-'+Date.now();let id;
 try{
  id=docker(['run','--rm','-d','--name',name,'-p','127.0.0.1::3080','-e','NODE_ENV=test','-e','TRIAGE_TOKEN=synthetic-image-smoke-token-only',image,'node','--input-type=module','-e',"import('./dist/server.js').then(({createApp})=>createApp().listen(3080,'0.0.0.0'))"]);
  const base='http://'+docker(['port',id,'3080/tcp']);
  let response;for(let i=0;i<30;i++){try{response=await fetch(base);if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,200));}
  assert.equal(response?.status,200);const html=await response.text();assert.equal(html.includes('/react/assets/'),variant==='react');
  for(const asset of [...html.matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g)].map(m=>m[1]))assert.equal((await fetch(new URL(asset,base))).status,200);
  assert.equal((await fetch(base+'/preview/')).status,200);
  assert.equal((await fetch(base+'/markdown/viewer.js')).status,200);
  const result=spawnSync(process.execPath,['--import','tsx','scripts/verify-history-ui.mjs'],{env:{...process.env,PREVIEW_BASE_URL:base},encoding:'utf8',timeout:180000});
  if(result.status!==0)throw Error(result.stdout+result.stderr);
  results.push({variant,image,imageId:docker(['image','inspect',image,'--format','{{.Id}}']),root:true,assets:true,office:true,markdown:true,syntheticHistory:true});
 }finally{if(id)docker(['stop',id]);}
}
await mkdir('.runtime/react-validation',{recursive:true});await writeFile('.runtime/react-validation/images.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
