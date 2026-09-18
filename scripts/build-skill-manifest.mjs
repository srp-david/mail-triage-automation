import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const skill=await readFile('packages/skills/mail-triage/SKILL.md');
await writeFile('packages/skills/manifest.json',JSON.stringify({id:'mail-triage-readonly',version:'1.0.0',contracts:['1'],agents:['codex','claude'],requiredTools:['mail.get_email','erp.readonly_query'],references:['ERP_SOURCE_ROOT','BUSINESS_DOCUMENT_ROOT'],files:{'mail-triage/SKILL.md':createHash('sha256').update(skill).digest('hex')},releaseApproved:false},null,2)+'\n');
