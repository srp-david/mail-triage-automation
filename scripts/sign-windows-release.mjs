import {createHash,createPrivateKey,sign} from 'node:crypto';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {updateSigningBytes,verifyUpdate} from '../packages/contracts/src/updates.ts';

const [version,sourceCommit]=process.argv.slice(2);
if(!/^\d+\.\d+\.\d+-candidate\.\d+$/.test(version??'')||!(/^[a-f0-9]{40}$/.test(sourceCommit??'')))
  throw new Error('Usage: version sourceCommit');
const privatePath=process.env.TRIAGE_UPDATE_SIGNING_KEY_FILE;
if(!privatePath)throw new Error('TRIAGE_UPDATE_SIGNING_KEY_FILE required');
const setup=resolve('.runtime/packages',version+'-setup.exe'),body=await readFile(setup),size=(await stat(setup)).size;
const now=new Date(),expires=new Date(now.getTime()+14*86_400_000);
const metadata={metadataVersion:1,releaseId:'v'+version,version,channel:'test',platform:'win32-x64',sourceCommit,
  apiContract:'1',assetUrl:`https://github.com/srp-david/mail-triage-automation/releases/download/v${version}/${version}-setup.exe`,
  releaseNotesUrl:`https://github.com/srp-david/mail-triage-automation/releases/tag/v${version}`,
  assetSha256:createHash('sha256').update(body).digest('hex'),assetSize:size,issuedAt:now.toISOString(),expiresAt:expires.toISOString(),keyId:'693eeaf925980687'};
const privateKey=createPrivateKey(await readFile(privatePath));
const signed={...metadata,signature:sign(null,updateSigningBytes(metadata),privateKey).toString('base64url')};
verifyUpdate(signed);
const output=resolve('.runtime/packages',version+'.update.json');
await writeFile(output,JSON.stringify(signed,null,2)+'\n',{flag:'wx'});
await writeFile(setup+'.sha256',metadata.assetSha256+'\n',{flag:'wx'});
console.log(JSON.stringify({version,metadata:output,setupSha256:metadata.assetSha256,keyId:signed.keyId,expiresAt:signed.expiresAt}));
