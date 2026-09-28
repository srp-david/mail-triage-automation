import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
import {access} from 'node:fs/promises';
const cli=resolve('website/node_modules/@docusaurus/core/bin/docusaurus.mjs');
try{await access(cli);}catch{throw new Error('Run npm.cmd run docs:install before building bundled documentation');}
try{
  await promisify(execFile)(process.execPath,[cli,'build','--out-dir',resolve('public/docs')],{cwd:resolve('website'),env:{...process.env,TRIAGE_DOCS_BASE_URL:'/docs/'},windowsHide:true,maxBuffer:4000000});
  await access(resolve('public/docs/index.html'));
  console.log('Bundled documentation built at public/docs');
}catch(error){process.stderr.write(error.stdout??'');process.stderr.write(error.stderr??'');process.exitCode=1;}
