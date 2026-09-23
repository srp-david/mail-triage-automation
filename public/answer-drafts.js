// Tab-scoped drafts only: never persist customer input in localStorage.
const drafts=new Map(),volatile=new Set();
const key=(store,id)=>'triage-answer:'+JSON.stringify([store,id]);
export function clearDrafts(){
  drafts.clear();volatile.clear();
  try{for(const name of Object.keys(sessionStorage))if(name.startsWith('triage-answer:'))sessionStorage.removeItem(name);}catch{}
}
export function readDraft(store,id){
  const name=key(store,id);
  if(!drafts.has(name)){
    try{drafts.set(name,sessionStorage.getItem(name)??'');}catch{drafts.set(name,'');}
  }
  return drafts.get(name);
}
export function saveDraft(store,id,value){
  const name=key(store,id);drafts.set(name,value);
  try{
    if(value)sessionStorage.setItem(name,value);else sessionStorage.removeItem(name);
    volatile.delete(name);return true;
  }catch{if(value)volatile.add(name);else volatile.delete(name);return false;}
}
window.addEventListener('beforeunload',event=>{
  if(volatile.size){event.preventDefault();event.returnValue='';}
});
