import {ApiError} from '../../../packages/contracts/src/v1.js';
import {compareVersions,verifyUpdate,type SignedUpdate} from '../../../packages/contracts/src/updates.js';
import {z} from 'zod';

const request=z.object({version:z.string().max(60),platform:z.literal('win32-x64'),channel:z.enum(['stable','test'])}).strict();
export function checkUpdate(input:unknown,actor:{userId:string;role:string},catalogJson?:string){
  const wanted=request.parse(input);
  if(!catalogJson)return {status:'unavailable' as const};
  let catalog:SignedUpdate;
  try{catalog=verifyUpdate(JSON.parse(catalogJson));}catch{throw new ApiError(503,'UPDATE_CATALOG_INVALID');}
  const testUsers=(process.env.UPDATE_TEST_USER_IDS??'').split(',').map(x=>x.trim()).filter(Boolean);
  const allowedTest=actor.role==='admin'||testUsers.includes(actor.userId);
  if(wanted.channel==='test'&&!allowedTest)return {status:'channel_denied' as const};
  if(catalog.channel==='test'&&wanted.channel!=='test')return {status:'unavailable' as const};
  let comparison:number;try{comparison=compareVersions(catalog.version,wanted.version);}catch{throw new ApiError(400,'INVALID_APP_VERSION');}
  return comparison>0?{status:'offered' as const,update:catalog}:{status:'current' as const};
}
