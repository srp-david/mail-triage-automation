import { HttpError } from './config.js';
export const DOWNLOAD_LIMIT=5*1024*1024;
export function attachmentDownload(result:any,emailId:number,attachmentId:string){
  let metadata=result.structuredContent;
  if(!metadata){
    for(const block of result.content??[]){
      if(block.type!=='text')continue;
      try{metadata=JSON.parse(block.text);break;}catch{}
    }
  }
  if(result.isError||metadata?.code){
    const tooLarge=metadata?.code==='ATTACHMENT_TOO_LARGE';
    throw new HttpError(tooLarge?413:502,tooLarge?'현재 다운로드는 파일당 5 MiB까지 지원합니다.':'첨부파일을 불러오지 못했습니다. 다시 시도해 주세요.');
  }
  if(metadata?.emailId!==emailId||metadata?.attachment?.attachmentId!==attachmentId)
    throw new HttpError(502,'요청한 메일의 첨부파일과 응답이 일치하지 않습니다.');
  const block=(result.content??[]).find((x:any)=>x.type==='image'||x.type==='resource'&&typeof x.resource?.blob==='string');
  const encoded=block?.type==='image'?block.data:block?.resource?.blob;
  if(typeof encoded!=='string'||encoded.length>Math.ceil(DOWNLOAD_LIMIT/3)*4||encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))
    throw new HttpError(502,'첨부파일 응답 형식이 올바르지 않습니다.');
  const data=Buffer.from(encoded,'base64');
  if(data.length>DOWNLOAD_LIMIT)throw new HttpError(413,'현재 다운로드는 파일당 5 MiB까지 지원합니다.');
  if(data.toString('base64')!==encoded)throw new HttpError(502,'첨부파일 데이터가 올바르지 않습니다.');
  // Only a base filename may become a download name, including for Windows paths.
  const filename=String(metadata.attachment.filename??'attachment').split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f]/g,'').trim();
  return {data,filename:filename&&filename!=='.'&&filename!=='..'?filename:'attachment'};
}
