import assert from 'node:assert/strict';
process.env.NODE_ENV='test';process.env.TRIAGE_TOKEN='synthetic-build-compat-'.repeat(3);
const modules={};
for(const name of ['schema','db','history','archive','sync','server'])modules[name]=await import('../dist/'+name+'.js');
assert.equal(typeof modules.schema.resultSchema.parse,'function');
assert.equal(typeof modules.db.pool.query,'function');
for(const [name,key] of [['history','recoverResult'],['archive','getLegacy'],['sync','startSync'],['server','createApp']])assert.equal(typeof modules[name][key],'function');
const server=modules.server.createApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
try{const r=await fetch('http://127.0.0.1:'+server.address().port+'/');assert.equal(r.status,200);assert.ok((await r.text()).includes('/react/assets/'));console.log('compatibility exports and synthetic HTTP root: passed (no DB/MCP access)');}
finally{await new Promise(r=>server.close(r));await modules.db.pool.end();}
