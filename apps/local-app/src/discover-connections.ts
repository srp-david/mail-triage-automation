import {readFile,lstat,access} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,delimiter,isAbsolute} from 'node:path';
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
async function commands(home:string):Promise<Connections['agents']>{
  const result:Connections['agents']={};
  const paths=[join(home,'.local','bin'),...(process.env.PATH??'').split(delimiter).filter(isAbsolute)];
  for(const agent of ['codex','claude'] as const){
    for(const directory of paths){
      const executable=join(directory,agent+(process.platform==='win32'?'.exe':''));
      try{if((await lstat(executable)).isFile()){result[agent]={executable};break;}}catch{}
      if(process.platform==='win32'){
        const script=join(directory,'node_modules',agent==='codex'?'@openai/codex/bin/codex.js':'@anthropic-ai/claude-code/cli.js');
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
  return {mail:results.filter(value=>value.mail).map(({url,source})=>({url,source})),db:results.filter(value=>value.db).map(({url,source})=>({url,source})),agents:await commands(home),
    note:'Codex·Claude의 HTTP 연결과 이 PC의 기본 주소를 확인했습니다. 인증 헤더·OAuth·stdio 연결은 자동으로 가져오지 않습니다.'};
}
