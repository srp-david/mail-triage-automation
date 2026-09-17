import { claimRun } from './history.js';
export async function claimWhenApiReady(apiUrl:string) {
  try{
    const response=await fetch(new URL('/health',apiUrl),{signal:AbortSignal.timeout(5000)});
    if(!response.ok)return null;
    const health=await response.json();if(health.ok!==true)return null;
  }catch{return null;}
  return claimRun();
}
