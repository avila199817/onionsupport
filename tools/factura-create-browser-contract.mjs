import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Real controller, templates, client model, DOM reconciliation and lifecycle.
// Only session/API boundaries are replaced. Never reads or writes production.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const css = ["tokens/variables.css", "tokens/light.css", "components/detail-modal.css", "views/facturas/create.css"];
const mocks = new Map([
  ["/src/core/index.js", `
    const user = {id:"fixture-admin",role:"admin"};
    const session = {authenticated:true,role:"admin",user,currentUser:user};
    export const AppCore = {
      hasRole:roles=>!roles.length || roles.includes("admin"),
      runtimeState:{read:()=>session},getState:()=>session,getCurrentUser:()=>user,
      getCurrentRole:()=>"admin",normalizeRole:v=>v,isAuthenticated:()=>true,
      registerModule(name,value){this[name]=value},getModule(name){return this[name]},
      request:(...args)=>window.fixtureRequest(...args),
    }; export default AppCore;
  `],
  ["/src/core/http.js", `const forbidden=()=>{throw Error("Unexpected HTTP boundary")}; export default {get:forbidden,request:forbidden};`],
  ["/src/views/facturas/facturas.api.js", `
    export const hydrateFacturasFromCache=()=>({items:[],total:0,totalKnown:true});
    export const getFacturasListContextKey=()=>"fixture-admin";
    export const computeFacturasStats=()=>({total:0,totalAmount:0,paidAmount:0,pendingAmount:0});
    export const listFacturas=()=>Promise.resolve({items:[],total:0,totalKnown:true,hasMore:false});
    export const loadFacturasStats=()=>Promise.resolve(computeFacturasStats());
    export const syncFacturasListCache=()=>true;
    export const createFactura=(payload)=>window.fixtureCreate(payload);
    ${["getFacturaById","sendFactura","markFacturaPaid","viewFacturaPdfRequest","downloadFacturaPdfRequest"].map(n=>`export const ${n}=()=>{throw Error("Unexpected ${n}")};`).join("\n")}
  `],
]);
const html = `<!doctype html><html lang="es" data-theme="dark"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>@layer reset,tokens,base,components,views,features,utilities;</style>
  ${css.map(p=>`<link rel="stylesheet" href="/src/css/${p}">`).join("")}
  <style>body{margin:0;font:16px sans-serif}#host{height:100vh;overflow:auto}</style>
</head><body><button id="opener">Nueva factura</button><main id="host"></main>
<script type="module">
  import * as internals from '/src/views/facturas/index.js';
  window.internals=internals;
  window.clients=[
    {id:'CON-NEW',nombreFiscal:'Nuevo particular',contacto:{email:'nuevo@example.test'},tipo:'particular'},
    {clienteId:'CON-BIZ',nombreFiscal:'Empresa vinculada',user:{id:'ON-REAL'},contactoEmail:'empresa@example.test',tipo:'empresa'},
    {clienteId:'CON-SECOND',nombreFiscal:'Segunda empresa',userId:'ON-REAL',tipo:'particular'},
  ];
  window.tickets=[
    {ticketId:'INC-NEW',clienteId:'CON-NEW',subject:'Equipo nuevo',updatedAt:'2026-09-10'},
    {ticketId:'INC-BIZ',cliente:{id:'CON-BIZ'},subject:'Servidor empresa',updatedAt:'2026-09-09'},
    {ticketId:'INC-LEGACY',userRef:{userId:'ON-REAL'},subject:'Historica vinculada',updatedAt:'2026-09-08'},
    {ticketId:'INC-SECOND',clienteId:'CON-SECOND',userId:'ON-REAL',subject:'Segunda empresa ticket',updatedAt:'2026-09-07'},
    {ticketId:'INC-OTHER',clienteId:'CON-OTHER',userId:'ON-REAL',subject:'Ajena no facturable',updatedAt:'2026-09-06'},
  ];
  window.calls=[];window.pending=[];window.creates=[];window.failTickets=false;window.holdTickets=false;
  window.fixtureRequest=(url,{query})=>{
    calls.push({url,query});
    if(url==='/api/search/clientes') return Promise.resolve({data:{items:clients.filter(c=>c.nombreFiscal.toLowerCase().includes(query.q.toLowerCase()))}});
    if(url!=='/api/search/incidencias') throw Error('Forbidden fixture endpoint '+url);
    const rows=tickets.filter(t=>{
      const cid=t.clienteId||t.cliente?.id; const uid=t.userId||t.userRef?.userId;
      return (!query.clienteId||cid===query.clienteId)&&(!query.userId||uid===query.userId)&&
        (!query.q || (t.subject+' '+t.ticketId).toLowerCase().includes(query.q.toLowerCase()));
    });
    if(holdTickets) return new Promise((resolve,reject)=>pending.push({query,resolve,reject,rows}));
    if(failTickets) return Promise.reject(Error('Fallo de red de prueba'));
    return Promise.resolve({data:{items:rows}});
  };
  window.fixtureCreate=(payload)=>{creates.push(payload);return new Promise((resolve,reject)=>{window.createResolve=resolve;window.createReject=reject})};
  window.controller=internals.createFacturasController(document.querySelector('#host'));
  controller.mount();controller.openCreateModal(document.querySelector('#opener'));window.ready=true;
</script></body></html>`;

const server = createServer(async (req,res) => {
  try {
    const path = new URL(req.url,"http://fixture").pathname;
    if(path==="/") {res.setHeader("Content-Type","text/html");res.end(html);return;}
    if(mocks.has(path)){res.setHeader("Content-Type","text/javascript");res.end(mocks.get(path));return;}
    const file = resolve(ROOT, `.${path}`);
    if(!file.startsWith(ROOT+sep)){res.writeHead(403);res.end();return;}
    let source=await readFile(file,"utf8");
    if(path==="/src/views/facturas/index.js") source+='\nexport {createFacturasController,normalizeClientCandidate,normalizeTicketCandidate,unwrapList,ticketBelongsToClients,searchTickets};';
    res.setHeader("Content-Type",path.endsWith(".css")?"text/css":"text/javascript");res.end(source);
  }catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
let executablePath=process.env.CHROMIUM_PATH || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
if(!executablePath) for(const p of ["/usr/bin/chromium","/usr/bin/chromium-browser","/usr/bin/google-chrome"]){try{await access(p);executablePath=p;break}catch{}}
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:["--no-sandbox"]});
const errors=[];
let passed=0;
const clientInput='[data-field="clienteSearch"]';
const ticketInput='[data-field="ticketSearch"]';
const slot='[data-slot="ticket-search-results"]';
const selected='[data-slot="selected-tickets"] article';
const action=name=>`[data-factura-create-action="create-${name}"]`;
async function fresh(viewport={width:1366,height:900}){
  const page=await browser.newPage({viewport});page.setDefaultTimeout(8000);
  page.on("pageerror",e=>errors.push(e.message));
  await page.route("**/*",route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  await page.goto(origin);await page.waitForFunction(()=>window.ready===true);return page;
}
async function idle(page){await page.waitForFunction(()=>document.querySelector('[data-slot="ticket-search-results"]')?.getAttribute('aria-busy')==='false');}
async function choose(page,q){await page.locator(clientInput).fill(q);await page.locator(action('client-select')).first().waitFor();await page.locator(action('client-select')).first().click();await idle(page);}
async function ticketIds(page){return page.locator(slot+' '+action('ticket-select')).evaluateAll(nodes=>nodes.map(n=>n.textContent.trim()));}
async function check(name,fn){if(process.env.ONION_FACTURA_TEST && !name.includes(process.env.ONION_FACTURA_TEST))return;await fn();passed++;console.log(`ok ${passed} - ${name}`);}
try {
  await check('canonical client identity and nested/empty response envelopes',async()=>{
    const p=await fresh();const result=await p.evaluate(()=>{
      const {normalizeClientCandidate:n,unwrapList:u,normalizeTicketCandidate:t,ticketBelongsToClients:b}=internals;
      return {client:n(clients[0]),linked:n(clients[1]).userId,missing:n({userId:'ON-ONLY'}),
        nested:u({data:{items:[1]}}),empty:u({items:[],data:{items:[2]}}),
        unrelated:b(t({id:'INC-X',clienteId:'CON-OTHER',userId:'ON-REAL'}),[n(clients[1])]),
        legacy:b(t(tickets[2]),[n(clients[1])])};
    });
    assert.equal(result.client.userId,'');assert.equal(result.client.name,'Nuevo particular');assert.equal(result.client.email,'nuevo@example.test');
    assert.equal(result.linked,'ON-REAL');assert.equal(result.missing,null);assert.deepEqual(result.nested,[1]);assert.deepEqual(result.empty,[]);
    assert.equal(result.unrelated,false);assert.equal(result.legacy,true);await p.close();
  });
  await check('new client without a login user loads its incidents and keeps modal/input nodes',async()=>{
    const p=await fresh();await p.evaluate(()=>{
      window.nodes={root:document.querySelector('.fac-create-root'),overlay:document.querySelector('.fac-create-overlay'),panel:document.querySelector('.fac-create-panel'),form:document.querySelector('form'),client:document.querySelector('[data-field="clienteSearch"]'),ticket:document.querySelector('[data-field="ticketSearch"]'),line:document.querySelector('[data-line-field="concepto"]')};
    });
    await p.locator('[data-line-field="concepto"]').fill('Trabajo en borrador');
    await choose(p,'Nuevo');
    assert.match((await ticketIds(p)).join(' '),/Equipo nuevo/);
    assert.equal(await p.locator(selected).count(),0);
    const facts=await p.evaluate(()=>({retained:Object.values(nodes).every(n=>n.isConnected),focused:document.activeElement===nodes.ticket,calls:calls.filter(c=>c.url.includes('incidencias')).map(c=>c.query),draft:nodes.line.value}));
    assert.equal(facts.retained,true);assert.equal(facts.focused,true);assert.equal(facts.draft,'Trabajo en borrador');
    assert.equal(facts.calls.length,1);assert.equal(facts.calls[0].clienteId,'CON-NEW');assert.equal('userId' in facts.calls[0],false);
    await p.locator(action('ticket-select')).first().click();assert.equal(await p.locator(selected).count(),1);
    assert.equal(await p.evaluate(()=>Object.values(nodes).every(n=>n.isConnected)),true);await p.close();
  });
  await check('linked and multi-client scopes merge safely without shared-user leakage or fabricated IDs',async()=>{
    const p=await fresh();await choose(p,'Empresa vinculada');
    let text=(await ticketIds(p)).join(' ');assert.match(text,/Servidor empresa/);assert.match(text,/Historica vinculada/);assert.doesNotMatch(text,/Ajena|Segunda empresa ticket/);
    await choose(p,'Segunda');assert.equal(await p.locator('[data-slot="selected-clientes"] article').count(),2);
    text=(await ticketIds(p)).join(' ');assert.match(text,/Segunda empresa ticket/);assert.doesNotMatch(text,/Ajena/);
    const queries=await p.evaluate(()=>calls.filter(c=>c.url.includes('incidencias')).map(c=>c.query));
    assert.ok(queries.some(q=>q.clienteId==='CON-SECOND'));
    assert.ok(queries.every(q=>Boolean(q.clienteId)!==Boolean(q.userId)));
    assert.ok(queries.every(q=>!q.clienteIds&&!q.userIds));await p.close();
  });
  await check('client removal cancels queued searches and never auto-selects another incident',async()=>{
    const p=await fresh();await choose(p,'Nuevo');await choose(p,'Empresa vinculada');
    await p.locator(ticketInput).fill('obsolete');
    await p.locator(action('client-remove')).first().evaluate(n=>n.click());await idle(p);await p.waitForTimeout(230);
    assert.equal(await p.locator(ticketInput).inputValue(),'');
    assert.equal(await p.locator(selected).count(),0);assert.match((await ticketIds(p)).join(' '),/Servidor empresa/);
    assert.equal(await p.evaluate(()=>calls.some(c=>c.query.q==='obsolete')),false);await p.close();
  });
  await check('out-of-order requests cannot overwrite the latest query or select stale hits',async()=>{
    const p=await fresh();await choose(p,'Empresa vinculada');await p.evaluate(()=>{holdTickets=true});
    await p.locator(ticketInput).fill('Servidor');await p.waitForFunction(()=>pending.length===2);
    assert.equal(await p.locator(slot+' '+action('ticket-select')).count(),0);
    await p.locator(ticketInput).fill('Historica');await p.waitForFunction(()=>pending.length===4);
    await p.evaluate(()=>pending.filter(r=>r.query.q==='Historica').forEach(r=>r.resolve({data:{items:r.rows}})));await idle(p);
    assert.match((await ticketIds(p)).join(' '),/Historica/);
    await p.evaluate(()=>pending.filter(r=>r.query.q==='Servidor').forEach(r=>r.resolve({data:{items:r.rows}})));
    await p.waitForTimeout(30);assert.match((await ticketIds(p)).join(' '),/Historica/);assert.doesNotMatch((await ticketIds(p)).join(' '),/Servidor/);await p.close();
  });
  await check('errors are distinct from empty results and reload recovers',async()=>{
    const p=await fresh();await p.evaluate(()=>{failTickets=true});await choose(p,'Nuevo');
    assert.match(await p.locator(slot).innerText(),/Fallo de red/);
    await p.evaluate(()=>{failTickets=false});await p.locator(action('ticket-refresh')).click();await idle(p);
    assert.match((await ticketIds(p)).join(' '),/Equipo nuevo/);
    await p.locator(ticketInput).fill('sin coincidencia');await p.waitForTimeout(250);await idle(p);
    assert.equal(await p.locator(slot+' '+action('ticket-select')).count(),0);assert.doesNotMatch(await p.locator(slot).innerText(),/Fallo de red/);await p.close();
  });
  await check('primary-client tax state, multiline draft and stable line identity survive changes',async()=>{
    const p=await fresh();await choose(p,'Empresa vinculada');
    await p.locator('[data-line-field="precioUnitario"]').fill('100');
    assert.match(await p.locator('[data-role="total-preview-inline"]').innerText(),/114/);
    await p.locator('[data-line-field="descripcion"]').fill('Detalle de la partida');
    await p.locator(action('line-add')).evaluate(n=>n.click());
    await p.locator('[data-line-field="concepto"]').nth(1).fill('Material');
    await p.evaluate(()=>{window.secondLine=document.querySelectorAll('[data-line-item]')[1]});
    await choose(p,'Nuevo');await p.locator(action('client-primary')).evaluate(n=>n.click());
    await p.locator('[data-line-field="precioUnitario"]').first().fill('200');
    assert.match(await p.locator('[data-role="tax-preview-inline"]').innerText(),/0,00/);
    assert.equal(await p.locator('[data-line-field="descripcion"]').first().inputValue(),'Detalle de la partida');
    await p.locator(action('line-remove')).first().evaluate(n=>n.click());
    assert.equal(await p.evaluate(()=>secondLine===document.querySelector('[data-line-item]')),true);
    assert.equal(await p.locator('[data-line-field="concepto"]').inputValue(),'Material');await p.close();
  });
  await check('validation and duplicate submit keep a single modal and immutable selected payload',async()=>{
    const p=await fresh();await p.evaluate(()=>{window.originalPanel=document.querySelector('.fac-create-panel')});
    await p.locator(action('submit')).evaluate(n=>n.click());assert.match(await p.locator('[data-error-slot="clienteId"]').innerText(),/Selecciona/);
    assert.equal(await p.evaluate(()=>originalPanel===document.querySelector('.fac-create-panel')),true);
    await choose(p,'Nuevo');await p.locator(action('ticket-select')).first().click();
    await p.locator('[data-field="sendEmail"]').uncheck();
    await p.locator(action('submit')).evaluate(n=>n.click());await p.waitForFunction(()=>creates.length===1);
    await p.evaluate(()=>{document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));document.querySelector('[data-factura-create-action="create-client-remove"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))});
    const data=await p.evaluate(()=>({count:creates.length,payload:creates[0],panel:originalPanel===document.querySelector('.fac-create-panel'),clients:document.querySelectorAll('[data-slot="selected-clientes"] article').length}));
    assert.equal(data.count,1);assert.equal(data.panel,true);assert.equal(data.clients,1);assert.equal(data.payload.clienteId,'CON-NEW');assert.equal(data.payload.ticketId,'INC-NEW');assert.equal(data.payload.sendEmail,false);
    await p.evaluate(()=>createReject(Error('Creacion rechazada de prueba')));await p.waitForFunction(()=>!controller.getSnapshot().creating);
    assert.match(await p.locator('.fac-create-alert').innerText(),/Creacion rechazada/);assert.equal(await p.locator(selected).count(),1);await p.close();
  });
  await check('close/reopen and destroy reject late results; keyboard close restores focus',async()=>{
    const p=await fresh();await choose(p,'Nuevo');await p.evaluate(()=>{holdTickets=true});await p.locator(action('ticket-refresh')).click();await p.waitForFunction(()=>pending.length===1);
    await p.keyboard.press('Escape');assert.equal(await p.locator('.fac-create-root').count(),0);
    await p.waitForFunction(()=>document.activeElement.id==='opener');
    await p.evaluate(()=>{controller.openCreateModal(document.querySelector('#opener'));pending[0].resolve({items:pending[0].rows})});
    await p.waitForTimeout(30);assert.equal(await p.locator(selected).count(),0);assert.equal(await p.locator(ticketInput).isDisabled(),true);
    await p.evaluate(()=>controller.destroy());assert.equal(await p.locator('.fac-create-root').count(),0);await p.close();
  });
  await check('mobile viewport has one stable scroll owner and no horizontal overflow',async()=>{
    const p=await fresh({width:390,height:844});await choose(p,'Nuevo');
    await p.evaluate(()=>{window.bodyNode=document.querySelector('.fac-create-body');bodyNode.scrollTop=180;window.beforeScroll=bodyNode.scrollTop;document.querySelector('[data-factura-create-action="create-ticket-select"]').click()});
    await p.waitForTimeout(30);
    const geometry=await p.evaluate(()=>({same:bodyNode===document.querySelector('.fac-create-body'),scroll:bodyNode.scrollTop,before:beforeScroll,panel:document.querySelector('.fac-create-panel').getBoundingClientRect().width,viewport:innerWidth}));
    assert.equal(geometry.same,true);assert.equal(geometry.scroll,geometry.before);assert.ok(geometry.panel<=geometry.viewport);await p.close();
  });
  assert.deepEqual(errors,[],"No uncaught browser errors");
  console.log(`factura-create-browser-contract: ${passed} scenarios passed`);
} finally {await browser.close();await new Promise(r=>server.close(r));}
