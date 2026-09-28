import type {PoolClient} from 'pg';
import {ApiError,type Principal} from '../../../packages/contracts/src/v1.js';
import {member} from './directory.js';

export {historyFilters,type HistoryFilters} from '../../../packages/contracts/src/history-filters.js';

// Report access is team-wide; this does not grant access to another PC or its mail source.
export async function teamSourceAccess(c:PoolClient,actor:Principal,id:string,write=false){
  const membership=await member(c,actor);
  const source=(await c.query('SELECT * FROM source WHERE id=$1 AND team_id=$2 AND active',[id,membership.team_id])).rows[0];
  if(!source||write&&membership.role==='viewer')throw new ApiError(404,'SOURCE_NOT_FOUND');
  return source;
}

// Both identities must have been verified against the same team-scoped fingerprint.
export const sameMail=(left:string,right:string)=>`(${left}.id=${right}.id OR EXISTS (
  SELECT 1 FROM common_mail_link l JOIN common_mail_link r ON r.common_id=l.common_id
  WHERE l.mail_key=${left}.id AND r.mail_key=${right}.id))`;

export const handlingJoin=(userParameter:string)=>`LEFT JOIN LATERAL (
  SELECT max(ph.handled_at) AS handled_at FROM personal_mail_handling ph
  JOIN mail_identity hm ON hm.id=ph.mail_key JOIN source hs ON hs.store_id=hm.store_id AND hs.active
  WHERE ph.user_id=${userParameter} AND hs.team_id=s.team_id AND ${sameMail('m','hm')}
) h ON true`;
