exports.onExecutePostLogin=async(event,api)=>{
  const domains=(event.secrets.COMPANY_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  const email=event.user.email||'';
  if(!event.user.email_verified||!domains.includes(email.split('@')[1]?.toLowerCase())){api.access.deny('Verified company email required');return;}
  const ns=event.secrets.CLAIM_NAMESPACE;
  if(!ns){api.access.deny('Missing claim namespace');return;}
  api.accessToken.setCustomClaim(ns+'/email',email);
  api.accessToken.setCustomClaim(ns+'/email_verified',true);
};
