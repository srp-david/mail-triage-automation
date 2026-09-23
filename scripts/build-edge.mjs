import {build} from 'esbuild';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
const names=['express','pg','jose','zod','hash-wasm'];
const versions=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile('node_modules/'+name+'/package.json','utf8')])));
const {dependencies}=JSON.parse(await readFile('package.json','utf8'));
await mkdir('supabase/functions/history',{recursive:true});
await build({entryPoints:['apps/history-api/src/edge.ts'],outfile:'supabase/functions/history/index.js',bundle:true,inject:['scripts/edge-globals.mjs'],format:'esm',platform:'node',target:'es2022',packages:'external',sourcemap:false,plugins:[{name:'deno-npm',setup(b){b.onResolve({filter:/^(express|pg|jose|zod|hash-wasm)$/},args=>{const version=JSON.parse(requireVersion(args.path));return {path:'npm:'+args.path+'@'+version.version,external:true};});}}]});
function requireVersion(name){return versions[name];}
console.log('Edge bundle created (server-only; no secrets embedded).');
await copyFile('supabase/functions/history/index.js','supabase/functions/history/index.ts');
