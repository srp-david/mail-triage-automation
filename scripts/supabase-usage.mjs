// Planning model, not billed telemetry. No customer data is read.
export function usage({users=5,days=22,hours=8,idleSeconds=60,statusSeconds=60,statusCalls=5,analysesPerDay=10,analysisSeconds=120,heartbeatSeconds=30,reportBytes=30000,readsPerReport=5,baseDbBytes=20000000,months=6}={}){
 const activeSeconds=days*hours*3600;
 const polls=users*activeSeconds*(1/idleSeconds+statusCalls/statusSeconds);
 const analyses=users*days*analysesPerDay;
 const jobCalls=analyses*(8+Math.ceil(analysisSeconds/heartbeatSeconds));
 const authCalls=users*days*(2+hours*30); // refresh+identity once per ~4 min
 const calls=Math.ceil(polls+jobCalls+authCalls);
 const egressBytes=Math.ceil((polls+authCalls+jobCalls)*1500+analyses*readsPerReport*reportBytes);
 const dbGrowthBytes=Math.ceil(analyses*(reportBytes+12000)+authCalls*700);
 const dbBytes=baseDbBytes+dbGrowthBytes*months;
 return {assumptions:{users,days,hours,idleSeconds,statusSeconds,statusCalls,analysesPerDay,analysisSeconds,heartbeatSeconds,reportBytes,readsPerReport,baseDbBytes,months},calls,egressBytes,dbGrowthBytes,dbBytes,within:{calls:calls<=500000,egress:egressBytes<=5000000000,database:dbBytes<=500000000},headroomTarget:0.7};
}
if(process.argv[1]?.endsWith('supabase-usage.mjs'))console.log(JSON.stringify([2,5,10].map(users=>usage({users})),null,2));
