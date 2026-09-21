import {useCallback,useEffect} from 'react';
import {DomLeaf} from './Common';
import {markdownView} from '../../../viewer/markdown.js';
import {renderMailBody} from '../../../../../public/mail-body.js';
import {loadImageCards} from '../../../../../public/attachments.js';
import {openOfficePreview,closeOfficePreview} from '../../../../../public/office-preview.js';
import type {Attachment,Body} from '../api/types';
export function MarkdownView({value='',label='문서'}:{value?:string;label?:string}){
 return <DomLeaf create={useCallback(()=>markdownView(value,label),[value,label])}/>;
}
export function MailBody({body,attachments,fetchAttachment}:{body:Body;attachments:Attachment[];fetchAttachment:(a:Attachment)=>Promise<unknown>}){
 return <DomLeaf create={useCallback(()=>{const rendered=renderMailBody(body,attachments,fetchAttachment);void loadImageCards(rendered.cards);return rendered.element;},[body,attachments,fetchAttachment])}/>;
}
export function MailContent({body,text,attachments,fetchAttachment,fallbackHint='본문 서식을 불러오지 못해 텍스트로 표시합니다.'}:{body:Body;text?:string;attachments:Attachment[];fetchAttachment:(a:Attachment)=>Promise<unknown>;fallbackHint?:string}){
 return body.html?<MailBody body={body} attachments={attachments} fetchAttachment={fetchAttachment}/>:<><pre>{text??'본문이 없습니다.'}</pre>{(body.unavailable||!!body.warnings?.length)&&<p className="meta">{fallbackHint}</p>}</>;
}
export function PreviewDialog({attachment,loadFile,download}:{attachment:Attachment|null;loadFile:(a:Attachment,s?:AbortSignal)=>Promise<Blob>;download:(a:Attachment)=>Promise<void>}){
 useEffect(()=>{if(attachment)openOfficePreview(attachment,loadFile,download);return closeOfficePreview;},[attachment,loadFile,download]);return null;
}
