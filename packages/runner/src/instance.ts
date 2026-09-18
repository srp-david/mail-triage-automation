import {open,readFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
export async function acquireInstance(path:string){
  const nonce=randomUUID();const file=await open(path,'wx',0o600);
  await file.writeFile(JSON.stringify({pid:process.pid,nonce}));await file.close();
  return async()=>{const current=JSON.parse(await readFile(path,'utf8'));if(current.nonce!==nonce)throw new Error('LOCK_OWNER_CHANGED');await unlink(path);};
}
