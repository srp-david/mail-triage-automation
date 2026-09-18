import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {ApiError} from '../../../packages/contracts/src/v1.js';
export type VerifiedIdentity={issuer:string;subject:string;email:string};
export type AuthSettings={issuer:string;audience:string;namespace:string;domains:string[]};
export function tokenVerifier(settings:AuthSettings,key?:JWTVerifyGetKey){
  const issuer=new URL(settings.issuer);
  if(issuer.protocol!=='https:'||issuer.username||issuer.password||!settings.audience||!settings.namespace||!settings.domains.length)throw new Error('INVALID_AUTH_SETTINGS');
  const jwks=key??createRemoteJWKSet(new URL('.well-known/jwks.json',issuer),{timeoutDuration:5000,cooldownDuration:30000});
  return async(token:string):Promise<VerifiedIdentity>=>{
    try{
      const {payload}=await jwtVerify(token,jwks,{issuer:settings.issuer,audience:settings.audience,algorithms:['RS256'],requiredClaims:['sub','exp','iat']});
      const email=payload[settings.namespace+'/email'];
      if(typeof email!=='string'||!/^\S+@[^@\s]+$/.test(email)||payload[settings.namespace+'/email_verified']!==true||
        !settings.domains.map(x=>x.toLowerCase()).includes(email.split('@')[1].toLowerCase()))throw new Error('IDENTITY_DENIED');
      return {issuer:settings.issuer,subject:payload.sub!,email};
    }catch{throw new ApiError(401,'IDENTITY_DENIED');}
  };
}
