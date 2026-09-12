import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

// Production controller, templates, AsyncScope and modal authorities. Only
// session and mail API boundaries are fixtures. Every write is held in memory;
// the browser cannot reach Microsoft, send email or modify a real mailbox.
const ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));
const mocks = new Map([
  ["/src/core/index.js", `
    const user={id:"mail-fixture-admin",displayName:"Operadora de prueba",email:"operator@example.test",role:"admin"};
    export const AppCore={getCurrentUser:()=>user,getState:()=>({user,role:"admin"}),publicUser:value=>value};
    export default AppCore;
  `],
  ["/src/features/auth/index.js", "export const Auth={getUser:()=>null,getCurrentUser:()=>null};"],
  ["/src/views/correo/correo.api.js", `
    const reads={
      getStatus:async()=>({connected:true,healthy:true,mailbox:"operator@example.test",displayName:"Operadora de prueba",mailboxes:[{mailbox:"operator@example.test",type:"primary"}]}),
      profile:async()=>({displayName:"Operadora de prueba"}),
      folders:async()=>[{id:"inbox",displayName:"Bandeja de entrada",unreadItemCount:0},{id:"drafts",displayName:"Borradores",unreadItemCount:0}],
      messages:async()=>({messages:structuredClone(window.fixtureMessages),nextCursor:""}),
      message:async id=>structuredClone(window.fixtureMessages.find(message=>message.id===id)),
      attachments:async()=>[],
    };
    const names=["connect","disconnect","updateMessage","moveMessage","deleteMessage","send","reply","replyAll","forward","createDraft","updateDraft","sendDraft","downloadAttachment","uploadAttachment"];
    export default Object.freeze({...reads,...Object.fromEntries(names.map(name=>[name,(...args)=>window.fixtureWrite(name,args)]))});
  `],
]);
const html = `<!doctype html><html lang="es" data-theme="dark"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>@layer reset,tokens,base,components,views,features,utilities;</style>
  <link rel="stylesheet" href="/src/css/tokens/variables.css">
  <link rel="stylesheet" href="/src/css/tokens/light.css">
  <link rel="stylesheet" href="/src/css/views/correo/index.css">
  <style>body{margin:0;font:16px sans-serif}#host{height:100vh}</style>
</head><body><main id="host"></main><script>
  localStorage.clear();
  window.fixtureMessages=[
    {id:"message-1",subject:"Consulta de prueba",from:{name:"Cliente de prueba",address:"customer@example.test"},toRecipients:[{address:"operator@example.test"}],ccRecipients:[],receivedDateTime:"2026-09-12T10:00:00Z",isRead:true,isDraft:false,bodyPreview:"Mensaje original",body:{contentType:"text",content:"Mensaje original"}},
    {id:"draft-1",subject:"Borrador de prueba",from:{name:"Operadora",address:"operator@example.test"},toRecipients:[{address:"draft@example.test"}],ccRecipients:[{address:"copy@example.test"}],receivedDateTime:"2026-09-12T09:00:00Z",isRead:true,isDraft:true,bodyPreview:"Cuerpo guardado",body:{contentType:"text",content:"Cuerpo guardado\\nSegunda línea"}},
  ];
  window.fixtureWrites=[];window.fixtureHold="";
  window.fixtureWrite=(method,args)=>{
    const entry={method,args,signal:args.at(-1)?.signal};fixtureWrites.push(entry);
    const result=()=>{
      if(method==="deleteMessage"){fixtureMessages=fixtureMessages.filter(message=>message.id!==args[0]);return true;}
      if(method==="createDraft")return {id:"saved-draft"};
      if(method==="updateDraft")return {id:args[0]};
      if(["send","reply","replyAll","forward","sendDraft","disconnect"].includes(method))return true;
      throw Error("Unexpected fixture write "+method);
    };
    if(fixtureHold===method)return new Promise((resolve,reject)=>{entry.resolve=()=>resolve(result());entry.reject=reject;});
    return Promise.resolve(result());
  };
</script><script type="module">
  import {CorreoView} from '/src/views/correo/index.js';
  window.fixtureController=CorreoView(document.querySelector('#host'));
</script></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://fixture").pathname;
    if (path === "/") { res.setHeader("Content-Type", "text/html"); res.end(html); return; }
    if (mocks.has(path)) { res.setHeader("Content-Type", "text/javascript"); res.end(mocks.get(path)); return; }
    const file = resolve(ROOT, `.${path}`);
    if (!file.startsWith(ROOT + sep) || !/\.(?:js|css)$/.test(path)) { res.writeHead(404).end(); return; }
    res.setHeader("Content-Type", path.endsWith(".css") ? "text/css" : "text/javascript");
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let completed = 0;
try {
  let executablePath;
  for (const path of [process.env.CHROME_BIN, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/tmp/chromium"].filter(Boolean)) {
    try { await access(path); executablePath = path; break; } catch { /* next */ }
  }
  assert.ok(executablePath, "Chrome/Chromium required for real mail modal tests");
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  const outside = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", async (dialog) => { errors.push(`Unexpected native ${dialog.type()}`); await dialog.dismiss(); });
  await page.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    outside.push(route.request().url());
    return route.abort();
  });
  const action = (name) => `[data-correo-action='${name}']`;
  const modal = "[data-correo-modal-root] [role='dialog'], [data-correo-modal-root] [role='alertdialog']";
  const composer = "[data-correo-compose-form]";
  const body = `${composer} textarea[name='body']`;
  const submit = `${composer} button[type='submit']`;
  async function fresh() {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(origin);
    await page.locator(action("reply")).waitFor();
    assert.equal(await page.evaluate(() => fixtureController.getSnapshot().connected), true);
  }
  async function waitClosed() {
    await page.waitForFunction(() => !document.querySelector("[data-correo-modal-root] [role='dialog'], [data-correo-modal-root] [role='alertdialog']"));
    assert.equal(await page.evaluate(() => document.body.style.overflow), "");
  }
  async function scenario(name, run) {
    await fresh();
    try { await run(); }
    catch (error) {
      console.error(JSON.stringify({ scenario: name, errors, state: await page.evaluate(() => ({ snapshot: fixtureController.getSnapshot(), modal: document.querySelector("[data-correo-modal-root]")?.innerText, writes: fixtureWrites.map(({ method, args }) => ({ method, target: typeof args[0] === "string" ? args[0] : "payload" })) })) }, null, 2));
      throw error;
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(outside, []);
    completed += 1;
    console.log(`PASS mail modal ${name}`);
  }

  await scenario("compose uses the inline host, traps Tab and restores its opener on Escape", async () => {
    await page.locator(action("compose")).click();
    await page.locator(composer).waitFor();
    assert.equal(await page.locator(modal).count(), 1);
    assert.equal(await page.locator(modal).evaluate((node) => node.closest("#host") !== null), true);
    await page.waitForFunction(() => document.activeElement?.name === "to");
    await page.locator(submit).focus();
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset.correoAction), "close-modal");
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.locator(submit).evaluate((node) => node === document.activeElement), true);
    await page.keyboard.press("Escape");
    await waitClosed();
    await page.waitForFunction(() => document.activeElement?.dataset.correoAction === "compose");
    assert.equal(await page.evaluate(() => fixtureWrites.length), 0);
  });

  await scenario("reply, reply-all and forward retain their selected message and payload", async () => {
    for (const [mode, method] of [["reply", "reply"], ["reply-all", "replyAll"], ["forward", "forward"]]) {
      await page.locator(action(mode)).click();
      await page.waitForFunction((expected) => document.querySelector("[data-correo-compose-form]")?.dataset.correoComposeMode === expected, mode);
      if (mode === "forward") await page.locator(`${composer} input[name='to']`).fill("FORWARD@example.test");
      else await page.waitForFunction(() => document.activeElement?.name === "body");
      await page.locator(body).fill(`Texto ${mode}\nSegunda línea`);
      await page.locator(submit).click();
      await waitClosed();
      const call = await page.evaluate(() => { const call = fixtureWrites.at(-1); return { method: call.method, id: call.args[0], payload: call.args[1], mailbox: call.args.at(-1).mailbox }; });
      assert.deepEqual(call, { method, id: "message-1", payload: mode === "forward" ? { to: ["forward@example.test"], comment: `Texto ${mode}\nSegunda línea` } : `Texto ${mode}\nSegunda línea`, mailbox: "operator@example.test" });
    }
    assert.equal(await page.evaluate(() => fixtureWrites.length), 3);
  });

  await scenario("draft editing preserves saved fields and blocks duplicate save and busy Escape", async () => {
    await page.locator("[data-correo-message-id='draft-1'][data-correo-action='select-message']").click();
    await page.locator(action("edit-draft")).click();
    assert.equal(await page.locator(`${composer} input[name='to']`).inputValue(), "draft@example.test");
    assert.equal(await page.locator(`${composer} input[name='cc']`).inputValue(), "copy@example.test");
    assert.equal(await page.locator(`${composer} input[name='subject']`).inputValue(), "Borrador de prueba");
    assert.equal(await page.locator(body).inputValue(), "Cuerpo guardado\nSegunda línea");
    await page.locator(body).fill("Borrador modificado\nOtra línea");
    await page.evaluate(() => { fixtureHold = "updateDraft"; });
    await page.locator(action("save-draft")).evaluate((node) => { node.click(); node.click(); });
    await page.waitForFunction(() => fixtureWrites.length === 1);
    assert.equal(await page.locator(body).isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(modal).count(), 1);
    const call = await page.evaluate(() => ({ method: fixtureWrites[0].method, id: fixtureWrites[0].args[0], payload: fixtureWrites[0].args[1] }));
    assert.deepEqual(call, { method: "updateDraft", id: "draft-1", payload: { to: ["draft@example.test"], cc: ["copy@example.test"], subject: "Borrador de prueba", body: "Borrador modificado\nOtra línea", importance: "normal" } });
    await page.evaluate(() => fixtureWrites[0].resolve());
    await waitClosed();
    assert.equal(await page.evaluate(() => fixtureWrites.length), 1);
  });

  await scenario("signature preview stays text and inserts the saved signature once", async () => {
    await page.locator(action("account-menu")).click();
    await page.locator(action("signature")).click();
    const signature = "Operadora de prueba\n<script>Firma segura</script>";
    await page.locator("[data-correo-signature-input]").fill(signature);
    assert.equal(await page.locator("[data-correo-signature-preview]").innerText(), signature);
    assert.equal(await page.locator("[data-correo-signature-preview] script").count(), 0);
    await page.locator("[data-correo-signature-form] button[type='submit']").click();
    await waitClosed();
    assert.equal(await page.evaluate(() => fixtureController.getSnapshot().signatureConfigured), true);
    for (const mode of ["compose", "reply", "forward"]) {
      await page.locator(action(mode)).click();
      assert.equal(await page.locator(body).inputValue(), signature);
      await page.keyboard.press("Escape");
      await waitClosed();
    }
    assert.equal(await page.evaluate(() => fixtureWrites.length), 0);
  });

  await scenario("delete confirmation supports cancellation and accepts the selected message once", async () => {
    await page.locator(action("delete-message")).click();
    await page.locator("[data-correo-confirm-dialog]").waitFor();
    await page.keyboard.press("Escape");
    await waitClosed();
    await page.waitForFunction(() => document.activeElement?.dataset.correoAction === "delete-message");
    assert.equal(await page.evaluate(() => fixtureWrites.length), 0);
    await page.locator(action("delete-message")).click();
    await page.locator(".correo-confirm-backdrop").evaluate((node) => node.click());
    await waitClosed();
    await page.locator(action("delete-message")).click();
    await page.locator(action("confirm-accept")).evaluate((node) => { node.click(); node.click(); });
    await waitClosed();
    await page.waitForFunction(() => fixtureController.getSnapshot().selectedMessageId === "draft-1");
    assert.deepEqual(await page.evaluate(() => fixtureWrites.map(({ method, args }) => [method, args[0]])), [["deleteMessage", "message-1"]]);
    assert.equal(await page.locator("[data-correo-message-id='message-1'][data-correo-action='select-message']").count(), 0);
  });

  await scenario("disconnect cancellation preserves the workspace and acceptance disconnects it", async () => {
    await page.locator(action("disconnect")).click();
    await page.locator("[data-correo-confirm-dialog]").waitFor();
    await page.locator("button[data-correo-action='confirm-cancel']").click();
    await waitClosed();
    assert.equal(await page.evaluate(() => fixtureController.getSnapshot().connected), true);
    assert.equal(await page.evaluate(() => fixtureWrites.length), 0);
    await page.locator(action("disconnect")).click();
    await page.locator(action("confirm-accept")).click();
    await page.waitForFunction(() => fixtureController.getSnapshot().connected === false);
    await waitClosed();
    assert.deepEqual(await page.evaluate(() => fixtureWrites.map(({ method }) => method)), ["disconnect"]);
  });

  await scenario("destroy cancels a pending confirmation and releases its dialog and keyboard lock", async () => {
    await page.locator(action("delete-message")).click();
    await page.locator(action("confirm-accept")).waitFor();
    await page.evaluate(() => {
      window.detachedAccept = document.querySelector("[data-correo-action='confirm-accept']");
      fixtureController.destroy();
      detachedAccept.click();
    });
    await waitClosed();
    assert.equal(await page.evaluate(() => fixtureWrites.length), 0);
    assert.equal(await page.evaluate(() => fixtureController.getSnapshot().destroyed), true);
  });

  await scenario("destroy aborts a busy draft request and a late result cannot reopen or repaint", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(action("compose")).click();
    await page.locator(`${composer} input[name='to']`).fill("draft@example.test");
    await page.locator(body).fill("Contenido local conservado");
    const bounds = await page.locator(modal).boundingBox();
    assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= 391, "Mobile composer fits the viewport");
    await page.evaluate(() => { fixtureHold = "createDraft"; });
    await page.locator(action("save-draft")).click();
    await page.waitForFunction(() => fixtureWrites.length === 1);
    await page.evaluate(() => { fixtureController.destroy(); window.afterDestroy = document.querySelector("#host").innerHTML; });
    assert.equal(await page.evaluate(() => fixtureWrites[0].signal.aborted), true);
    await page.evaluate(async () => { fixtureWrites[0].resolve(); await Promise.resolve(); await Promise.resolve(); });
    await waitClosed();
    assert.equal(await page.evaluate(() => document.querySelector("#host").innerHTML === afterDestroy), true);
    assert.deepEqual(await page.evaluate(() => fixtureWrites.map(({ method }) => method)), ["createDraft"]);
  });
  console.log(`Mail modal browser: ${completed} scenarios PASS`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
