import { withMcp, unpack } from './mcp.js';
import { config } from './config.js';
const result:any={};
for(const [name,url] of [['mail',config.mailUrl],['db',config.dbUrl]]) {
  try {
    result[name]=await withMcp(url,async c=>{
      const tools=(await c.listTools()).tools.map(t=>t.name);
      if(name==='mail'){
        const page=unpack(await c.callTool({name:'search_emails',arguments:{limit:1}}));
        const id=page.emails?.[0]?.id;
        const mail=id?unpack(await c.callTool({name:'get_email',arguments:{id,body_limit:1}})):null;
        return {ok:true,tools,storedMailCount:page.total,oneMailReadable:!!mail?.id};
      }
      const query=unpack(await c.callTool({name:'execute_query',arguments:{database:'sr',sql:'SELECT 1 AS CONNECTION_OK FROM DUAL',maxRows:1}}));
      return {ok:true,tools,readQuery:query};
    });
  }catch(e){result[name]={ok:false,error:e instanceof Error?e.message:'connection_failed'};}
}
console.log(JSON.stringify(result,null,2));
if(Object.values(result).some((x:any)=>!x.ok))process.exitCode=1;
