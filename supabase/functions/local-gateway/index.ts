// Local verification only, never deploy this gateway. The hosted gateway provides routing.
Deno.serve(async (req:Request)=>{
  const url=new URL(req.url);
  const benchmark=url.pathname==='/local-benchmark';
  if(!benchmark&&!url.pathname.startsWith('/functions/v1/history/')&&!url.pathname.startsWith('/history/'))return new Response(null,{status:404});
  try{
    const worker=await EdgeRuntime.userWorkers.create({servicePath:'/home/deno/functions/'+(benchmark?'local-benchmark':'history'),memoryLimitMb:256,workerTimeoutMs:150000,noModuleCache:false,envVars:benchmark?[]:Object.entries(Deno.env.toObject())});
    return await worker.fetch(req);
  }catch{return Response.json({code:'EDGE_UNAVAILABLE'},{status:503});}
});
