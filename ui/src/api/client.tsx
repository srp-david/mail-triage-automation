import {createContext,useContext} from 'react';
import type {Api} from './types';
import {isCancelledError} from '@tanstack/react-query';
export const errorText=(error:unknown)=>error instanceof Error?error.message:String(error);
export const aborted=(error:unknown)=>isCancelledError(error)||error instanceof Error&&error.name==='AbortError';
export function createApi(unauthorized:()=>void):Api {
 return async<T,>(path:string,body?:unknown,signal?:AbortSignal)=>{
  const response=await fetch('/api'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',signal,
   headers:body===undefined?undefined:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  if(response.status===401){unauthorized();throw Error('접속 토큰을 입력하세요.');}
  const value=await response.json();if(!response.ok)throw Error(value.error??'요청 실패');return value as T;
 };
}
export const SessionContext=createContext<{api:Api;storeId:string;notice:(text:string)=>void;unauthorized:()=>void}>({} as never);
export const useSession=()=>useContext(SessionContext);
