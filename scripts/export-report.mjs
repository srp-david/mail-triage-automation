import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {client,options,uuid,sha256} from './admin-client.mjs';
try{
 const o=options(process.argv.slice(2));
 if(!o.run||!o.hash||!o.out)throw new Error('--run UUID --hash <검토한 reportHash> --out <새 Markdown 파일>');
 const {api}=await client(),run=await api('/runs/'+uuid(o.run));
 if(!run.result||run.reportHash!==o.hash||sha256(run.result.report)!==o.hash)throw new Error('검토한 보고서 버전과 다릅니다.');
 const content=`<!-- triage-report:${run.id} sha256:${run.reportHash} -->\n`+run.result.report+
   run.reviews.map(review=>'\n\n## '+review.author+' 리뷰\n\n'+review.body).join('');
 await writeFile(o.out,content,{flag:'wx',mode:0o600});
 console.log(JSON.stringify({path:path.resolve(o.out),runId:run.id,reportHash:run.reportHash,exportHash:sha256(content),reviews:run.reviews.length}));
}catch(error){console.error(error.message);process.exitCode=1;}
