import {randomBytes,createHash} from 'node:crypto';
import {jwtVerify,createRemoteJWKSet,type JWTVerifyGetKey} from 'jose';
export class NativeLogin {
  private pending?:{state:string;nonce:string;verifier:string;expires:number};
  constructor(readonly issuer:string,readonly clientId:string,readonly audience:string,
    readonly redirectUri='http://127.0.0.1:3080/auth/callback',private transport:typeof fetch=fetch,private key?:JWTVerifyGetKey){
    const parsed=new URL(issuer);
    const callback=new URL(redirectUri);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!issuer.endsWith('/')||redirectUri!==`http://127.0.0.1:${callback.port}/auth/callback`||Number(callback.port)<1024||Number(callback.port)>65535)throw new Error('INVALID_OIDC_CONFIGURATION');
  }
  begin(){
    const random=()=>randomBytes(32).toString('base64url');
    this.pending={state:random(),nonce:random(),verifier:random(),expires:Date.now()+300000};
    const url=new URL('authorize',this.issuer);
    url.search=new URLSearchParams({client_id:this.clientId,audience:this.audience,redirect_uri:this.redirectUri,response_type:'code',scope:'openid profile email offline_access',state:this.pending.state,nonce:this.pending.nonce,code_challenge_method:'S256',code_challenge:createHash('sha256').update(this.pending.verifier).digest('base64url')}).toString();
    return url.toString();
  }
  async callback(url:URL){
    const p=this.pending;this.pending=undefined;
    if(url.origin+url.pathname!==this.redirectUri||!p||Date.now()>p.expires||url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==p.state||url.searchParams.getAll('code').length!==1||url.searchParams.has('error'))throw new Error('INVALID_OIDC_CALLBACK');
    const r=await this.transport(new URL('oauth/token',this.issuer),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',client_id:this.clientId,redirect_uri:this.redirectUri,code:url.searchParams.get('code'),code_verifier:p.verifier})});
    if(!r.ok)throw new Error('TOKEN_EXCHANGE_FAILED');const tokens=await r.json();
    const {payload}=await jwtVerify(tokens.id_token,this.key??createRemoteJWKSet(new URL('.well-known/jwks.json',this.issuer)),{issuer:this.issuer,audience:this.clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat','nonce']});
    if(payload.nonce!==p.nonce||typeof tokens.access_token!=='string'||tokens.token_type!=='Bearer')throw new Error('INVALID_OIDC_TOKEN');
    return {...tokens,subject:payload.sub}; // Backend only. Never serialize to browser.
  }
  cancel(){this.pending=undefined;}
  async refresh(refreshToken:string,subject:string){
    const r=await this.transport(new URL('oauth/token',this.issuer),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({grant_type:'refresh_token',client_id:this.clientId,refresh_token:refreshToken})});
    if(!r.ok)throw new Error('TOKEN_REFRESH_FAILED');const tokens=await r.json();
    if(tokens.id_token){const {payload}=await jwtVerify(tokens.id_token,this.key??createRemoteJWKSet(new URL('.well-known/jwks.json',this.issuer)),{issuer:this.issuer,audience:this.clientId,algorithms:['RS256'],requiredClaims:['sub','exp','iat']});if(payload.sub!==subject)throw new Error('IDENTITY_CHANGED');}
    return {...tokens,subject};
  }
  async revoke(refreshToken:string){
    const r=await this.transport(new URL('oauth/revoke',this.issuer),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'content-type':'application/json'},body:JSON.stringify({client_id:this.clientId,token:refreshToken,token_type_hint:'refresh_token'})});
    return r.ok;
  }
}
