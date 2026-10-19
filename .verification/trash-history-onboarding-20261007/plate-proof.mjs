import { chromium } from '/private/tmp/vegacms-ui-publish-icons-20261007/node_modules/@playwright/test/index.mjs';
import { writeFileSync } from 'node:fs';
const base='/Users/david/code/vegacms/.verification/trash-history-onboarding-20261007';
const browser=await chromium.launch({headless:true});const results=[];const errors=[];
try{
for(const width of [1440,390])for(const mode of ['light','dark']){
 const page=await browser.newPage({viewport:{width,height:1000}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`file://${base}/plate.html`);await page.selectOption('#mode',mode);
 const contrast=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d');
  const rgb=value=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3)};
  const lum=v=>v.map(x=>{const c=x/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).reduce((n,x,i)=>n+x*[.2126,.7152,.0722][i],0);
  const token=name=>{const d=document.createElement('div');d.style.color=`var(--${name})`;document.body.append(d);const r=rgb(getComputedStyle(d).color);d.remove();return r};
  return [['ink','bg'],['ink','surface'],['ink-2','surface'],['ink','info-soft'],['accent-ink','accent']].map(([a,b])=>{const x=lum(token(a)),y=lum(token(b));return{foreground:a,background:b,ratio:(Math.max(x,y)+.05)/(Math.min(x,y)+.05)}});
 });
 for(const state of ['missing','confirm','recovery','files']){
  await page.selectOption('#state',state);
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error(`overflow ${width} ${mode} ${state}`);
  await page.screenshot({path:`${base}/plate-${width}-${mode}-${state}.png`,fullPage:true});
 }
 await page.selectOption('#state','missing');await page.click('#prepare');
 if(await page.locator('#confirmbox').isVisible())throw Error('Home abrió confirmación automáticamente');
 await page.click('#createcollection');await page.keyboard.press('Escape');
 if(await page.locator('#confirmbox').isVisible())throw Error('Escape no cancela');
 const touch=await page.locator('#createcollection').boundingBox();if(touch.height<44)throw Error('target <44');
 if(contrast.some(x=>x.ratio<4.5))throw Error(`Contraste insuficiente ${JSON.stringify(contrast)}`);
 results.push({width,mode,overflow:false,contrast,touchTargetHeight:touch.height,homeDoesNotAutoConfirm:true,escapeCancels:true});await page.close();
}
if(errors.length)throw Error(errors.join(' | '));
writeFileSync(`${base}/plate-results.json`,JSON.stringify({passed:true,results,pageErrors:errors},null,2));console.log(JSON.stringify({passed:true,cases:results.length,pageErrors:errors.length}));
}finally{await browser.close()}
