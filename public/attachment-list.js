import { previewFormat } from './office-preview.js';
const LIMIT=5*1024*1024;
function node(tag,text,className){
  const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;
}
function fileType(attachment){
  const extension=String(attachment.filename??'').split('.').pop();
  if(attachment.filename?.includes('.')&&/^[a-z0-9]{1,10}$/i.test(extension))return extension.toUpperCase();
  return ({'application/zip':'ZIP','application/pdf':'PDF','image/png':'PNG','image/jpeg':'JPG','text/plain':'TXT',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'DOCX',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation':'PPTX',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'XLSX'})[attachment.contentType]??'파일';
}
function fileSize(size){
  if(!Number.isFinite(size)||size<0)return '크기 미확인';
  if(size<1024)return size+' B';
  if(size<1024*1024)return (size/1024).toFixed(1)+' KiB';
  return (size/1024/1024).toFixed(1)+' MiB';
}
export function attachmentList(attachments,download,preview){
  if(!attachments.length)return null;
  const section=node('details',null,'mail-attachments');
  section.append(node('summary','첨부파일 · '+attachments.length+'개'));
  const list=node('ul',null,'attachment-list');
  for(const attachment of attachments){
    const row=node('li',null,'attachment-row'),info=node('div',null,'attachment-info');
    info.append(node('strong',attachment.filename||'이름 없는 첨부파일','attachment-name'),
      node('span',fileType(attachment)+' · '+fileSize(attachment.size),'attachment-meta'));
    const button=node('button','다운로드','download-button');button.type='button';
    button.setAttribute('aria-label',(attachment.filename||'첨부파일')+' 다운로드');
    const status=node('p',null,'download-status');status.setAttribute('role','status');status.hidden=true;
    const tooLarge=attachment.size>LIMIT;
    if(!attachment.attachmentId||tooLarge){
      button.disabled=true;status.hidden=false;
      status.textContent=tooLarge?'5 MiB를 초과해 다운로드할 수 없습니다.':'첨부 식별자가 없어 다운로드할 수 없습니다.';
    }
    button.onclick=async()=>{
      button.disabled=true;button.textContent='가져오는 중…';status.hidden=true;
      try{await download(attachment);}
      catch(error){status.textContent=error.message??'다운로드에 실패했습니다. 다시 시도해 주세요.';status.hidden=false;}
      finally{button.disabled=false;button.textContent='다운로드';}
    };
    const actions=node('div',null,'attachment-actions');
    if(preview&&previewFormat(attachment)){
      const view=node('button','미리보기','preview-button');view.type='button';
      view.setAttribute('aria-label',(attachment.filename||'첨부파일')+' 미리보기');
      view.disabled=!attachment.attachmentId||tooLarge;
      view.onclick=()=>preview(attachment);
      actions.append(view);
    }
    actions.append(button);row.append(info,actions,status);list.append(row);
  }
  section.append(list);
  if(attachments.some(a=>a.size>LIMIT))section.append(node('p','현재 파일당 다운로드 한도는 5 MiB입니다.','attachment-limit'));
  return section;
}
