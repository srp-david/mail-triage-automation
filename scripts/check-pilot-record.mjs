import {readFile} from 'node:fs/promises';
const path=process.argv[2];if(!path)throw new Error('Pilot record path required');
const record=JSON.parse(await readFile(path,'utf8'));
const required=['verifiedEmail','sharedSourceRead','privateSourceDenied','originalUnavailable','developerPcOff','runnerPcOff','duplicateAndResponseLoss','settingsAndRollback','backupRestore','agentReadOnly'];
const missing=[];
if(!record.releaseVersion||!record.apiDeployment||!record.operator)missing.push('release/api/operator');
const participants=record.participants??[];
if(participants.length<2||new Set(participants.map(p=>p.pcAlias).filter(Boolean)).size<2)missing.push('two distinct PCs');
for(const agent of ['codex','claude'])if(!participants.some(p=>p.agent===agent&&p.installedVersion))missing.push(agent+' install');
for(const key of required)if(record.checks?.[key]?.result!=='passed'||!record.checks[key].evidence)missing.push(key);
if(!record.observations?.some(x=>x.kind==='real_work'&&x.at&&x.evidence))missing.push('real work observation');
if((record.openDefects??[]).some(x=>x.blocking))missing.push('blocking defects');
console.log(JSON.stringify({readyForHumanReview:missing.length===0,missing}));
// A record validator does not approve rollout or prove its evidence happened.
if(missing.length)process.exitCode=2;
