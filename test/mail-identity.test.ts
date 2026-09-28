import {test,expect} from 'vitest';
import {mailFingerprint} from '../packages/contracts/src/mail-identity.js';
const mail={messageId:'<Abc@Example.test>',subject:'문의',from:[{address:'A@example.test'}],sentAt:'2026-09-28T09:00:00+09:00'};
test('same original headers match across timezone and mailbox representations',()=>{
 expect(mailFingerprint(mail)).toBe(mailFingerprint({...mail,messageId:'<Abc@example.test>',from:[{address:'a@example.test'}],sentAt:'2026-09-28T00:00:00Z'}));
});
test('incomplete, ambiguous and different headers cannot silently identify a mail',()=>{
 for(const patch of [{messageId:null},{sentAt:null},{from:[]},{from:[...mail.from,...mail.from]}])expect(mailFingerprint({...mail,...patch})).toBeNull();
 for(const patch of [{messageId:'<abc@example.test>'},{subject:'Re: 문의'},{from:[{address:'b@example.test'}]},{sentAt:'2026-09-28T00:01:00Z'}])expect(mailFingerprint({...mail,...patch})).not.toBe(mailFingerprint(mail));
});
