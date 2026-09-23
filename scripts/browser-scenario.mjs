import {chromium} from '@playwright/test';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const browserExecutable=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
 (process.platform==='win32'&&existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
  ?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined);

// Keep existing diagnostic entry points while Playwright Test owns CI execution.
export async function standalone(url,verify){
 if(!process.argv[1]||resolve(process.argv[1])!==fileURLToPath(url))return;
 const browser=await chromium.launch({headless:true,executablePath:browserExecutable});
 try{await verify(browser);}finally{await browser.close();}
}
