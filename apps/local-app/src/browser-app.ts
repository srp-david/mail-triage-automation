import express from 'express';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {ApiError} from '../../../packages/contracts/src/v1.js';
import {requestContext,finishRoutes} from '../../../packages/contracts/src/http.js';
import type {LocalSession} from './session.js';
const random=()=>randomBytes(32).toString('base64url');
const same=(a:string,b:string)=>{const first=Buffer.from(a),second=Buffer.from(b);return first.length===second.length&&timingSafeEqual(first,second);};
const cookie=(req:express.Request,name:string)=>(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)??'';
export function createBrowserApp(session:LocalSession,options:{port:number;features?:(app:express.Express)=>void;staticRoot?:string;beforeLogout?:()=>Promise<unknown>;controlToken?:string}){
  if(options.controlToken&&options.controlToken.length<32)throw new Error('STRONG_CONTROL_TOKEN_REQUIRED');
  const app=express(),origin=`http://127.0.0.1:${options.port}`;
  let browser=random(),csrf=random(),loginCookie='',sessionExpires=Date.now()+8*3600000;
  let ticket='',ticketExpires=0;
  const rotate=()=>{browser=random();csrf=random();sessionExpires=Date.now()+8*3600000;};
  const setCookie=(res:express.Response)=>res.cookie('triage-local',browser,{httpOnly:true,sameSite:'strict',path:'/',maxAge:8*3600000});
  app.disable('x-powered-by');app.use(requestContext);
  app.use((req,res,next)=>{
    res.set('Referrer-Policy','no-referrer');
    res.set('Content-Security-Policy',"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(req.get('host')!==`127.0.0.1:${options.port}`)throw new ApiError(403,'LOCAL_ORIGIN_DENIED');
    // OIDC browser navigation is the only cross-site exception and is bound by state+PKCE+cookie.
    if(req.path==='/auth/callback'&&req.method==='GET')return next();
    if(req.get('origin')&&req.get('origin')!==origin||req.get('sec-fetch-site')==='cross-site')throw new ApiError(403,'LOCAL_ORIGIN_DENIED');
    next();
  });
  app.use(express.json({limit:'2mb'}));
  const cli=(req:express.Request)=>!!options.controlToken&&!req.get('origin')&&!req.get('sec-fetch-site')&&(!req.get('sec-fetch-mode')||req.get('sec-fetch-mode')==='cors')&&req.get('x-local-client')==='1'&&same(req.get('authorization')??'','Bearer '+options.controlToken);
  // The DPAPI-authorized launcher can bootstrap before company login. Loopback alone is not an identity.
  app.post('/api/browser-ticket',(req,res)=>{
    if(!cli(req))throw new ApiError(401,'LOCAL_SESSION_REQUIRED');
    ticket=random();ticketExpires=Date.now()+60000;res.json({url:origin+'/auth/bootstrap?ticket='+ticket});
  });
  app.get('/auth/bootstrap',(req,res)=>{
    const presented=typeof req.query.ticket==='string'?req.query.ticket:'';
    if(!ticket||Date.now()>ticketExpires||!same(presented,ticket))throw new ApiError(401,'LOCAL_SESSION_REQUIRED');
    ticket='';ticketExpires=0;rotate();setCookie(res);res.redirect('/');
  });
  app.get('/api/session',async(req,res)=>{
    if(Date.now()>sessionExpires||!same(cookie(req,'triage-local'),browser))throw new ApiError(401,'LOCAL_SESSION_REQUIRED');
    try{res.json({mode:'native',authenticated:true,...await session.identity(),csrf});}
    catch(error){if(error instanceof ApiError&&error.status===401)res.json({mode:'native',authenticated:false,csrf});else throw error;}
  });
  app.post('/auth/login',(req,res)=>{
    if(req.get('origin')!==origin||!same(cookie(req,'triage-local'),browser)||!same(req.get('x-csrf-token')??'',csrf))throw new ApiError(403,'CSRF_REQUIRED');
    loginCookie=random();res.cookie('triage-login',loginCookie,{httpOnly:true,sameSite:'lax',path:'/auth',maxAge:300000});res.json({url:session.begin()});
  });
  app.get('/auth/callback',async(req,res)=>{
    const expected=loginCookie;loginCookie='';res.clearCookie('triage-login',{path:'/auth'});
    if(!expected||!same(cookie(req,'triage-login'),expected))throw new ApiError(401,'INVALID_OIDC_CALLBACK');
    try{await session.accept(new URL(req.originalUrl,origin));rotate();setCookie(res);res.redirect('/');}
    catch{res.redirect('/?login=failed');}
  });
  app.use('/api',async(req,_res,next)=>{
    const trustedCli=cli(req);
    if(!trustedCli&&(Date.now()>sessionExpires||!same(cookie(req,'triage-local'),browser)))throw new ApiError(401,'LOCAL_SESSION_REQUIRED');
    if(!trustedCli&&!['GET','HEAD'].includes(req.method)&&(req.get('origin')!==origin||!same(req.get('x-csrf-token')??'',csrf)))throw new ApiError(403,'CSRF_REQUIRED');
    // Logout also clears a session whose refresh failed.
    if(req.path!=='/logout')await session.token();next();
  });
  app.post('/api/logout',async(_req,res)=>{rotate();setCookie(res);await options.beforeLogout?.();res.json(await session.logout());});
  options.features?.(app);
  if(options.staticRoot){
    app.get('/',async(_req,res)=>res.type('html').send((await readFile(join(options.staticRoot!,'react','index.html'),'utf8')).replace('<head>','<head><meta name="triage-auth" content="native">')));
    app.use('/preview',(_req,res,next)=>{res.set('Content-Security-Policy',"default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self'; img-src data: blob:; font-src data: blob:; style-src 'self' 'unsafe-inline'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");next();});
    app.use(express.static(options.staticRoot,{index:false}));
  }
  return finishRoutes(app);
}
