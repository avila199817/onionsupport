import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/'){res.setHeader('Content-Type','text/html');res.end(`<html><body><main><div data-facturas-detail-root="true" data-factura-id="F-TEST"><div class="facturas-detail-actions"><button data-action="mark-factura-paid" data-factura-id="F-TEST">Marcar pagada</button></div></div></main><script>window.invoice={id:'F-TEST',numeroFacturaLegal:'PRUEBA-522',total:121,currency:'EUR',paymentStatus:'pending',cliente:{razonSocial:'PRUEBA',email:'test@example.test'}};window.calls=0;window.role='admin';window.fin={schemaVersion:2,status:'completed',document:{status:'ready'},delivery:{status:'sent'}};</script><script type="module">import '/src/features/facturas-paid-confirm/index.js';</script></body></html>`);return;}
 if(path==='/src/views/facturas/facturas.api.js'){res.setHeader('Content-Type','text/javascript');res.end(`export async function getFacturaById(){return structuredClone(window.invoice);}export async function markFacturaPaid(){window.calls++;await new Promise(r=>setTimeout(r,150));window.invoice.paymentStatus='paid';window.invoice.payment={finalization:window.fin};return {factura:window.invoice};}`);return;}
 if(path==='/src/core/index.js'){res.setHeader('Content-Type','text/javascript');res.end(`export const AppCore={getState:()=>({role:window.role})};`);return;}
 const target=resolve(root,'.'+path);if(!target.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',extname(target)==='.js'?'text/javascript':extname(target)==='.css'?'text/css':'text/plain');res.end(await readFile(target));
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync),headless:true,args:['--no-sandbox']});
try {
 const origin=`http://127.0.0.1:${server.address().port}`;const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 async function open(){await page.goto(origin);await page.locator('#onion-facturas-paid-confirm-root').waitFor({state:'attached'});await page.locator('[data-action="mark-factura-paid"]').first().click();await page.locator('[data-fpc-action="confirm"]').waitFor();}
 await open();await page.locator('[data-fpc-action="confirm"]').evaluate(el=>{el.click();el.click();});await page.getByText('Factura pagada; envío aceptado',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls),1);
 for(const status of ['uncertain','blocked']){await open();await page.evaluate(s=>{window.fin.status='partial';window.fin.delivery.status=s;},status);await page.locator('[data-fpc-action="confirm"]').click();await page.getByText(status==='uncertain'?'Envío pendiente de confirmación':'Factura pagada y actualizada',{exact:true}).waitFor();assert.equal(await page.getByText('Factura pagada; envío aceptado',{exact:true}).count(),0);}
 await open();await page.evaluate(()=>{window.role='user';});await page.locator('[data-fpc-action="confirm"]').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.calls),0);
 assert.deepEqual(errors,[]);console.log('Paid browser: real modal, double-click guard, accepted/uncertain/blocked copy and admin UI guard passed.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
