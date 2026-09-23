import { attachmentCard, isImageAttachment } from './attachments.js';
const tags=new Set('p div span br hr b strong i em u s blockquote pre code ul ol li table thead tbody tfoot tr td th h1 h2 h3 h4 h5 h6 a'.split(' '));
const drop=new Set('script style iframe object embed form input button textarea select svg math link meta base template'.split(' '));
export function renderMailBody(body,attachments,fetchAttachment){
  const container=document.createElement('div');container.className='mail-body';
  const cards=[],used=new Set();
  const byId=new Map(attachments.filter(isImageAttachment).map(a=>[a.attachmentId,a]));
  const byCid=new Map();
  for(const image of body.inlineImages??[]){
    if(typeof image.contentId!=='string'||!byId.has(image.attachmentId))continue;
    // Ambiguous CIDs must not silently point to a different attachment.
    byCid.set(image.contentId,byCid.has(image.contentId)?null:image.attachmentId);
  }
  const template=document.createElement('template');
  // Template contents are inert. Rebuild only allowed nodes; never insert source nodes.
  template.innerHTML=body.html;
  function copy(source,parent,depth=0){
    if(depth>100)return;
    if(source.nodeType===3){parent.append(document.createTextNode(source.textContent));return;}
    if(source.nodeType!==1)return;
    const tag=source.localName;
    if(drop.has(tag))return;
    if(tag==='img'){
      let cid=null;
      const src=source.getAttribute('src')??'';
      if(/^cid:/i.test(src)){try{cid=decodeURIComponent(src.slice(4));}catch{}}
      const id=cid==null?null:byCid.get(cid);
      const attachment=id?byId.get(id):null;
      if(attachment){
        const card=attachmentCard(attachment,()=>fetchAttachment(attachment),{
          inline:true,
          onRetry:()=>Promise.all(cards.filter(c=>c.element.dataset.attachmentId===id).map(c=>c.load()))
        });
        card.element.dataset.attachmentId=id;
        parent.append(card.element);cards.push(card);used.add(id);
      }else{
        const label=document.createElement('span');label.className='image-unavailable';
        label.textContent='['+(source.getAttribute('alt')||'이미지')+' · '+(cid==null?'외부 이미지 표시 안 함':'연결된 첨부 없음')+']';
        parent.append(label);
      }
      return;
    }
    let target=parent;
    if(tags.has(tag)){
      target=document.createElement(tag);
      if(tag==='a'){
        const href=source.getAttribute('href')??'';
        if(/^(https?:\/\/|mailto:)/i.test(href)){target.href=href;target.target='_blank';target.rel='noopener noreferrer';}
      }
      if(tag==='td'||tag==='th'){
        for(const name of ['rowspan','colspan']){
          const value=source.getAttribute(name);
          if(value&&/^\d{1,2}$/.test(value)&&Number(value)>0)target.setAttribute(name,value);
        }
      }
      parent.append(target);
    }
    for(const child of source.childNodes)copy(child,target,depth+1);
  }
  for(const child of template.content.childNodes)copy(child,container);
  return {element:container,cards,used};
}
