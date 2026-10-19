import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '/private/tmp/vegacms-trash-history-20261007/node_modules/@playwright/test/index.mjs';
const wt='/private/tmp/vegacms-trash-history-20261007';
const evidence='/Users/david/code/vegacms/.verification/trash-history-onboarding-20261007/browser-attempt5';
mkdirSync(evidence,{recursive:true});
const log=createWriteStream(`${evidence}/vite-dev.log`);
const server=spawn(process.execPath,[`${wt}/node_modules/vite/bin/vite.js`,'dev','--host','127.0.0.1','--port','4289','--strictPort'],{cwd:wt,env:process.env,stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log);server.stderr.pipe(log);
let browser;const results=[];const errors=[];
async function openPost(page,id){const link=page.locator('nav a[href="/c/posts"]');const box=await link.boundingBox();if(!box||box.x<0||box.x+box.width>page.viewportSize().width)await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();await link.click();await page.locator(`a[href="/c/posts/${id}"]`).click();await expect(page.getByRole('textbox',{name:'Título',exact:true})).toBeVisible();}
async function deletePost(page){await page.getByRole('button',{name:/^Borrar .+…$/}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Borrar',exact:true}).click();await page.waitForURL('**/c/posts');}
try{
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:4289/login')).ok)break;}catch{}if(i===79)throw Error('Vite did not start');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({headless:true});
 for(const [width,mode] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]){
  const context=await browser.newContext({viewport:{width,height:1000},locale:'es-ES',hasTouch:width===390,colorScheme:mode});const page=await context.newPage();console.log(`Case ${width} ${mode}`);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(({mode})=>{window.__VEGA_ADAPTER__='memory';localStorage.setItem('vega.mode.v1',mode);localStorage.setItem('vega.theme.v1','aquelarre');localStorage.setItem('vega.mode',mode);localStorage.setItem('vega.theme','aquelarre');},{mode});
  await page.goto('http://127.0.0.1:4289/login');await page.getByLabel('Correo electrónico').fill('demo@vega.dev');await page.getByLabel('Contraseña').fill('vega-demo');await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Inicio',exact:true})).toBeVisible();
  const theme=async()=>{await expect(page.locator('html')).toHaveAttribute('data-mode',mode);await expect(page.locator('html')).toHaveAttribute('data-theme','aquelarre');};await theme();const effective=[];const capture=async(scene)=>{await theme();const state=await page.evaluate(()=>{const root=document.documentElement;const probe=document.createElement('div');probe.style.cssText='position:fixed;left:-100px;width:1px;height:1px;background:var(--paper);color:var(--ink)';document.body.append(probe);const colors=getComputedStyle(probe);const css=getComputedStyle(root);const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const context=canvas.getContext('2d');const rgb=(value)=>{context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data];};const state={mode:root.dataset.mode,theme:root.dataset.theme,colorScheme:root.style.colorScheme,paper:css.getPropertyValue('--paper').trim(),ink:css.getPropertyValue('--ink').trim(),ink1:css.getPropertyValue('--ink1').trim(),paperComputed:colors.backgroundColor,inkComputed:colors.color,paperRGBA:rgb(colors.backgroundColor),inkRGBA:rgb(colors.color),bodyBackground:getComputedStyle(document.body).backgroundColor};probe.remove();return state;});if(state.mode!==mode||state.theme!=='aquelarre'||state.paperRGBA[3]!==255||state.inkRGBA[3]!==255)throw Error('Effective theme mismatch');const luminance=state.paperRGBA.slice(0,3).reduce((a,b)=>a+b,0)/3;if(mode==='dark'&&luminance>=100||mode==='light'&&luminance<=150)throw Error('Effective background does not match requested mode');effective.push({scene,...state});await page.screenshot({path:`${evidence}/${scene}-${width}-${mode}.png`,fullPage:false});};
  const card=page.locator('.vega-revisions-offer');await expect(card).toHaveCount(1);await expect(card).toContainText('Los archivos adjuntos y los enlaces');await expect(card).toContainText('En esta demo');
  await expect(card.locator('a')).toHaveAttribute('href','/settings#vega-revisions-settings-title');
  const target=await card.locator('a').boundingBox();if(!target||target.height<44||target.x<0||target.x+target.width>width)throw Error('Card target outside viewport or <44px');
  await card.locator('a').focus();await page.keyboard.press('Tab');await expect(card.getByRole('button',{name:'Ahora no'})).toBeFocused();
  await capture('home');
  await card.getByRole('button',{name:'Ahora no'}).click();await expect(card).toHaveCount(0);await page.reload();await expect(page.getByRole('heading',{level:1,name:'Inicio',exact:true})).toBeVisible();await expect(card).toHaveCount(0);
  await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('vega.revisionsOffer.v1:'))localStorage.removeItem(key);});await page.reload();await expect(card).toHaveCount(1);await theme();
  await openPost(page,'post_2');await deletePost(page);await expect(page.locator('.vega-toast-action')).toHaveCount(0);
  await page.locator('.vega-topbar-site').click();await card.locator('a').click();await expect(page.locator('#vega-revisions-settings-title')).toBeVisible();
  await expect(page.getByRole('button',{name:'Crear colección de historial',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Crear colección de historial',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Crear colección',exact:true}).click();await expect(page.locator('[data-revisions-settings-state="creatable"]')).toHaveCount(0);
  await page.locator('.vega-topbar-site').click();await expect(card).toHaveCount(0);await openPost(page,'post_3');const title=await page.getByRole('textbox',{name:'Título',exact:true}).inputValue();await deletePost(page);
  const action=page.getByRole('button',{name:'Ver en papelera',exact:true});await expect(action).toBeVisible();await expect(page.locator('.vega-toast[data-action]')).toContainText('Puedes consultar la versión guardada');
  const actionBox=await action.boundingBox();const closeBox=await page.locator('.vega-toast[data-action] .vega-toast-dismiss').boundingBox();if(!actionBox||!closeBox||actionBox.height<44||closeBox.width<44||closeBox.height<44||actionBox.x+actionBox.width>width)throw Error('Action targets outside viewport or <44px');
  await page.waitForTimeout(4500);await expect(action).toBeVisible();
  await capture('deleted');
  await action.focus();await page.keyboard.press('Enter');await page.waitForURL('**/papelera');await expect(page.getByRole('heading',{level:1,name:'Papelera',exact:true})).toBeVisible();await expect(page.locator('main')).toContainText(title);await expect(action).toHaveCount(0);
  await capture('trash');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);if(overflow)throw Error('Viewport overflow');
  results.push({width,mode,singleOffer:true,explicitBootstrap:true,dismissalSurvivesReload:true,noSnapshotNoAction:true,confirmedSnapshotAction:true,actionPersistent:true,keyboardAction:true,actionTarget:actionBox,closeTarget:closeBox,overflow:false,effectiveTheme:effective});await context.close();
 }
 for(const width of [1440,390]){const light=results.find(r=>r.width===width&&r.mode==='light');const dark=results.find(r=>r.width===width&&r.mode==='dark');for(const scene of ['home','deleted','trash']){const l=light.effectiveTheme.find(s=>s.scene===scene);const d=dark.effectiveTheme.find(s=>s.scene===scene);if(JSON.stringify(l.paperRGBA)===JSON.stringify(d.paperRGBA)||JSON.stringify(l.inkRGBA)===JSON.stringify(d.inkRGBA))throw Error('Light and dark colors are equal');}}if(errors.length)throw Error(errors.join(' | '));writeFileSync(`${evidence}/browser-results.json`,JSON.stringify({passed:true,tree:'e0adf41389a61c213bdd6f70f6eeae94bfdc84ca',source:'Vite dev candidate, seeded memory; no build/live PocketBase',results,pageErrors:errors,lightDarkDistinct:true,themeEvidence:"Persistent actual P3/P7 preferences; measured attrs and computed paper/ink RGBA before every screenshot. --ink1 is absent in current vocabulary."},null,2));console.log(JSON.stringify({passed:true,cases:results.length,pageErrors:errors.length}));
}finally{
 await browser?.close();const stopped=new Promise(resolve=>server.once('close',(code,signal)=>resolve({code,signal})));server.kill('SIGTERM');const termination=await stopped;log.end();writeFileSync(`${evidence}/browser-cleanup.json`,JSON.stringify({ownVite:termination,browserClosed:true},null,2));
}
