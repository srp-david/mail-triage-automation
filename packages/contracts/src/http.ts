import type {ErrorRequestHandler,Express} from 'express';
import {z} from 'zod';
import {ApiError} from './v1.js';
import {recordHttpError} from './http-log.js';
export {requestContext,createRequestContext} from './http-log.js';

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
  let status=500,code='INTERNAL_ERROR';
  if(error instanceof ApiError && error.status>=400 && error.status<=599){status=error.status;code=/^[A-Z][A-Z0-9_]{0,79}$/.test(error.code)?error.code:'REQUEST_FAILED';}
  else if(error instanceof z.ZodError){status=400;code='INVALID_INPUT';}
  else if(error?.type==='entity.parse.failed' && error?.status===400 && error instanceof SyntaxError){status=400;code='INVALID_INPUT';}
  else if(error?.type==='entity.too.large' && error?.status===413){status=413;code='PAYLOAD_TOO_LARGE';}
  else if(error?.type==='charset.unsupported' && error?.status===415){status=415;code='UNSUPPORTED_CHARSET';}
  else if(error?.code==='23505'){status=409;code='CONFLICT';}
  recordHttpError(res,error,status,code);
  // Do not forward raw errors to Express's default stderr stack logger after
  // streaming has started. Close the partial response and keep the safe log.
  if(res.headersSent){res.destroy();return;}
  const specific:Record<string,string>={ORIGINAL_UNAVAILABLE:'이 PC에 원본 메일 연결이 없습니다. 공용 이력은 계속 조회할 수 있습니다.',RUNNER_REQUIRED:'설정에서 실행 장치를 선택하세요.',LOCAL_MCP_NOT_CONFIGURED:'로컬 설정에 메일 MCP 주소가 필요합니다.',SOURCE_CHANGED:'출처가 변경되었습니다. 메일을 다시 조회하세요.',LOCAL_MCP_UNAVAILABLE:'이 PC의 메일 MCP에 연결하지 못했습니다.',LOGIN_REQUIRED:'다시 로그인하세요.',SOURCE_CONFIGURATION_CHANGED:'메일 MCP 주소가 변경되었습니다. 출처 연결을 다시 확인하세요.'};
  specific.LOCAL_SESSION_REQUIRED='분석실 바로가기 또는 로컬 open 명령으로 브라우저를 다시 여세요.';
  res.status(status).json({code,message:specific[code]??message(status),requestId:res.locals.requestId});
};
// Call only after all feature routes have been registered.
export function finishRoutes(app:Express){
  app.use((_req,_res,next)=>next(new ApiError(404,'NOT_FOUND')));
  app.use(jsonError);return app;
}
