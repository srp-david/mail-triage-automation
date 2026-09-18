export function manualThreadControls({api,getStoreId,refresh}){
  const tools=document.getElementById('manual-thread-tools'),status=document.getElementById('thread-action-status');
  const manager=document.getElementById('thread-link-manager'),list=document.getElementById('thread-link-list');
  const detachZone=document.getElementById('thread-detach-zone');
  const type='application/x-mail-triage-thread';
  let dragging=null,busy=false,generation=0,revealId=null;
  const node=(tag,text,className)=>{const element=document.createElement(tag);if(text!=null)element.textContent=text;if(className)element.className=className;return element;};
  const button=(text,handler)=>{const element=node('button',text,'secondary-button');element.type='button';element.onclick=handler;return element;};
  const identity=mail=>({id:mail.id,messageId:mail.messageId??null,fetchedAt:mail.fetchedAt});
  const capture=mail=>({storeId:getStoreId(),identity:identity(mail),subject:mail.subject||'(제목 없음)',linkIds:mail.manualLinkIds??[]});
  const clearHighlights=()=>document.querySelectorAll('.thread-drop-target').forEach(element=>element.classList.remove('thread-drop-target'));
  function clearSelection(){dragging=null;clearHighlights();detachZone.classList.remove('is-dragging');}
  function show(text,undo){
    status.replaceChildren(node('span',text));
    if(undo)status.append(button('되돌리기',undo));
  }
  async function load(){
    const request=++generation,store=getStoreId();list.setAttribute('aria-busy','true');
    try{
      const links=await api('/thread-links');if(request!==generation||store!==getStoreId())return;
      list.replaceChildren();
      if(!links.length)list.append(node('p','저장된 수동 연결이 없습니다.','meta'));
      for(const link of links){
        const row=node('div',null,'thread-link-row');
        row.append(node('span',(link.source.subject||'(제목 없음)')+' ↔ '+(link.target.subject||'(제목 없음)')),
          button('연결 해제',()=>remove(link.id,store)));
        list.append(row);
      }
    }catch(error){if(request===generation)list.replaceChildren(node('p',error.message),button('다시 조회',load));}
    finally{if(request===generation)list.removeAttribute('aria-busy');}
  }
  async function changed(text,undo){
    show(text,undo);
    try{await refresh();}catch{status.prepend(node('span','목록을 갱신하지 못했습니다. 다시 검색해 주세요. '));}
    if(manager.open)await load();
  }
  async function remove(id,store){
    if(busy)return;
    if(store!==getStoreId()){show('메일 저장소가 변경되었습니다. 다시 조회해 주세요.');return;}
    busy=true;tools.setAttribute('aria-busy','true');clearSelection();
    try{
      await api('/thread-links/'+encodeURIComponent(id)+'/unlink',{storeId:store});
      await changed('수동 연결을 해제했습니다. 답장 헤더나 다른 연결이 있으면 같은 대화로 남을 수 있습니다.');
    }catch(error){show('연결을 해제하지 못했습니다. '+error.message);}
    finally{busy=false;tools.removeAttribute('aria-busy');}
  }
  async function connect(source,target){
    if(busy||!source||source.identity.id===target.id)return;
    if(source.storeId!==getStoreId()){clearSelection();show('메일 저장소가 변경되었습니다. 다시 선택해 주세요.');return;}
    busy=true;tools.setAttribute('aria-busy','true');clearSelection();show('대화에 연결하는 중입니다…');
    try{
      const result=await api('/thread-links',{storeId:source.storeId,source:source.identity,target:identity(target)});
      revealId=source.identity.id;
      await changed('“'+source.subject+'” 메일을 “'+(target.subject||'(제목 없음)')+'” 대화에 연결했습니다.',
        result.created?()=>remove(result.link.id,source.storeId):null);
    }catch(error){show('대화에 연결하지 못했습니다. '+error.message+' 다시 끌어다 놓아 주세요.');}
    finally{busy=false;tools.removeAttribute('aria-busy');}
  }
  manager.addEventListener('toggle',()=>{if(manager.open)void load();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')clearSelection();});
  const validDetach=()=>!busy&&dragging&&dragging.storeId===getStoreId()&&dragging.linkIds.length>0;
  detachZone.addEventListener('dragover',event=>{
    if(validDetach()&&event.dataTransfer?.types.includes(type)){event.preventDefault();event.dataTransfer.dropEffect='move';detachZone.classList.add('thread-drop-target');}
  });
  detachZone.addEventListener('dragleave',()=>detachZone.classList.remove('thread-drop-target'));
  detachZone.addEventListener('drop',event=>{
    if(!validDetach()||event.dataTransfer?.getData(type)!==dragging.nonce)return;
    event.preventDefault();event.stopPropagation();void detach(dragging);
  });
  async function detach(source){
    busy=true;tools.setAttribute('aria-busy','true');clearSelection();show('수동 연결을 해제하는 중입니다…');
    try{
      await api('/thread-links/detach',{storeId:source.storeId,mail:source.identity,linkIds:source.linkIds});
      await changed('“'+source.subject+'” 메일의 수동 연결을 해제했습니다. 자동 답장 관계는 유지됩니다.');
    }catch(error){show('연결을 해제하지 못했습니다. '+error.message+' 다시 끌어다 놓아 주세요.');}
    finally{busy=false;tools.removeAttribute('aria-busy');}
  }
  return {
    setView(enabled){tools.hidden=!enabled;status.hidden=!enabled;detachZone.hidden=true;clearSelection();},
    afterRender(){
      detachZone.hidden=tools.hidden||!document.querySelector('#mails .thread-detachable');
      if(revealId!=null){const member=document.querySelector('#mails .mail[data-mail-id="'+revealId+'"]');
        const group=member?.closest('.mail-thread');if(group)group.open=true;revealId=null;}
    },
    source(element,mail){
      if(typeof mail.fetchedAt!=='string')return;
      const detachable=!!mail.manualLinkIds?.length;
      element.draggable=true;element.classList.add('thread-draggable');element.classList.toggle('thread-detachable',detachable);
      element.title=detachable?'아래 해제 영역으로 끌어내어 수동 연결 해제':'다른 대화에 끌어다 놓아 연결';
      element.addEventListener('dragstart',event=>{
        if(busy||!event.dataTransfer){event.preventDefault();return;}
        clearSelection();dragging={...capture(mail),nonce:crypto.randomUUID()};
        event.dataTransfer.effectAllowed=detachable?'move':'link';event.dataTransfer.setData(type,dragging.nonce);
        detachZone.classList.toggle('is-dragging',detachable);
      });
      element.addEventListener('dragend',clearSelection);
    },
    target(element,mail){
      const valid=source=>!busy&&source&&!source.linkIds.length&&source.storeId===getStoreId()&&source.identity.id!==mail.id;
      element.addEventListener('dragover',event=>{
        if(valid(dragging)&&event.dataTransfer?.types.includes(type)){
          event.preventDefault();event.dataTransfer.dropEffect='link';element.classList.add('thread-drop-target');
        }
      });
      element.addEventListener('dragleave',event=>{if(!element.contains(event.relatedTarget))element.classList.remove('thread-drop-target');});
      element.addEventListener('drop',event=>{
        const source=dragging;clearHighlights();
        if(!valid(source)||event.dataTransfer?.getData(type)!==source.nonce)return;
        event.preventDefault();event.stopPropagation();void connect(source,mail);
      });
    }
  };
}
