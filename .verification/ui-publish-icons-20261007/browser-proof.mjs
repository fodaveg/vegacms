import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { chromium, expect } from '/private/tmp/vegacms-ui-publish-icons-20261007/node_modules/@playwright/test/index.mjs';
const wt='/private/tmp/vegacms-ui-publish-icons-20261007';
const evidence='/Users/david/code/vegacms/.verification/ui-publish-icons-20261007';
const log=createWriteStream(`${evidence}/vite-dev.log`);
const server=spawn(process.execPath,[`${wt}/node_modules/vite/bin/vite.js`,'dev','--host','127.0.0.1','--port','4287','--strictPort'],{cwd:wt,env:process.env,stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log); server.stderr.pipe(log);
let browser; const results=[]; const errors=[];
try {
 for(let i=0;i<80;i++){try{const r=await fetch('http://127.0.0.1:4287/login');if(r.ok)break;}catch{} if(i===79)throw Error('Vite no arrancó');await new Promise(r=>setTimeout(r,250));}
 browser=await chromium.launch({headless:true});
 for(const [width,mode] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]) {
  const context=await browser.newContext({viewport:{width,height:1000},locale:'es-ES',hasTouch:width===390});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__VEGA_ADAPTER__='memory';});
  await page.goto('http://127.0.0.1:4287/login');
  await page.getByLabel('Correo electrónico').fill('demo@vega.dev');
  await page.getByLabel('Contraseña').fill('vega-demo');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page.getByRole('heading',{level:1,name:'Inicio',exact:true})).toBeVisible();
  await page.goto('http://127.0.0.1:4287/c/posts/post_2');
  const field=page.getByRole('textbox',{name:'Título',exact:true});
  await expect(field).toBeVisible();
  await page.evaluate(mode=>{document.documentElement.dataset.mode=mode;document.documentElement.dataset.theme='aquelarre';},mode);
  const button=page.locator('[data-status-target="published"]');
  await expect(button).toBeVisible();
  await expect(button.locator('svg')).toHaveAttribute('aria-hidden','true');
  await field.fill(''); await button.click();
  await expect(field).toHaveAttribute('aria-invalid','true'); await expect(field).toBeFocused();
  await expect(page.locator('.vega-editor-tag')).toHaveAttribute('data-status','draft');
  const marker=`Huerto publicado ${width} ${mode}`;
  await field.fill(marker);
  await page.screenshot({path:`${evidence}/form-${width}-${mode}-dirty.png`,fullPage:false});
  await button.click();
  if(await page.getByRole('alertdialog').count()) await page.locator('.vega-visual-publish-pop-btn--primary').click();
  await expect(page.locator('.vega-editor-tag')).toHaveAttribute('data-status','published');
  await expect(field).toHaveValue(marker);
  await page.screenshot({path:`${evidence}/form-${width}-${mode}-published.png`,fullPage:false});
  const icon=page.locator('.vega-editor-toolbar button').filter({has:page.locator('svg path[d^="m10 14"]')}).first();
  await expect(icon).toHaveAttribute('aria-label',/./);
  await expect(icon).not.toContainText('🔗');
  const box=await page.locator('[data-status-target="draft"]').boundingBox();
  if(!box||box.x<0||box.x+box.width>width)throw Error(`Publicación fuera de viewport ${width}`);
  if(width===390&&(box.width<44||box.height<44))throw Error('Objetivo móvil menor de44px');
  await page.getByRole('button',{name:'Entradas',exact:true}).click();
  await page.waitForURL('**/c/posts');
  await page.getByRole('link',{name:marker,exact:true}).click();
  await expect(field).toHaveValue(marker);
  await expect(page.locator('.vega-editor-tag')).toHaveAttribute('data-status','published');
  results.push({width,mode,invalidStopsPublish:true,invalidFocus:true,contentPublished:true,spaPersistence:true,chainSvgAccessible:true,publicationWithinViewport:true,touchTarget:width===390?{width:box.width,height:box.height}:null});
  await context.close();
 }
 for(const [width,mode] of [[1440,'light'],[1440,'dark'],[390,'light'],[390,'dark']]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.goto(`file://${evidence}/plate.html`);await page.evaluate(mode=>document.documentElement.dataset.mode=mode,mode);
  await page.screenshot({path:`${evidence}/plate-${width}-${mode}.png`,fullPage:true});await page.close();
 }
 if(errors.length)throw Error(`Errores navegador: ${errors.join(' | ')}`);
 writeFileSync(`${evidence}/browser-results.json`,JSON.stringify({passed:true,source:'Vite dev del worktree candidato, memory sembrado; no build/distribución',results,pageErrors:errors},null,2));
 console.log(JSON.stringify({passed:true,cases:results.length,pageErrors:errors.length}));
} finally {
 await browser?.close();
 const stopped=new Promise(resolve=>server.once('close',(code,signal)=>resolve({code,signal})));
 server.kill('SIGTERM');
 const termination=await stopped;
 log.end();
 writeFileSync(`${evidence}/browser-cleanup.json`,JSON.stringify({ownVite:termination,browserClosed:true},null,2));
}
