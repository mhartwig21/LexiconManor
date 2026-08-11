/**
 * scripts/r8-svg-type-probe.mjs — ROUND 8 verifier, AAA 6.6.
 *
 * Round 13's composition audit swept type sizes across 26 surfaces and found
 * two IM Fell captions under the 22px floor on the blueprint. It could not see
 * the blueprint's MAP LABELS, because those are SVG <text> inside a scaled
 * viewBox and the sweep walked HTML text nodes. This measures them the only way
 * that is honest: computed font-size multiplied by the element's real screen
 * CTM, so a viewBox scale of 2 would show up as double the declared px.
 *
 * Result (390x844): the scale is 0.997, i.e. one user unit IS one CSS pixel, so
 * the declared sizes are the on-glass sizes — .bp-plot__title 13px,
 * .bp-scale__label 10px, .bp-rowprice__n 12.5px, all in IM Fell English against
 * a 22px display floor and a 15px caption floor. Also confirms this round's
 * .bp-foot__tier fix landed (EB Garamond 15px, was IM Fell 15px).
 *
 * ONE browser, system Edge, closed in a finally. Needs `vite preview` on :4173.
 */
import { chromium } from 'playwright';
const BASE='http://localhost:4173/LexiconManor/';
const b=await chromium.launch({channel:'msedge',headless:true});
try{
 const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
 await p.goto(BASE,{waitUntil:'networkidle'});
 await p.waitForSelector('.bp-btn--seal'); await p.click('.bp-btn--seal');
 await p.waitForSelector('.chr-scene'); await p.click('.chr-scene__btn');
 for(let i=0;i<60&&await p.$('.dlg');i++){const c=await p.$('.dlg-choice--primary')||await p.$('.dlg-choices .dlg-choice');if(c){await c.click();await p.waitForTimeout(130);}else{await p.dispatchEvent('.dlg__sheet','pointerdown').catch(()=>{});await p.waitForTimeout(130);}}
 await p.waitForSelector('.bp-sheet'); await p.waitForTimeout(600);
 for(let i=0;i<15;i++){const m=await p.$('.mom'); if(!m)break; const r=await m.boundingBox(); if(r) await p.mouse.click(r.x+r.width/2,r.y+r.height/2).catch(()=>{}); await p.waitForTimeout(150);}
 const out=await p.evaluate(()=>{
   const sels=['.bp-plot__title','.bp-scale__label','.bp-rowprice__n','.bp-price','.bp-foot__tier','.bp-cabinet__title'];
   return sels.map(s=>{const el=document.querySelector(s); if(!el) return {s,missing:true};
     const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
     // effective on-glass size: computed font-size scaled by the SVG CTM if any
     let scale=1; try{const m=el.getScreenCTM?.(); if(m) scale=Math.abs(m.a);}catch{}
     return {s,font:cs.fontSize,family:cs.fontFamily.split(',')[0],scale:+scale.toFixed(3),
             onGlassPx:+(parseFloat(cs.fontSize)*scale).toFixed(1),h:+r.height.toFixed(1)};});
 });
 console.log(JSON.stringify(out,null,1));
} finally { await b.close(); }
