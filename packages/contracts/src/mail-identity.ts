import {createHash} from 'node:crypto';
import {z} from 'zod';

export const mailEvidence=z.object({
 messageId:z.string().max(2000).nullable(),subject:z.string().max(2000),
 from:z.array(z.object({address:z.string().max(320).optional(),name:z.string().optional()})).max(20),
 sentAt:z.string().max(100).nullable(),
}).strict();
export type MailEvidence=z.infer<typeof mailEvidence>;
// Deliberately conservative: preserve Message-ID local-part and subject case.
// Missing/ambiguous headers never fall back to subject-only matching.
export function mailFingerprint(input:MailEvidence):string|null {
 const value=mailEvidence.parse(input),match=/^<([^<>\s@]+)@([^<>\s@]+)>$/.exec(value.messageId?.trim()??'');
 const sender=value.from.length===1?value.from[0].address?.trim().toLowerCase():undefined;
 const sent=value.sentAt?Date.parse(value.sentAt):NaN;
 if(!match||!sender||!/^\S+@\S+$/.test(sender)||!Number.isFinite(sent)||!value.subject.trim())return null;
 return createHash('sha256').update(JSON.stringify(['v1',match[1]+'@'+match[2].toLowerCase(),sender,new Date(sent).toISOString(),value.subject.normalize('NFC').trim()])).digest('hex');
}
export function evidenceFromMail(mail:any):MailEvidence {
 return mailEvidence.parse({messageId:mail.messageId??null,subject:mail.subject??'',from:(mail.from??[]).map((x:any)=>({address:x.address})),sentAt:mail.sentAt??null});
}
