import {test} from 'vitest';
import assert from 'node:assert/strict';
import express from 'express';
import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {mailSource} from '../apps/local-app/src/source-client.js';
import {scanThreadMails} from '../apps/local-app/src/mail-threads.js';

test('one v1 thread scan initializes a single real MCP connection for all pages',async()=>{
  let initialized=0,calls=0;const resources:McpServer[]=[];
  const app=express();app.use(express.json());
  app.post('/mcp',async(req,res)=>{
    if(req.body.method==='initialize')initialized++;
    const mcp=new McpServer({name:'synthetic-mail',version:'1.0.0'});resources.push(mcp);
    mcp.registerTool('search_emails',{inputSchema:{limit:z.number(),offset:z.number()}},async({offset})=>{
      calls++;const value={emails:Array.from({length:Math.min(100,205-offset)},(_,i)=>({id:offset+i+1,inReplyTo:[],references:[]})),nextOffset:offset+100<205?offset+100:null};
      return {content:[{type:'text',text:JSON.stringify(value)}]};
    });
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
    await mcp.connect(transport);await transport.handleRequest(req,res,req.body);res.on('close',()=>{void mcp.close();});
  });
  app.get('/mcp',(_req,res)=>res.sendStatus(405));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
    const source=mailSource('http://127.0.0.1:'+(server.address() as any).port+'/mcp');
    const result=await source.withSearch!(search=>scanThreadMails({limit:30,offset:0},search));
    assert.equal(result.emails.length,205);assert.equal(calls,3);assert.equal(initialized,1);
    await source.call('search_emails',{limit:100,offset:0});assert.equal(initialized,2);
  }finally{await Promise.all(resources.map(r=>r.close()));await new Promise<void>(r=>server.close(()=>r()));}
});
