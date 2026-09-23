import {randomUUID} from 'node:crypto';
import type {RequestHandler,Response} from 'express';
import {z} from 'zod';
import {ApiError,uuid} from './v1.js';

// Only application-defined codes enter logs. Upstream text, even uppercase
// text in a code field, is not trusted diagnostic metadata.
const codes=new Set(`INTERNAL_ERROR REQUEST_FAILED INVALID_INPUT PAYLOAD_TOO_LARGE UNSUPPORTED_CHARSET CONFLICT
ADAPTER_NOT_RELEASE_APPROVED ADMIN_REQUIRED AGENT_NOT_CONFIGURED AMBIGUOUS_MEMBERSHIP ANSWER_REQUIRED
BATCH_CONFLICT BATCH_NOT_STARTED BATCH_OUTCOME_UNCERTAIN BROWSER_ACCESS_DENIED CANCEL_REQUESTED CLAIM_CONFLICT
COLLECTION_NOT_FOUND CONTRACT_VERSION CSRF_REQUIRED DEVICE_SAVE_FAILED DOCUMENT_ALREADY_LINKED DOCUMENT_MAPPING_REQUIRED
DOCUMENT_NOT_FOUND DOCUMENT_VERSION_MISMATCH HASH_MISMATCH IDENTITY_DENIED INVALID_OIDC_CALLBACK KNOWLEDGE_NOT_FOUND
KNOWLEDGE_VERSION_MISMATCH LEASE_CONFLICT LEASE_EXPIRED LINK_NOT_FOUND LOCAL_MCP_NOT_CONFIGURED LOCAL_MCP_UNAVAILABLE
LOCAL_ORIGIN_DENIED LOCAL_SESSION_REQUIRED LOCAL_SETTINGS_UNAVAILABLE LOGIN_CANCELLED LOGIN_REQUIRED MAIL_HANDLED
MAIL_IDENTITY_CHANGED MAIL_NOT_HANDLED MAIL_REVALIDATION_REQUIRED MAIL_TOO_LARGE MCP_PAGE_INVALID MEMBERSHIP_DISABLED
NO_RECOVERABLE_RESULT NO_REPORT NOT_FOUND ORIGINAL_RUN_NOT_RECOVERABLE ORIGINAL_UNAVAILABLE OWNER_REQUIRED PARENT_MISMATCH
RECONNECT_EVIDENCE_REQUIRED RECONNECT_EXPIRED RECONNECT_IDENTITY_MISMATCH REGISTRATION_ALREADY_EXISTS REQUEST_CONFLICT
RESULT_CONFLICT RETRY_NOT_DUE REVIEW_CONFLICT RUN_ACTIVE RUN_NOT_FOUND RUNNER_DENIED RUNNER_REQUIRED RUNNER_SOURCE_DENIED
SAME_MAIL SESSION_STORE_UNAVAILABLE SOURCE_CHANGED SOURCE_CONFIGURATION_CHANGED SOURCE_NOT_FOUND STALE_MAIL_PROOF
SYNC_BUSY SYNC_CLAIM_CONFLICT SYNC_EXPIRED SYNC_LEASE_CONFLICT SYNC_NOT_FOUND SYNC_OUTCOME_UNCERTAIN SYNC_STOPPED
TEAM_MISMATCH UNAUTHENTICATED WRITE_DENIED`.split(/\s+/));
const dbCodes=new Set(['08003','08006','23502','23503','23505','40001','40P01','53300','57014','57P01']);
type Failure={status:number;code:string;errorType:string;databaseCode?:string;upstreamRequestId?:string};
export type HttpErrorLog=Failure&{event:'http_error';level:'warn'|'error';time:string;requestId:string;method:string;route:string;durationMs:number;responseCompleted:boolean};
export type HttpLogSink=(entry:HttpErrorLog)=>void;
const failures=new WeakMap<Response,Failure>();

export function recordHttpError(res:Response,error:unknown,status:number,code:string){
  const databaseCode=typeof (error as any)?.code==='string'&&dbCodes.has((error as any).code)?(error as any).code:undefined;
  const errorType=error instanceof ApiError?'ApiError':error instanceof z.ZodError?'ValidationError':databaseCode?'DatabaseError':
    error instanceof SyntaxError?'SyntaxError':error instanceof TypeError?'TypeError':error instanceof RangeError?'RangeError':
    error instanceof DOMException?'DOMException':error instanceof Error?'Error':'UnknownError';
  const upstream=error instanceof ApiError?uuid.safeParse(error.upstreamRequestId):undefined;
  failures.set(res,{status,code:codes.has(code)?code:'REQUEST_FAILED',errorType,
    ...(databaseCode?{databaseCode}:{}),...(upstream?.success?{upstreamRequestId:upstream.data}:{})});
}

export function createRequestContext(log:HttpLogSink=entry=>console.error(JSON.stringify(entry))):RequestHandler{
  return (req,res,next)=>{
    const requestId=randomUUID(),started=performance.now();let written=false;
    res.locals.requestId=requestId;
    res.set({'X-Request-ID':requestId,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    const write=()=>{
      const failure=failures.get(res);
      if(written||!failure&&res.statusCode<400)return;
      written=true;
      // req.route.path is the registered template, never the user-supplied URL.
      const path=req.route?.path,route=typeof path==='string'&&/^\/[A-Za-z0-9_/:.*{}-]{0,179}$/.test(path)?path:'<unmatched>';
      const status=failure?.status??res.statusCode;
      const entry:HttpErrorLog={event:'http_error',level:status>=500?'error':'warn',time:new Date().toISOString(),requestId,
        method:['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'].includes(req.method)?req.method:'OTHER',route,
        durationMs:Math.max(0,Math.round((performance.now()-started)*100)/100),responseCompleted:res.writableFinished,
        ...(failure??{status,code:'HTTP_ERROR',errorType:'HttpStatus'})};
      // Diagnostics must never change the HTTP response or crash the process.
      try{log(entry);}catch{ /* the configured sink is unavailable */ }
    };
    res.once('finish',write);res.once('close',write);next();
  };
}
export const requestContext=createRequestContext();
