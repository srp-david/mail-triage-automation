const list=()=>document.getElementById('mails');
export const hasMailPaneScroll=()=>getComputedStyle(list()).overflowY==='auto';
export function captureMailPosition(){
  const box=list(),pane=hasMailPaneScroll(),top=pane?box.getBoundingClientRect().top:0;
  const bottom=pane?box.getBoundingClientRect().bottom:innerHeight;
  const anchors=[...box.querySelectorAll('.mail')].filter(el=>{
    const rect=el.getBoundingClientRect();return rect.height&&rect.bottom>top&&rect.top<bottom;
  }).slice(0,12).map(el=>({id:el.dataset.mailId,top:el.getBoundingClientRect().top-top}));
  return {pane,scroll:pane?box.scrollTop:scrollY,anchors};
}
export function restoreMailPosition(position){
  if(!position||position.pane!==hasMailPaneScroll())return;
  const box=list(),set=value=>position.pane?box.scrollTop=value:window.scrollTo(0,value);
  set(position.scroll);
  for(const anchor of position.anchors){
    const el=box.querySelector('.mail[data-mail-id="'+anchor.id+'"]');
    if(!el?.getBoundingClientRect().height)continue;
    const top=position.pane?box.getBoundingClientRect().top:0;
    set((position.pane?box.scrollTop:scrollY)+el.getBoundingClientRect().top-top-anchor.top);break;
  }
}
