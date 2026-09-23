export async function shutdownLocal(steps:{stop:()=>Promise<unknown>;close:()=>Promise<unknown>;clear:()=>Promise<unknown>;release:()=>Promise<unknown>}){
  let ok=true,stopped=false,closed=false,lockReleased=false;
  try{await steps.stop();stopped=true;}catch{ok=false;}
  try{await steps.close();closed=true;}catch{ok=false;}
  try{await steps.clear();}catch{ok=false;}
  // A credential cleanup failure must not strand a stopped app's lock, but never
  // advertise the install as stopped while a worker/server failed to stop.
  if(stopped&&closed)try{await steps.release();lockReleased=true;}catch{ok=false;}
  return {ok,lockReleased};
}
