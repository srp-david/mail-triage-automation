// Native details/summary supplies keyboard interaction without nested buttons.
export function renderThreads(container,threads,mailButton,expanded,selectedId,controls){
  for(const thread of threads){
    if(thread.emails.length===1){
      const mail=thread.emails[0],row=document.createElement('div'),button=mailButton(mail);row.className='thread-singleton';row.append(button);
      controls?.target(row,mail);
      if((thread.totalMembers??1)===1||mail.manualLinkIds?.length)controls?.source(button,mail);
      container.append(row);continue;
    }
    const latest=thread.emails[0],group=document.createElement('details');group.className='mail-thread';group.dataset.threadId=thread.id;
    const summary=document.createElement('summary');summary.className='thread-summary';
    const title=document.createElement('strong');title.textContent=latest.subject||'(제목 없음)';
    const count=document.createElement('span');count.className='thread-count';count.textContent=thread.emails.length+'개 메일';
    const meta=document.createElement('span');meta.className='thread-meta';
    meta.textContent=(latest.from??[]).map(sender=>sender.name||sender.address).join(', ')+' · '+(latest.sentAt?new Date(latest.sentAt).toLocaleString('ko-KR'):'날짜 미확인');
    summary.append(title,count,meta);
    if(thread.manualLinkIds?.length){const badge=document.createElement('span');badge.className='thread-manual-badge';badge.textContent='수동 연결';summary.append(badge);}
    controls?.target(summary,latest);
    const members=document.createElement('div');members.className='thread-members';
    for(const mail of thread.emails){const button=mailButton(mail);if(mail.manualLinkIds?.length)controls?.source(button,mail);members.append(button);}
    group.append(summary,members);
    group.open=expanded.has(thread.id)?expanded.get(thread.id):thread.emails.some(mail=>String(mail.id)===String(selectedId));
    group.addEventListener('toggle',()=>{if(group.isConnected)expanded.set(thread.id,group.open);});
    container.append(group);
  }
}
