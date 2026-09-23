import type {PoolConfig} from 'pg';

// pg connection-string SSL parameters override an explicit ssl object. Remove only
// verify-full when supplying our CA, so both CA and hostname checks stay enabled.
export function databaseConnection(connectionString:string,caBase64?:string):PoolConfig {
  if(!caBase64)return {connectionString};
  const url=new URL(connectionString);
  if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('INVALID_DB_PROTOCOL');
  const mode=url.searchParams.get('sslmode');
  if(mode&&mode!=='verify-full')throw new Error('DATABASE_CA_REQUIRES_VERIFY_FULL');
  for(const key of ['ssl','sslrootcert','sslcert','sslkey','uselibpqcompat']){
    if(url.searchParams.has(key))throw new Error('CONFLICTING_DATABASE_TLS_SETTINGS');
  }
  const ca=Buffer.from(caBase64,'base64').toString('utf8');
  if(!ca.includes('-----BEGIN CERTIFICATE-----')||!ca.includes('-----END CERTIFICATE-----'))throw new Error('INVALID_DATABASE_CA');
  url.searchParams.delete('sslmode');
  return {connectionString:url.href,ssl:{ca,rejectUnauthorized:true}};
}
