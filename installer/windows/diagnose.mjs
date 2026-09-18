import {createServer} from 'node:net';
import {readFile,access} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyRelease} from './release.mjs';
export async function diagnoseRelease(path){
  const manifest=await verifyRelease(path);await access(join(path,'node.exe'));await access(join(path,'dist/apps/local-app/src/main.js'));
  return {version:manifest.version,contractVersion:manifest.contractVersion,releaseApproved:manifest.releaseApproved,nodeVersion:manifest.nodeVersion};
}
export async function portAvailable(port=3080){return new Promise(resolve=>{const server=createServer();server.once('error',()=>resolve(false));server.listen(port,'127.0.0.1',()=>server.close(()=>resolve(true)));});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify({...await diagnoseRelease(process.argv[2]),portAvailable:await portAvailable()}));
