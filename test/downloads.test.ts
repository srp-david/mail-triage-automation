import { test } from 'vitest';
import assert from 'node:assert/strict';
import { attachmentDownload, DOWNLOAD_LIMIT } from '../src/attachments.js';
const result=(bytes:Buffer,filename='sample.zip')=>({
  structuredContent:{emailId:10,attachment:{attachmentId:'1.2',filename}},
  content:[{type:'resource',resource:{blob:bytes.toString('base64'),mimeType:'application/zip'}}]
});
test('downloads preserve bytes and handle every extension without executing file content',()=>{
  const bytes=Buffer.from([0,1,2,127,128,254,255]);
  for(const ext of ['zip','docx','pptx','xlsx']){
    const file=attachmentDownload(result(bytes,'문서.'+ext),10,'1.2');
    assert.deepEqual(file.data,bytes);assert.equal(file.filename,'문서.'+ext);
  }
  assert.equal(attachmentDownload(result(Buffer.alloc(0)),10,'1.2').data.length,0);
  assert.equal(attachmentDownload(result(bytes,'C:\\folder\\evil\r\n.xlsx'),10,'1.2').filename,'evil.xlsx');
});
test('downloads reject MCP failures, wrong attachment identity, malformed base64 and oversized responses',()=>{
  const fixture=result(Buffer.from('test'));
  assert.throws(()=>attachmentDownload({...fixture,isError:true},10,'1.2'));
  assert.throws(()=>attachmentDownload(fixture,11,'1.2'));
  assert.throws(()=>attachmentDownload(fixture,10,'1.3'));
  fixture.content[0].resource.blob='!!!!';
  assert.throws(()=>attachmentDownload(fixture,10,'1.2'));
  assert.equal(attachmentDownload(result(Buffer.alloc(DOWNLOAD_LIMIT)),10,'1.2').data.length,DOWNLOAD_LIMIT);
  assert.throws(()=>attachmentDownload(result(Buffer.alloc(DOWNLOAD_LIMIT+1)),10,'1.2'));
});
