// Read-only API timing; stores counts and durations, never mail content.
import {mkdir,writeFile} from 'node:fs/promises';
import {client} from './admin-client.mjs';
const label=process.argv[2]??'after';if(!['before','after'].includes(label))throw Error('Use before or after');
const {api}=await client(),results=[];
for(const [view,offset,refresh] of [['individual',0,false],['threads',0,true],['threads',30,false],['threads',0,false],['threads',30,false],['threads',0,true]]){
 const start=performance.now(),page=await api('/mails?limit=30&view='+view+'&offset='+offset+(refresh?'&refresh=1':''));
 results.push({view,offset,refresh,ms:Math.round(performance.now()-start),total:page.total,mailTotal:page.mailTotal,rows:page.threads?.length??page.emails?.length});
}
await mkdir('.runtime/query-cache',{recursive:true});await writeFile('.runtime/query-cache/'+label+'.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
