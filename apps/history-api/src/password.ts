import {argon2id,argon2Verify} from 'hash-wasm';
import {randomBytes} from 'node:crypto';
import {ApiError} from '../../../packages/contracts/src/v1.js';
export const passwordPolicy={memorySize:19456,iterations:2,parallelism:1,hashLength:32} as const;
export function checkPassword(value:unknown):asserts value is string {
  if(typeof value!=='string'||value.length<12||Buffer.byteLength(value,'utf8')>128)throw new ApiError(400,'PASSWORD_POLICY');
}
export function username(value:unknown){
  if(typeof value!=='string'||!/^[a-zA-Z][a-zA-Z0-9_.-]{2,31}$/.test(value))throw new ApiError(400,'USERNAME_INVALID');
  return value.toLowerCase();
}
// Bound simultaneous WASM allocations in a warm Edge isolate. No weaker fallback.
let busy=false;
async function exclusive<T>(fn:()=>Promise<T>){if(busy)throw new ApiError(429,'AUTH_BUSY');busy=true;try{return await fn();}finally{busy=false;}}
export const hashPassword=(password:string)=>exclusive(()=>{checkPassword(password);return argon2id({...passwordPolicy,password,salt:randomBytes(16),outputType:'encoded'});});
export const verifyPassword=(password:string,hash:string)=>exclusive(async()=>{
  if(Buffer.byteLength(password,'utf8')>128)return false;
  if(!hash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'))throw new Error('PASSWORD_HASH_UNSUPPORTED');
  return argon2Verify({password,hash});
});
export const temporaryPassword=()=>randomBytes(24).toString('base64url');
