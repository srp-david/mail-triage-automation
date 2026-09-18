import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile,rename,lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const helper=`Add-Type -AssemblyName System.Security
$v = [Console]::In.ReadToEnd() | ConvertFrom-Json
$b = [Convert]::FromBase64String($v.data)
if ($v.mode -eq 'protect') { $r = [Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) }
elseif ($v.mode -eq 'unprotect') { $r = [Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser) }
else { exit 1 }
[Console]::Out.Write([Convert]::ToBase64String($r))`;
export function dpapi(mode:'protect'|'unprotect',data:Buffer):Promise<Buffer>{
  if(process.platform!=='win32')throw new Error('WINDOWS_DPAPI_REQUIRED');
  return new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(helper,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('DPAPI_TIMEOUT'));},15000);
    child.stdout.on('data',b=>output+=b);child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('DPAPI_FAILED'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve(Buffer.from(output.trim(),'base64')):reject(new Error('DPAPI_FAILED'));});
    child.stdin.end(JSON.stringify({mode,data:data.toString('base64')}));
  });
}
export class ProtectedStore {
  constructor(readonly root:string){}
  private path(key:string){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(key))throw new Error('INVALID_SECRET_KEY');return join(resolve(this.root),key+'.dpapi');}
  async write(key:string,value:unknown){
    const bytes=await dpapi('protect',Buffer.from(JSON.stringify(value)));
    await mkdir(this.root,{recursive:true});if((await lstat(this.root)).isSymbolicLink())throw new Error('UNSAFE_STORE');
    await restrictDirectory(this.root);
    const path=this.path(key),temp=path+'.'+randomUUID()+'.tmp';
    await writeFile(temp,bytes,{flag:'wx',mode:0o600});await rename(temp,path);
  }
  async read(key:string){return JSON.parse((await dpapi('unprotect',await readFile(this.path(key)))).toString('utf8'));}
}
async function restrictDirectory(path:string){
  // Modify only the DACL. Set-Acl with a fresh descriptor can request SACL privileges
  // on a subsequent write, even when the current user already owns the directory.
  // Console input uses the Windows code page. Send ASCII base64 so non-ASCII
  // install paths survive even when PowerShell's input encoding is not UTF-8.
  const code=`$ErrorActionPreference='Stop';$p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()));$a=[IO.Directory]::GetAccessControl($p,[Security.AccessControl.AccessControlSections]::Access);$a.SetAccessRuleProtection($true,$false);foreach($old in @($a.Access)){$a.RemoveAccessRuleSpecific($old)};$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;$r=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow');$a.AddAccessRule($r);[IO.Directory]::SetAccessControl($p,$a)`;
  await new Promise<void>((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','ignore','ignore']});
    const timer=setTimeout(()=>{child.kill();reject(new Error('ACL_TIMEOUT'));},15000);
    child.on('error',()=>{clearTimeout(timer);reject(new Error('ACL_FAILED'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('ACL_FAILED'));});child.stdin.end(Buffer.from(resolvePath(path),'utf8').toString('base64'));
  });
}
const resolvePath=(path:string)=>resolve(path);
