import { mailEndpoint } from './mail-proxy.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { config, HttpError } from './config.js';
export async function withMcp<T>(url: string, action: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: 'mail-triage-web', version: '0.1.0' });
  const transport = new StreamableHTTPClientTransport(new URL(url === config.mailUrl ? await mailEndpoint() : url));
  try { await client.connect(transport); return await action(client); }
  finally { await client.close().catch(() => {}); }
}
export function unpack(result: any): any {
  if (result.isError) throw new HttpError(502, 'MCP 도구 오류: ' + JSON.stringify(result.content).slice(0, 400));
  if (result.structuredContent) return result.structuredContent;
  for (const block of result.content ?? []) {
    if (block.type === 'text') {
      try { return JSON.parse(block.text); } catch { /* text-only tools */ }
    }
  }
  return result;
}
export async function callMail(name: string, args: Record<string, unknown>) {
  return withMcp(config.mailUrl, async c => {
    const result = unpack(await c.callTool({ name, arguments: args }, undefined, { timeout: 180000 }));
    if (result.code) throw new HttpError(502, '메일 조회 실패: ' + result.code);
    return result;
  });
}
// A full thread scan reuses one MCP session instead of connecting per page.
export async function withMailSearch<T>(action:(search:(args:Record<string,unknown>)=>Promise<any>)=>Promise<T>){
  return withMcp(config.mailUrl,c=>action(async args=>{
    const result=unpack(await c.callTool({name:'search_emails',arguments:args},undefined,{timeout:180000}));
    if(result.code)throw new HttpError(502,'메일 조회 실패: '+result.code);
    return result;
  }));
}
export async function callAttachment(emailId:number,attachmentId:string):Promise<any> {
  return withMcp(config.mailUrl,c=>c.callTool({name:'get_attachment',arguments:{email_id:emailId,attachment_id:attachmentId}}));
}
// Preserve structured sync error codes; permanent auth/storage errors must not be retried.
export async function callSync(_name: string, args: Record<string, unknown>) {
  return withMcp(config.mailUrl, async c => {
    const raw=await c.callTool({name:'sync',arguments:args},undefined,{timeout:180000});
    const result=unpack({...raw,isError:false});
    if(result.code)return {status:'failed',saved:0,failed:0,remaining:null,errors:[{code:result.code}]};
    if(raw.isError)throw new HttpError(502,'MCP sync failed without a structured code');
    return result;
  });
}
export async function fullMail(id: number) {
  let offset = 0; let body = ''; let first: any;
  for (;;) {
    const page = await callMail('get_email', { id, body_offset: offset, body_limit: 30000 });
    first ??= page;
    body += page.body ?? '';
    if (body.length > 5_000_000) throw new HttpError(422, '본문이 조회 한도를 초과했습니다.');
    if (page.nextBodyOffset == null) return { ...first, body, nextBodyOffset: null, truncated: false };
    if (page.nextBodyOffset <= offset) throw new HttpError(502, '본문 페이지가 진행되지 않았습니다.');
    offset = page.nextBodyOffset;
  }
}
