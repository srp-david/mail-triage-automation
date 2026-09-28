import {readFile,lstat,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname,delimiter,isAbsolute} from 'node:path';
import {createRequire} from 'node:module';
import {endpointSchema,type Connections} from './connections.js';
import {checkMcp} from './mcp-connections.js';

type Candidate={url:string;source:string};
export function configEndpoints(body:string,format:'json'|'toml',source:string):Candidate[]{
  const found:Candidate[]=[];
  const add=(server:any)=>{
    // Never import credentials, authenticated URLs or commands from another application's config.
    if(!server||server.disabled===true||server.enabled===false||server.headers||server.http_headers||server.env_http_headers||server.bearer_token_env_var||server.oauth||server.command)return;
    try{if(typeof server.url==='string')found.push({url:endpointSchema.parse(server.url),source});}catch{}
  };
  if(format==='json'){
    try{const value=JSON.parse(body);for(const server of Object.values(value.mcpServers??{}))add(server);
      for(const project of Object.values(value.projects??{}).slice(0,30) as any[])for(const server of Object.values(project?.mcpServers??{}))add(server);
    }catch{}
  }else{
    let current:any;
    for(const line of body.split(/\r?\n/)){
      if(/^\s*\[/.test(line)){
        const section=line.match(/^\s*\[mcp_servers\.([\w-]+|"[^"\r\n]+"|'[^'\r\n]+')\]\s*(?:#.*)?$/);
        if(section){if(current)add(current);current={};}
        else if(/^\s*\[mcp_servers\./.test(line)){if(current)current.headers=true;}
        else {if(current)add(current);current=undefined;}
      }else if(current){
        const pair=line.match(/^\s*([\w_]+)\s*=\s*(.*?)\s*$/);if(!pair)continue;const [,key,value]=pair;
        if(['url'].includes(key)){const match=value.match(/^("(?:[^"\\]|\\.)*"|'[^']*')\s*(?:#.*)?$/);if(match)try{current[key]=match[1].startsWith('"')?JSON.parse(match[1]):match[1].slice(1,-1);}catch{}}
        else if(['enabled','disabled'].includes(key))current[key]=/^true(?:\s|#|$)/.test(value);
        else if(['headers','http_headers','env_http_headers','bearer_token_env_var','oauth','command'].includes(key))current[key]=true;
      }
    }if(current)add(current);
  }
  return found;
}
async function isFile(path:string){try{return (await lstat(path)).isFile();}catch{return false;}}
async function npmCodex(directory:string,arch:string){
  const target=arch==='x64'?'x86_64-pc-windows-msvc':arch==='arm64'?'aarch64-pc-windows-msvc':undefined;
  if(!target)return;
  const root=join(directory,'node_modules','@openai','codex'),entry=join(root,'bin','codex.js');
  if(!await isFile(entry))return;
  // Resolve from the installed CLI, supporting both nested and hoisted optional packages.
  // Read paths only: never import or execute the discovered package during discovery.
  let vendor=join(root,'vendor');
  try{vendor=join(dirname(createRequire(entry).resolve('@openai/codex-win32-'+arch+'/package.json')),'vendor');}catch{}
  for(const sub of ['bin','codex']){
    const executable=join(vendor,target,sub,'codex.exe');
    if(await isFile(executable))return {executable};
  }
}
export async function discoverAgentCommands(home:string,options:{paths?:string[];platform?:NodeJS.Platform;arch?:string}={}):Promise<Connections['agents']>{
  const result:Connections['agents']={};
  const platform=options.platform??process.platform,arch=options.arch??process.arch;
  const paths=[...new Set([join(home,'.local','bin'),...(options.paths??[...(process.env.PATH??'').split(delimiter),...(process.env.APPDATA?[join(process.env.APPDATA,'npm')]:[])]).filter(isAbsolute)])];
  for(const agent of ['codex','claude'] as const){
    // Prefer standalone executables across PATH before considering npm layouts.
    for(const directory of paths){
      const executable=join(directory,agent+(platform==='win32'?'.exe':''));
      if(await isFile(executable)){result[agent]={executable};break;}
    }
    if(result[agent]||platform!=='win32')continue;
    for(const directory of paths){
      if(agent==='codex'){
        const command=await npmCodex(directory,arch);if(command){result.codex=command;break;}
      }else{
        const script=join(directory,'node_modules','@anthropic-ai/claude-code/cli.js');
        try{await access(script);result[agent]={executable:process.execPath,prefix:[script]};break;}catch{}
      }
    }
  }return result;
}
export async function discoverConnections(options:{home?:string;probe?:typeof checkMcp}={}){
  const home=options.home??homedir(),probe=options.probe??checkMcp;
  const files=[
    {path:join(home,'.codex','config.toml'),format:'toml' as const,source:'Codex'},
    ...(process.env.CODEX_HOME?[{path:join(process.env.CODEX_HOME,'config.toml'),format:'toml' as const,source:'Codex'}]:[]),
    {path:join(home,'.claude.json'),format:'json' as const,source:'Claude Code'},
    {path:join(home,'.claude','settings.json'),format:'json' as const,source:'Claude Code'},
    ...(process.env.APPDATA?[{path:join(process.env.APPDATA,'Claude','claude_desktop_config.json'),format:'json' as const,source:'Claude Desktop'}]:[]),
  ];
  const candidates:Candidate[]=[];
  for(const file of files)try{const info=await lstat(file.path);if(info.isFile()&&!info.isSymbolicLink()&&info.size<=1_000_000)candidates.push(...configEndpoints(await readFile(file.path,'utf8'),file.format,file.source));}catch{}
  candidates.push({url:'http://127.0.0.1:17082/mcp',source:'이 PC의 기본 Mail MCP 주소'},{url:'http://127.0.0.1:17080/mcp',source:'이 PC의 기본 DB MCP 주소'});
  const seen=new Map<string,Candidate>();for(const value of candidates)if(!seen.has(value.url))seen.set(value.url,value);
  const unique=[...seen.values()].slice(0,12);
  const results=await Promise.all(unique.map(async candidate=>{
    const [mail,db]=await Promise.all([probe(candidate.url,'mail'),probe(candidate.url,'db')]);
    return {...candidate,mail:mail.connected&&mail.compatible,db:db.connected&&db.compatible};
  }));
  return {mail:results.filter(value=>value.mail).map(({url,source})=>({url,source})),db:results.filter(value=>value.db).map(({url,source})=>({url,source})),agents:await discoverAgentCommands(home),
    note:'Codex·Claude의 HTTP 연결과 이 PC의 기본 주소를 확인했습니다. 인증 헤더·OAuth·stdio 연결은 자동으로 가져오지 않습니다.'};
}
