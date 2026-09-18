import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPair,SignJWT,exportJWK,createLocalJWKSet} from 'jose';
import {tokenVerifier} from '../apps/history-api/src/auth.js';
import {NativeLogin} from '../apps/local-app/src/pkce.js';
const {privateKey,publicKey}=await generateKeyPair('RS256');
const jwk=await exportJWK(publicKey);jwk.kid='fixture';
const key=createLocalJWKSet({keys:[jwk]});
const settings={issuer:'https://tenant.example.test/',audience:'https://history.example.test',namespace:'https://claims.example.test',domains:['company.test']};
const sign=(claims:any,aud=settings.audience,exp='1h')=>new SignJWT(claims).setProtectedHeader({alg:'RS256',kid:'fixture'}).setIssuer(settings.issuer).setSubject('fixture-user').setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
test('JWT requires signed audience, expiry, verified exact domain and trusted claims',async()=>{
  const verify=tokenVerifier(settings,key),claims={[settings.namespace+'/email']:'user@company.test',[settings.namespace+'/email_verified']:true};
  assert.equal((await verify(await sign(claims))).email,'user@company.test');
  for(const bad of [{...claims,[settings.namespace+'/email_verified']:false},{...claims,[settings.namespace+'/email']:'user@company.test.evil'}, {email:'user@company.test',email_verified:true}])await assert.rejects(verify(await sign(bad)),/IDENTITY_DENIED/);
  await assert.rejects(verify(await sign(claims,'native-client')),/IDENTITY_DENIED/);
  await assert.rejects(verify(await sign(claims,settings.audience,'-1s')),/IDENTITY_DENIED/);
  const token=await sign(claims);await assert.rejects(verify(token.slice(0,-12)+'invalidtoken'),/IDENTITY_DENIED/);
});
test('Native PKCE binds state, nonce, exact callback and consumes transaction once',async()=>{
  let nonce='',exchange:any;
  const transport=(async(_url:any,init:any)=>{exchange=JSON.parse(init.body);return Response.json({id_token:await sign({nonce},'native-client'),access_token:'fixture-access',token_type:'Bearer'});}) as typeof fetch;
  const login=new NativeLogin(settings.issuer,'native-client',settings.audience,undefined,transport,key);
  let authorize=new URL(login.begin());nonce=authorize.searchParams.get('nonce')!;
  assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');
  const callback=new URL(login.redirectUri+'?code=fixture&state='+authorize.searchParams.get('state'));
  assert.equal((await login.callback(callback)).access_token,'fixture-access');assert.ok(exchange.code_verifier);assert.equal(exchange.client_secret,undefined);
  await assert.rejects(login.callback(callback),/INVALID_OIDC_CALLBACK/);
  login.begin();await assert.rejects(login.callback(callback),/INVALID_OIDC_CALLBACK/);
  authorize=new URL(login.begin());nonce='wrong';await assert.rejects(login.callback(new URL(login.redirectUri+'?code=fixture&state='+authorize.searchParams.get('state'))),/INVALID_OIDC_TOKEN/);
});
test('configured callback remains exact and loopback-only on an alternate port',()=>{
  const login=new NativeLogin(settings.issuer,'native',settings.audience,'http://127.0.0.1:43180/auth/callback');assert.equal(new URL(login.begin()).searchParams.get('redirect_uri'),login.redirectUri);
  for(const uri of ['http://localhost:43180/auth/callback','http://127.0.0.1:80/auth/callback','https://evil.test:43180/auth/callback','http://127.0.0.1:43180/auth/callback?x=1'])assert.throws(()=>new NativeLogin(settings.issuer,'native',settings.audience,uri),/INVALID_OIDC/);
});
