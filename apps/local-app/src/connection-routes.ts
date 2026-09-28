import type {Express} from 'express';
import {z} from 'zod';
import {ConnectionStore,endpointSchema,type Connections} from './connections.js';
import {discoverConnections} from './discover-connections.js';
import {checkMcp} from './mcp-connections.js';
import {AgentAdapter} from '../../../packages/agent-adapters/src/index.js';

export function connectionRoutes(app:Express,store:ConnectionStore,apply:(value:Connections,persist:()=>Promise<void>)=>Promise<void>){
  app.get('/api/connections',async(_req,res)=>res.json(await store.read()));
  app.post('/api/connections',async(req,res)=>res.json(await store.save(req.body,apply)));
  let discovery:ReturnType<typeof discoverConnections>|undefined;
  app.post('/api/connections/discover',async(_req,res)=>{
    discovery??=discoverConnections().finally(()=>{discovery=undefined;});res.json(await discovery);
  });
  app.post('/api/connections/check',async(req,res)=>{
    const input=z.object({kind:z.enum(['mail','db']),url:endpointSchema}).strict().parse(req.body);
    res.json(await checkMcp(input.url,input.kind));
  });
  app.post('/api/connections/agent-check',async(req,res)=>{
    const input=z.object({agent:z.enum(['codex','claude']),command:z.object({executable:z.string().min(1).max(2000),prefix:z.array(z.string().max(2000)).max(5).optional()}).strict()}).strict().parse(req.body);
    try{const result=await new AgentAdapter({agent:input.agent,command:input.command}).probe();res.json({installed:result.installed,supported:result.supported});}
    catch{res.json({installed:false,supported:false});}
  });
}
