import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const names=process.argv.slice(2);
const suite=names.length?names:['pre-p1-ux','status-filter','mail-threads','manual-threads','mail-scroll','image-preview','preview','mail-analysis','analysis-progress','handling-ui','related-mails','history-ui','markdown','maintenance-ui','sync-refresh','mui-ui'];
const directory='.runtime/react-validation/react';
await mkdir(directory,{recursive:true});
const results=[];
// Sequential browser checks keep clock, CPU and screenshot comparisons reproducible.
for(const name of suite){
 const started=Date.now();let output='';
 const child=spawn(process.execPath,['--import','tsx',`scripts/verify-${name}.mjs`],{env:{...process.env,PREVIEW_BASE_URL:''},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;child.kill();},180000);
 const code=await new Promise(resolve=>{child.on('error',e=>{output+=e.stack;resolve(-1);});child.on('exit',resolve);});
 clearTimeout(timer);
 const result={name,code,timedOut,ms:Date.now()-started};results.push(result);
 await writeFile(`${directory}/${name}.log`,output);
 await writeFile(`${directory}/results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(result));
 if(code!==0)console.log(output.slice(-3500));
}
process.exitCode=results.some(x=>x.code!==0||x.timedOut)?1:0;
