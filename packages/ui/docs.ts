import express from 'express';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

// Only packaged documentation HTML receives this policy. Mail/preview/app policies are separate.
export function mountDocumentation(app:express.Express,staticRoot:string){
  app.use('/docs',express.static(join(staticRoot,'docs'),{
    setHeaders(res,path){
      if(!path.endsWith('.html'))return;
      const html=readFileSync(path,'utf8');
      const hashes=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(match=>!(/\bsrc\s*=/i.test(match[1]))&&match[2].trim())
        .map(match=>"'sha256-"+createHash('sha256').update(match[2]).digest('base64')+"'");
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' "+hashes.join(' ')+"; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      res.setHeader('X-Content-Type-Options','nosniff');
    },
  }));
}
