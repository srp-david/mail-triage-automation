import {z} from 'zod';

export const wslSettingsSchema=z.object({
  distribution:z.string().trim().min(1).max(100).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).refine(value=>!/^docker-desktop(?:-data)?$/i.test(value)),
  user:z.string().trim().min(1).max(64).regex(/^[a-zA-Z_][a-zA-Z0-9_.-]*\$?$/).optional(),
}).strict();
export const agentCommandSchema=z.object({
  executable:z.string().trim().min(1).max(2000).refine(value=>!/[\r\n\0]/.test(value)),
  prefix:z.array(z.string().max(2000).refine(value=>!value.includes('\0'))).max(5).optional(),
  wsl:wslSettingsSchema.optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.wsl&&(!/^(?:\/[\s\S]+|[a-zA-Z0-9_.-]+)$/.test(value.executable)||value.executable.includes('\\')||/\.exe$/i.test(value.executable)))ctx.addIssue({code:'custom',path:['executable'],message:'WSL에는 Linux 명령 이름 또는 절대 경로를 입력하세요.'});
});
export type Command=z.infer<typeof agentCommandSchema>;
export type WslSettings=z.infer<typeof wslSettingsSchema>;
