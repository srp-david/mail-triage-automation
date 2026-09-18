// Only complete upstream searches are cached. Grouping, links and analysis
// states are reapplied for each request, before pagination.
export class ThreadSearchCache<T> {
  private entries=new Map<string,{promise:Promise<T>;expires:number;bytes:number}>();
  private revision='';
  constructor(private ttl=15000,private maxEntries=8,private maxBytes=16*1024*1024,private now=Date.now){}
  clear(){this.entries.clear();}
  get(key:string,revision:string,load:()=>Promise<T>,refresh=false):Promise<T>{
    if(this.revision!==revision){this.clear();this.revision=revision;}
    const previous=this.entries.get(key);
    if(!refresh&&previous&&previous.expires>this.now()){
      this.entries.delete(key);this.entries.set(key,previous);return previous.promise;
    }
    if(previous)this.entries.delete(key);
    while(this.entries.size>=this.maxEntries)this.entries.delete(this.entries.keys().next().value!);
    const entry={promise:null as unknown as Promise<T>,expires:Infinity,bytes:0};
    entry.promise=Promise.resolve().then(load).then(value=>{
      if(this.entries.get(key)!==entry)return value;
      entry.bytes=Buffer.byteLength(JSON.stringify(value));entry.expires=this.now()+this.ttl;
      while([...this.entries.values()].reduce((sum,item)=>sum+item.bytes,0)>this.maxBytes)
        this.entries.delete(this.entries.keys().next().value!);
      return value;
    },error=>{if(this.entries.get(key)===entry)this.entries.delete(key);throw error;});
    this.entries.set(key,entry);return entry.promise;
  }
}
