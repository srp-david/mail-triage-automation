const imageTypes=new Set(['image/png','image/jpeg','image/gif','image/webp','image/bmp','image/avif']);
export function previewImageType(attachment){
  const mime=String(attachment.contentType??'').split(';')[0].trim().toLowerCase();
  if(imageTypes.has(mime))return mime;
  if(mime&&mime!=='application/octet-stream')return null;
  const extension=String(attachment.filename??'').split('.').pop().toLowerCase();
  return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp',avif:'image/avif'})[extension]??null;
}
export function isImageAttachment(attachment){
  return String(attachment.contentType??'').toLowerCase().startsWith('image/');
}
function jsonMetadata(result){
  if(result.structuredContent)return result.structuredContent;
  for(const block of result.content??[]){
    if(block.type!=='text')continue;
    try{return JSON.parse(block.text);}catch{}
  }
  return {};
}
export function imageSources(result){
  const metadata=jsonMetadata(result);
  if(result.isError||metadata.code){
    throw new Error(metadata.message??metadata.hint??'첨부 이미지를 가져오지 못했습니다.');
  }
  const sources=[];
  for(const block of result.content??[]){
    const mime=String(block.type==='resource'?block.resource?.mimeType:block.mimeType).split(';')[0].trim().toLowerCase();
    const data=block.type==='image'?block.data:block.type==='resource'?block.resource?.blob:null;
    if(imageTypes.has(mime)&&typeof data==='string'&&data.length){
      sources.push('data:'+mime+';base64,'+data);
    }
  }
  if(!sources.length)throw new Error('이 첨부는 표시 가능한 이미지로 제공되지 않았습니다.');
  return sources;
}
function node(tag,text,className){
  const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;
}
export function attachmentCard(attachment,fetchAttachment,{inline=false,onRetry=null}={}){
  const card=node(inline?'span':'figure',null,'attachment-card'+(inline?' inline-image':''));
  const caption=node(inline?'span':'figcaption',attachment.filename??'첨부 이미지');
  caption.hidden=inline;
  const status=node(inline?'span':'p','이미지를 불러오는 중입니다.','attachment-status');
  status.setAttribute('role','status');
  const content=node(inline?'span':'div',null,'attachment-content');
  const retry=node('button','다시 불러오기');retry.type='button';retry.hidden=true;
  card.append(caption,status,content,retry);
  let loading=false,loaded=false;
  async function load(){
    if(loading||loaded)return;
    loading=true;retry.hidden=true;status.hidden=false;status.textContent='이미지를 불러오는 중입니다.';content.replaceChildren();
    try{
      const result=await fetchAttachment();
      const sources=imageSources(result);
      // Wait for decoding, so broken images become an explicit failure with retry.
      for(const src of sources){
        const image=node('img',null,'attachment');image.alt=attachment.filename??'메일 첨부 이미지';image.decoding='async';
        const decoded=new Promise((resolve,reject)=>{
          image.onload=()=>image.naturalWidth>0?resolve():reject(new Error('이미지를 표시할 수 없습니다.'));
          image.onerror=()=>reject(new Error('이미지 파일을 표시할 수 없습니다.'));
        });
        image.src=src;content.append(image);await decoded;
      }
      loaded=true;status.hidden=true;
    }catch(error){
      content.replaceChildren();status.textContent=error.message??'이미지를 불러오지 못했습니다.';retry.hidden=false;
    }finally{loading=false;}
  }
  retry.onclick=()=>void (onRetry?onRetry():load());
  return {element:card,load};
}
export async function loadImageCards(cards,concurrency=3){
  let next=0;
  await Promise.all(Array.from({length:Math.min(concurrency,cards.length)},async()=>{
    for(;;){const index=next++;if(index>=cards.length)return;await cards[index].load();}
  }));
}
