import { createServer, request } from 'node:http';
import { config } from './config.js';
let endpoint:Promise<string>|undefined;
// This loopback-only adapter preserves the upstream localhost virtual host.
// It is not a public proxy and never accepts an arbitrary destination.
export async function mailEndpoint():Promise<string>{
  if(!process.env.MAIL_MCP_HOST_HEADER)return config.mailUrl;
  endpoint??=new Promise((resolve,reject)=>{
    const upstream=new URL(config.mailUrl);
    if(upstream.protocol!=='http:'){reject(new Error('Local mail adapter requires HTTP'));return;}
    const server=createServer((incoming,outgoing)=>{
      if(incoming.url!=='/mcp'||!['POST','GET','DELETE'].includes(incoming.method??'')){outgoing.writeHead(404).end();return;}
      const headers={...incoming.headers,host:process.env.MAIL_MCP_HOST_HEADER};
      delete headers.connection;
      const forwarded=request(upstream,{method:incoming.method,headers},response=>{
        outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);
        response.on('error',()=>outgoing.destroy());
      });
      forwarded.on('error',()=>{if(!outgoing.headersSent)outgoing.writeHead(502);outgoing.end();});
      outgoing.on('close',()=>forwarded.destroy());
      incoming.pipe(forwarded);
    });
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.unref();resolve('http://127.0.0.1:'+(server.address() as any).port+'/mcp');});
  });
  return endpoint;
}
