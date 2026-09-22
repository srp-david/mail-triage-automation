import {test} from 'vitest';
import assert from 'node:assert/strict';
import pg from 'pg';
import {databaseConnection} from '../apps/history-api/src/db-connection.js';
const ca='-----BEGIN CERTIFICATE-----\nfixture\n-----END CERTIFICATE-----';
const encoded=Buffer.from(ca).toString('base64');
test('pg parsing preserves the custom CA and server verification with verify-full',()=>{
  const client=new pg.Client(databaseConnection('postgresql://example.invalid/db?sslmode=verify-full&application_name=triage',encoded));
  const ssl=client.ssl;
  assert.equal(typeof ssl,'object');
  assert.equal((ssl as {ca:string}).ca,ca);
  assert.equal((ssl as {rejectUnauthorized:boolean}).rejectUnauthorized,true);
  assert.equal((ssl as {checkServerIdentity?:unknown}).checkServerIdentity,undefined);
});
test('custom CA configuration rejects weaker or overriding connection parameters',()=>{
  for(const suffix of ['sslmode=disable','sslmode=no-verify','sslmode=require','sslmode=verify-ca','ssl=false','sslrootcert=other.pem','sslkey=other.pem','sslcert=other.pem','uselibpqcompat=true']){
    assert.throws(()=>databaseConnection('postgresql://example.invalid/db?'+suffix,encoded));
  }
});
test('custom CA rejects malformed values and preserves unconfigured local connections',()=>{
  assert.throws(()=>databaseConnection('postgresql://example.invalid/db','invalid'),/INVALID_DATABASE_CA/);
  assert.deepEqual(databaseConnection('postgresql://localhost/test'),{connectionString:'postgresql://localhost/test'});
});
