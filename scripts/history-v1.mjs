import {HistoryClient} from '../dist/packages/history-client/src/index.js';
import {ProtectedStore} from '../dist/apps/local-app/src/protected-store.js';
import {readFile} from 'node:fs/promises';
// Credentials are backend-owned DPAPI records, never command-line token arguments.
const [command,id,file]=process.argv.slice(2);
if(!process.env.TRIAGE_V1_URL||!process.env.TRIAGE_SECRET_DIR)throw new Error('TRIAGE_V1_URL and TRIAGE_SECRET_DIR required');
const store=new ProtectedStore(process.env.TRIAGE_SECRET_DIR);
const client=new HistoryClient(process.env.TRIAGE_V1_URL,async()=>(await store.read('session')).accessToken);
let result;
if(command==='get')result=await client.get(id);
else if(command==='sources')result=await client.request('/sources');
else if(command==='begin')result=await client.start(JSON.parse(await readFile(file,'utf8')));
else if(command==='cancel')result=await client.request('/runs/'+id+'/cancel',{});
else throw new Error('Usage: history-v1 get RUN | sources | begin - INPUT_JSON | cancel RUN');
process.stdout.write(JSON.stringify(result)+'\n');
