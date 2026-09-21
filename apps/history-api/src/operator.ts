// Operator-only module; never mounted by the HTTP/Edge app.
import {transaction} from './db.js';
import {lock} from './directory.js';
import {username,temporaryPassword,hashPassword} from './password.js';
import {uuid} from '../../../packages/contracts/src/v1.js';
export async function operatorAccount(command:'map-user'|'recover-admin',teamId:string,userId:string,newUsername?:string){
 uuid.parse(teamId);uuid.parse(userId);const password=temporaryPassword(),hash=await hashPassword(password);
 await transaction(async c=>{
  await lock(c);const u=(await c.query('SELECT u.*,m.role FROM app_user u JOIN membership m ON m.user_id=u.id WHERE u.id=$1 AND m.team_id=$2',[userId,teamId])).rows[0];
  if(!u)throw Error('EXPLICIT_USER_ID_NOT_FOUND');
  if(command==='recover-admin'&&u.role!=='admin')throw Error('EXISTING_ADMIN_REQUIRED');
  if(command==='map-user'&&(u.username||(await c.query('SELECT 1 FROM user_credential WHERE user_id=$1',[userId])).rowCount))throw Error('ALREADY_MAPPED');
  const normalized=command==='map-user'?username(newUsername):u.username;if(!normalized)throw Error('EXPLICIT_MAPPING_REQUIRED');
  await c.query('UPDATE app_user SET username=$2,active=true WHERE id=$1',[userId,normalized]);
  await c.query('UPDATE membership SET active=true WHERE user_id=$1 AND team_id=$2',[userId,teamId]);
  await c.query("INSERT INTO user_credential(user_id,password_hash,temporary_until) VALUES($1,$2,now()+interval '24 hours') ON CONFLICT(user_id) DO UPDATE SET password_hash=$2,must_change=true,temporary_until=now()+interval '24 hours',changed_at=now()",[userId,hash]);
  await c.query('UPDATE auth_session SET revoked_at=now() WHERE user_id=$1',[userId]);
  await c.query('INSERT INTO audit_event(action,target_id) VALUES($1,$2)',['operator.'+command,userId]);
 });return {temporaryPassword:password};
}
