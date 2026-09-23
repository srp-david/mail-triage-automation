exports.onExecutePreUserRegistration=async(event,api)=>{
  const domains=(event.secrets.COMPANY_DOMAINS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
  if(!domains.includes((event.user.email||'').split('@')[1]?.toLowerCase()))api.access.deny('company_domain','Company email required');
};
