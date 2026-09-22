import {randomBytes} from 'node:crypto';
import type {Response} from 'express';

/** Only the app document permits nonce-bound Emotion styles; script policy stays unchanged. */
export function sendUiDocument(res:Response,html:string,native=false){
  const nonce=randomBytes(24).toString('base64');
  const csp=String(res.getHeader('Content-Security-Policy')??'');
  res.set('Content-Security-Policy',csp.replace("style-src 'self';",`style-src 'self'; style-src-elem 'self' 'nonce-${nonce}'; style-src-attr 'unsafe-inline';`));
  res.set('Cache-Control','no-store');
  return res.type('html').send(html.replace('<head>',`<head><meta name="csp-nonce" content="${nonce}">${native?'<meta name="triage-auth" content="native">':''}`));
}
