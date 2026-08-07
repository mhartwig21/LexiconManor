import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
const ROOT='C:/Users/hartw/lexicon-loop-v2', PORT=5677, BASE=`http://localhost:${PORT}/LexiconManor/`;
const server=spawn(process.execPath,[resolve(ROOT,'node_modules/vite/bin/vite.js'),'preview','--port',String(PORT),'--strictPort'],{cwd:ROOT,stdio:['ignore','pipe','pipe']});
server.stdout.on('data',()=>{});server.stderr.on('data',b=>process.stderr.write('[p]'+b));
for(let i=0;i<60;i++){try{const r=await fetch(BASE);if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
let browser;
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
 const page=await ctx.newPage();
 await page.goto(BASE,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1200);
 await page.evaluate(()=>localStorage.clear());
 await page.goto(BASE,{waitUntil:'domcontentloaded'}); await page.waitForTimeout(1500);
 for(let i=0;i<10;i++){
   const st=await page.evaluate(()=>{const s=window.__manorStore.getState();return {day:s.day?.day??null,phase:s.day?.phase??null,url:location.hash};});
   const btns=await page.evaluate(()=>[...document.querySelectorAll('button,a')].map(b=>(b.textContent||'').replace(/\s+/g,' ').trim()).filter(Boolean).slice(0,12));
   console.log(i, JSON.stringify(st), JSON.stringify(btns));
   if(st.phase==='exploring') break;
   const dlg=await page.$('.dlg');
   if(dlg){ const p=await page.$('.dlg-choice--primary')||await page.$('.dlg-choices .dlg-choice'); if(p){await p.click().catch(()=>{});} else {await page.dispatchEvent('.dlg__sheet','pointerdown').catch(()=>{});} await page.waitForTimeout(300); continue; }
   const bs=await page.$$('button');
   if(bs.length){ await bs[0].click({timeout:3000}).catch(()=>{}); }
   await page.waitForTimeout(500);
 }
 await page.screenshot({path:resolve(ROOT,'.critic/probe.png')});
}finally{ if(browser) await browser.close(); server.kill(); }
