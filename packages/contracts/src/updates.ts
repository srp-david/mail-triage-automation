import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {z} from 'zod';

export const updatePublicKeys={
  '693eeaf925980687':'-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEArYOg2fS4R5LFANvvEnMeMT43l5/38WFoPlQb+ID0ycg=\n-----END PUBLIC KEY-----\n',
} as const;
const version=z.string().regex(/^\d+\.\d+\.\d+(?:-candidate\.\d+)?$/);
const https=z.string().url().refine(value=>{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash;});
export const signedUpdate=z.object({
  metadataVersion:z.literal(1),releaseId:z.string().regex(/^v\d+\.\d+\.\d+(?:-candidate\.\d+)?$/),version,
  channel:z.enum(['stable','test']),platform:z.literal('win32-x64'),sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),
  apiContract:z.literal('1'),assetUrl:https,releaseNotesUrl:https,assetSha256:z.string().regex(/^[a-f0-9]{64}$/),assetSize:z.number().int().positive().max(200_000_000),
  issuedAt:z.string().datetime({offset:true}),expiresAt:z.string().datetime({offset:true}),
  keyId:z.string().regex(/^[a-f0-9]{16}$/),signature:z.string().regex(/^[A-Za-z0-9_-]{86}$/),
}).strict();
export type SignedUpdate=z.infer<typeof signedUpdate>;
export function updateSigningBytes(value:Omit<SignedUpdate,'signature'>){
  return Buffer.from(JSON.stringify([value.metadataVersion,value.releaseId,value.version,value.channel,value.platform,
    value.sourceCommit,value.apiContract,value.assetUrl,value.releaseNotesUrl,value.assetSha256,value.assetSize,value.issuedAt,value.expiresAt,value.keyId]));
}
export function verifyUpdate(input:unknown,now=Date.now()){
  const value=signedUpdate.parse(input),key=updatePublicKeys[value.keyId as keyof typeof updatePublicKeys];
  if(!key||Date.parse(value.issuedAt)>now+300_000||Date.parse(value.expiresAt)<=now||Date.parse(value.expiresAt)-Date.parse(value.issuedAt)>30*86_400_000)
    throw new Error('UPDATE_METADATA_EXPIRED_OR_UNTRUSTED');
  const {signature,...unsigned}=value;
  if(!verifySignature(null,updateSigningBytes(unsigned),createPublicKey(key),Buffer.from(signature,'base64url')))
    throw new Error('UPDATE_SIGNATURE_INVALID');
  const url=new URL(value.assetUrl);
  if(url.hostname!=='github.com'||!url.pathname.startsWith('/srp-david/mail-triage-automation/releases/download/'+value.releaseId+'/'))
    throw new Error('UPDATE_ASSET_ORIGIN_INVALID');
  const notes=new URL(value.releaseNotesUrl);
  if(notes.hostname!=='github.com'||notes.pathname!=='/srp-david/mail-triage-automation/releases/tag/'+value.releaseId)
    throw new Error('UPDATE_NOTES_ORIGIN_INVALID');
  return value;
}
export function compareVersions(left:string,right:string){
  const parts=(input:string)=>{version.parse(input);const x=/^(\d+)\.(\d+)\.(\d+)(?:-candidate\.(\d+))?$/.exec(input)!;return [Number(x[1]),Number(x[2]),Number(x[3]),x[4]===undefined?1:0,Number(x[4]??0)]};
  const a=parts(left),b=parts(right);for(let i=0;i<a.length;i++)if(a[i]!==b[i])return a[i]>b[i]?1:-1;return 0;
}
