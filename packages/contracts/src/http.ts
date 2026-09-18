import {randomUUID} from 'node:crypto';
import type {RequestHandler,ErrorRequestHandler,Express} from 'express';
import {z} from 'zod';
import {ApiError} from './v1.js';

// Generate our own correlation ID: caller-controlled headers/body never enter logs.
export const requestContext:RequestHandler=(_req,res,next)=>{
  res.locals.requestId=randomUUID();
  res.set({'X-Request-ID':res.locals.requestId,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  next();
};
function message(status:number){
  if(status===401)return '로그인이 필요합니다.';
  if(status===403)return '접근 권한이 없습니다.';
  if(status===404)return '요청한 항목을 찾을 수 없습니다.';
  if(status===409)return '현재 상태와 요청이 충돌합니다. 상태를 다시 확인하세요.';
  if(status===413)return '요청 데이터가 너무 큽니다.';
  if(status<500)return '요청 내용을 확인하세요.';
  return '요청을 처리하지 못했습니다. 잠시 후 상태를 확인하세요.';
}
export const jsonError:ErrorRequestHandler=(error,_req,res,next)=>{
  if(res.headersSent)return next(error);
  let status=500,code='INTERNAL_ERROR';
  if(error instanceof ApiError && error.status>=400 && error.status<=599){status=error.status;code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:'REQUEST_FAILED';}
  else if(error instanceof z.ZodError){status=400;code='INVALID_INPUT';}
  else if(error?.type==='entity.parse.failed' && error?.status===400 && error instanceof SyntaxError){status=400;code='INVALID_INPUT';}
  else if(error?.type==='entity.too.large' && error?.status===413){status=413;code='PAYLOAD_TOO_LARGE';}
  else if(error?.type==='charset.unsupported' && error?.status===415){status=415;code='UNSUPPORTED_CHARSET';}
  else if(error?.code==='23505'){status=409;code='CONFLICT';}
  res.status(status).json({code,message:message(status),requestId:res.locals.requestId});
};
// Call only after all feature routes have been registered.
export function finishRoutes(app:Express){
  app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND')));
  app.use(jsonError);return app;
}
