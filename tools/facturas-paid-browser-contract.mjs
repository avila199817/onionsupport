import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve,extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const server=createServer(async(req,res)=>{try {
 const url=new URL(req.url,'http://localhost'),path=url.pathname;
 if(path==='/') {
  res.setHeader('Content-Type','text/html');res.end(`<html><body><main><div data-facturas-detail-root="true" data-factura-id="F-TEST"><div class="facturas-detail-actions"><button data-action="mark-factura-paid" data-factura-id="F-TEST">Marcar pagada</button></div></div></main><script>
   window.invoice={id:'F-TEST',facturaId:'F-TEST',tipoDocumento:'factura',numeroFacturaLegal:'PRUEBA-522',total:121,currency:'EUR',paymentStatus:${JSON.stringify(url.searchParams.has('paid')?'paid':'pending')},cliente:{razonSocial:'PRUEBA',email:'test@example.test'}};
   window.calls=0;window.reads=0;window.role='admin';window.getMode='complete';window.fin={schemaVersion:2,status:'completed',heartbeatAt:'2026-09-10T18:26:00Z',document:{status:'ready'},delivery:{status:'sent'}};
  </script><script type="module">import '/src/features/facturas-paid-confirm/index.js';</script></body></html>`);return;
 }
 // Keep every invoice API/normalizer/cache layer real. Only the HTTP boundary is isolated.
 if(path==='/src/core/http.js') {
  res.setHeader('Content-Type','text/javascript');res.end(`export default {
   async get(){window.reads++;let item=structuredClone(window.invoice);if(item.paymentStatus==='paid'){
    if(window.getMode==='error')throw Error('injected refresh failure');
    if(window.getMode==='missing')delete item.payment;
    if(window.getMode==='stale')item.payment={finalization:{schemaVersion:2,status:'pending',heartbeatAt:'2026-09-10T18:25:00Z'}};
   }return {ok:true,factura:item,item,data:item};},
   async post(){window.calls++;await new Promise(r=>setTimeout(r,100));window.invoice.paymentStatus='paid';window.invoice.payment={finalization:structuredClone(window.fin)};
    const item=structuredClone(window.invoice);return {ok:true,success:true,factura:item,item,finalization:{completed:window.fin.status==='completed'},meta:{paymentCommitted:true}};}
  };`);return;
 }
 if(path==='/src/core/index.js'){res.setHeader('Content-Type','text/javascript');res.end(`export const AppCore={getState:()=>({role:window.role})};`);return;}
 const target=resolve(root,'.'+path);if(!target.startsWith(root+'/'))throw Error('path');res.setHeader('Content-Type',extname(target)==='.js'?'text/javascript':extname(target)==='.css'?'text/css':'text/plain');res.end(await readFile(target));
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:[process.env.CHROME_BIN,'/usr/bin/google-chrome','/usr/bin/chromium'].filter(Boolean).find(existsSync),headless:true,args:['--no-sandbox']});
try {
 const origin=`http://127.0.0.1:${server.address().port}`,page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 async function open(query=''){await page.goto(origin+query);await page.locator('#onion-facturas-paid-confirm-root').waitFor({state:'attached'});await page.locator('[data-action="mark-factura-paid"]').first().click();}
 await open();await page.locator('[data-fpc-action="confirm"]').evaluate(el=>{el.click();el.click();});await page.getByText('Factura pagada; envío aceptado',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls),1);
 for(const mode of ['missing','error','stale']) {
  await open();await page.evaluate(m=>window.getMode=m,mode);await page.locator('[data-fpc-action="confirm"]').click();await page.getByText('Factura pagada; envío aceptado',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.calls),1);
  assert.equal(await page.locator('[data-fpc-action="retry"]').count(),0);
 }
 for(const status of ['uncertain','blocked']) {
  await open();await page.evaluate(s=>{window.fin.status='partial';window.fin.delivery.status=s;},status);await page.locator('[data-fpc-action="confirm"]').click();await page.getByText(status==='uncertain'?'Envío pendiente de confirmación':'Factura pagada y actualizada',{exact:true}).waitFor();assert.equal(await page.getByText('Factura pagada; envío aceptado',{exact:true}).count(),0);
 }
 await open('/?paid=1');await page.getByText('Cobro registrado; estado documental no disponible',{exact:true}).waitFor();assert.equal(await page.locator('[data-fpc-action="retry"]').count(),0);await page.locator('[data-fpc-action="refresh-status"]').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.calls),0);
 await open();await page.evaluate(()=>{window.role='user';});await page.locator('[data-fpc-action="confirm"]').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.calls),0);
 assert.deepEqual(errors,[]);console.log('Paid browser: 8 scenarios PASS through the real invoice API, normalizers, cache and modal; missing/stale/failed GET cannot fabricate a failed PDF or duplicate POST.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
