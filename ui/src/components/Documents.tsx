import {useCallback,useEffect} from 'react';
import {DomLeaf} from './Common';
import {markdownView} from '../../../viewer/markdown.js';
import {renderMailBody} from '../../../public/mail-body.js';
import {loadImageCards} from '../../../public/attachments.js';
import {openOfficePreview,closeOfficePreview} from '../../../public/office-preview.js';
import type {Attachment,Body} from '../api/types';
export function MarkdownView({value='',label='문서'}:{value?:string;label?:string}){
 return <DomLeaf create={useCallback(()=>markdownView(value,label),[value,label])}/>;
}
export function MailBody({body,attachments,fetchAttachment}:{body:Body;attachments:Attachment[];fetchAttachment:(a:Attachment)=>Promise<unknown>}){
 return <DomLeaf create={useCallback(()=>{const rendered=renderMailBody(body,attachments,fetchAttachment);void loadImageCards(rendered.cards);return rendered.element;},[body,attachments,fetchAttachment])}/>;
}
export function PreviewDialog({attachment,loadFile,download}:{attachment:Attachment|null;loadFile:(a:Attachment,s?:AbortSignal)=>Promise<Blob>;download:(a:Attachment)=>Promise<void>}){
 useEffect(()=>{if(attachment)openOfficePreview(attachment,loadFile,download);return closeOfficePreview;},[attachment,loadFile,download]);return null;
}
