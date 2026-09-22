import { test } from 'vitest';
import assert from 'node:assert/strict';
import { imageSources } from '../public/attachments.js';
test('MCP image and embedded image resources are both displayed',()=>{
 assert.deepEqual(imageSources({content:[{type:'text',text:'{"delivery":"image"}'},{type:'image',mimeType:'image/png',data:'YWJj'}]}),['data:image/png;base64,YWJj']);
 assert.deepEqual(imageSources({content:[{type:'resource',resource:{mimeType:'IMAGE/JPEG',blob:'YWJj'}}]}),['data:image/jpeg;base64,YWJj']);
});
test('MCP failures and unsupported resources are surfaced instead of blank image areas',()=>{
 assert.throws(()=>imageSources({isError:true,content:[{type:'text',text:'{"message":"첨부 크기 제한"}'}]}),/첨부 크기 제한/);
 assert.throws(()=>imageSources({structuredContent:{code:'TOO_LARGE',message:'첨부 크기 제한'},content:[]}),/첨부 크기 제한/);
 assert.throws(()=>imageSources({content:[{type:'resource',resource:{mimeType:'image/svg+xml',blob:'YWJj'}}]}),/표시 가능한/);
});
