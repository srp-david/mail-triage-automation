export function historyBase(value:string){
  const url=new URL(value);
  if(url.username||url.password||url.search||url.hash||!(/^\/$|^\/functions\/v1\/[a-z][a-z0-9-]*\/?$/.test(url.pathname))||
    (url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw new Error('HTTPS API URL required');
  return url.origin+url.pathname.replace(/\/$/,'');
}
