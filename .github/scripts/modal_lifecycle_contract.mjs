import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/opt/google/chrome/chrome'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next browser */ }
}
assert.ok(executablePath, 'Chrome/Chromium required for actual modal interaction tests');
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') return res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><html lang="es"><head><title>Modal contract</title></head><body><button id="opener">Abrir</button></body></html>');
  try {
    const target = resolve(root, `.${path}`);
    if (!target.startsWith(root) || !/\.(?:js|css)$/.test(path)) throw new Error('Forbidden');
    let source = await readFile(target, 'utf8');
    // Exercise the actual private resend function without adding a public API.
    if (path === '/src/views/facturas/index.js' && req.url.endsWith('?modal-contract=1')) {
      source += '\nexport { confirmFacturaResend as testConfirmFacturaResend };\n';
    }
    if (path === '/src/features/incidencias-technician-profile/index.js' && req.url.endsWith('?modal-contract=1')) {
      source = source.replace('import "./style.css";', '');
      source += '\nexport { loadProfile as testOpenProfile }; export function testProfileApi(api) { incidenceApiPromise = Promise.resolve(api); }\n';
    }
    res.writeHead(200, { 'Content-Type': path.endsWith('.css') ? 'text/css' : 'text/javascript' }).end(source);
  } catch { res.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let count = 0;
try {
  const page = await browser.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function scenario(name, fn) {
    await page.goto(origin);
    await page.evaluate(async () => {
      window.modal = await import('/src/features/entity-overlay/modal-lifecycle.js');
      window.makePanel = (id, html = '<button>Primero</button><button>Último</button>') => {
        const panel = document.createElement('section');
        panel.id = id;
        panel.tabIndex = -1;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.innerHTML = html;
        document.body.append(panel);
        return panel;
      };
    });
    await fn(page);
    count += 1;
    console.log(`PASS modal ${name}`);
  }

  await scenario('nested Escape closes only the top and restores exact body styles', async (page) => {
    await page.evaluate(() => {
      document.body.style.setProperty('overflow', 'auto', 'important');
      document.body.style.overscrollBehavior = 'none';
      document.body.classList.add('preexisting');
      document.querySelector('#opener').focus();
      const parent = makePanel('parent');
      window.modalClosed = [];
      window.parentLife = modal.createModalLifecycle({ getPanel: () => parent, bodyClasses: ['shared', 'preexisting'], onEscape() { modalClosed.push('parent'); parent.remove(); parentLife.deactivate(); } });
      parentLife.activate();
      parent.querySelector('button').focus();
      const child = makePanel('child');
      window.childLife = modal.createModalLifecycle({ getPanel: () => child, bodyClasses: ['shared'], onEscape() { modalClosed.push('child'); child.remove(); childLife.deactivate(); } });
      childLife.activate();
      child.querySelector('button').focus();
    });
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [modalClosed, document.body.style.overflow, document.activeElement.closest('[role=dialog]')?.id, document.body.classList.contains('shared')]), [['child'], 'hidden', 'parent', true]);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [modalClosed, document.body.style.overflow, document.body.style.getPropertyPriority('overflow'), document.body.style.overscrollBehavior, document.activeElement.id, [...document.body.classList]]), [['child', 'parent'], 'auto', 'important', 'none', 'opener', ['preexisting']]);
  });

  await scenario('closing parent before child keeps the lock and never steals focus', async (page) => {
    const result = await page.evaluate(() => {
      const parent = makePanel('parent'); const child = makePanel('child');
      const a = modal.createModalLifecycle({ getPanel: () => parent });
      const b = modal.createModalLifecycle({ getPanel: () => child });
      a.activate(); b.activate(); child.focus();
      a.deactivate();
      const middle = [document.body.style.overflow, document.activeElement.id, modal.restoreModalFocus(document.querySelector('#opener'))];
      b.deactivate({ restoreFocus: false });
      return [middle, document.body.style.overflow, document.body.classList.contains('modal-open')];
    });
    assert.deepEqual(result, [['hidden', 'child', false], '', false]);
  });

  await scenario('busy modal consumes Escape without closing its parent', async (page) => {
    await page.evaluate(() => {
      window.modalClosed = [];
      const parent = makePanel('parent'); const child = makePanel('child');
      modal.createModalLifecycle({ getPanel: () => parent, onEscape: () => modalClosed.push('parent') }).activate();
      modal.createModalLifecycle({ getPanel: () => child, onEscape: () => false }).activate();
      child.focus();
    });
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => modalClosed), []);
  });

  await scenario('Tab skips hidden/inert/disabled nodes and recovers escaped focus', async (page) => {
    await page.evaluate(() => {
      const panel = makePanel('panel', '<button id="first">First</button><button disabled>Disabled</button><div hidden><button>Hidden</button></div><div inert><button>Inert</button></div><button style="visibility:hidden">Invisible</button><button id="last">Last</button>');
      modal.createModalLifecycle({ getPanel: () => panel }).activate();
      document.querySelector('#last').focus();
    });
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'first');
    await page.keyboard.press('Shift+Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'last');
    await page.locator('#opener').focus();
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'first');
  });

  await scenario('empty dialog remains focusable', async (page) => {
    await page.evaluate(() => { const panel = makePanel('panel', '<p>Loading</p>'); panel.removeAttribute('tabindex'); modal.createModalLifecycle({ getPanel: () => panel }).activate(); });
    await page.keyboard.press('Tab'); assert.equal(await page.evaluate(() => document.activeElement.id), 'panel');
  });

  await scenario('combobox receives first Escape without closing its dialog', async (page) => {
    await page.evaluate(() => {
      window.modalClosed = 0; const panel = makePanel('panel', '<input role="combobox" aria-expanded="true">');
      panel.addEventListener('keydown', (event) => { if (event.key === 'Escape' && event.target.getAttribute('aria-expanded') === 'true') { event.preventDefault(); event.target.setAttribute('aria-expanded', 'false'); } });
      modal.createModalLifecycle({ getPanel: () => panel, onEscape: () => modalClosed++ }).activate(); panel.querySelector('input').focus();
    });
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => modalClosed), 0);
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => modalClosed), 1);
  });

  await scenario('detached views release all locks even when owner cleanup throws', async (page) => {
    await page.evaluate(() => {
      const parent = makePanel('parent'); const child = makePanel('child');
      modal.createModalLifecycle({ getPanel: () => parent, onDetached: () => { throw new Error('owner teardown'); } }).activate();
      modal.createModalLifecycle({ getPanel: () => child }).activate(); parent.remove(); child.remove();
    });
    await page.waitForFunction(() => document.body.style.overflow === '');
    assert.equal(await page.evaluate(() => document.body.classList.contains('modal-open')), false);
  });

  await scenario('unmounted dialog cannot acquire a body lock', async (page) => {
    assert.deepEqual(await page.evaluate(() => { const lifecycle = modal.createModalLifecycle({ getPanel: () => null }); return [lifecycle.activate(), lifecycle.isActive(), document.body.style.overflow]; }), [false, false, '']);
  });

  await scenario('synchronous rerender and repeated activation keep one stack entry', async (page) => {
    await page.evaluate(() => {
      window.panel = makePanel('panel'); window.modalClosed = 0;
      window.life = modal.createModalLifecycle({ getPanel: () => panel, onEscape: () => modalClosed++ });
      life.activate({ classes: ['first-class'] }); life.activate({ classes: ['new-class'] });
      panel.remove(); panel = makePanel('replacement'); panel.focus();
    });
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [modalClosed, life.isActive(), document.body.classList.contains('first-class'), document.body.classList.contains('new-class')]), [1, true, false, true]);
    await page.evaluate(() => life.deactivate());
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });

  await scenario('closing the last modal removes its keyboard listener', async (page) => {
    await page.evaluate(() => { window.calls = 0; const panel = makePanel('panel'); const life = modal.createModalLifecycle({ getPanel: () => panel, onEscape: () => calls++ }); life.activate(); life.deactivate(); document.querySelector('#opener').focus(); });
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => calls), 0);
  });

  await scenario('private host leases never adopt or delete a foreign portal', async (page) => {
    const result = await page.evaluate(async () => {
      const { createModalHost } = await import('/src/features/entity-overlay/modal-host.js');
      const events = [];
      const a = createModalHost({ id:'leased-host', onMount:node => events.push(['mount', node.id]), onRemove:node => events.push(['remove', node.id]) });
      const b = createModalHost({ id:'leased-host' });
      const first = a.ensure();
      const repeated = a.ensure() === first;
      const refused = b.ensure() === null && b.remove() === false && first.isConnected;
      first.remove();
      const second = a.ensure();
      const recreated = second !== first && second.isConnected;
      a.remove();
      const successor = b.ensure();
      const staleSafe = a.remove() === false && successor.isConnected;
      b.remove();
      return { repeated, refused, recreated, staleSafe, events };
    });
    assert.deepEqual(result, { repeated:true, refused:true, recreated:true, staleSafe:true, events:[['mount','leased-host'],['remove','leased-host'],['mount','leased-host'],['remove','leased-host']] });
  });

  await scenario('private stable shell preserves identity, attributes, scroll, focus and selection', async (page) => {
    const result = await page.evaluate(async () => {
      const { createModalHost, renderModalContent } = await import('/src/features/entity-overlay/modal-host.js');
      const host = createModalHost().ensure();
      const options = { rootSelector:'.root', overlaySelector:'.overlay', panelSelector:'.panel', identityAttribute:'data-entity-id', focusAttributes:['data-field'], scrollSelector:'.body' };
      const html = (id, stale = false, disabled = false) => `<div class="root" data-entity-id="${id}" ${stale ? 'data-stale="true"' : ''}><div class="overlay"></div><section class="panel" tabindex="-1" role="dialog" ${stale ? 'aria-busy="true"' : ''}><div class="body" style="height:100px;width:140px;overflow:auto"><div style="height:900px;width:900px"><input data-field="name" value="abcdef" ${disabled ? 'disabled' : ''}></div></div></section></div>`;
      const first = renderModalContent(host, html('one', true), options);
      const life = modal.createModalLifecycle({ getPanel:() => host.querySelector('.panel') });
      life.activate();
      const input = first.panel.querySelector('input'); input.focus(); input.setSelectionRange(1,4,'backward');
      first.panel.querySelector('.body').scrollTop = 81; first.panel.querySelector('.body').scrollLeft = 33;
      const next = renderModalContent(host, html('one'), options);
      const stable = next.panel === first.panel && next.root === first.root && next.patched;
      const restored = [next.root.hasAttribute('data-stale'), next.panel.hasAttribute('aria-busy'), next.panel.querySelector('.body').scrollTop, next.panel.querySelector('.body').scrollLeft, document.activeElement.dataset.field, document.activeElement.selectionStart, document.activeElement.selectionEnd, document.activeElement.selectionDirection];
      renderModalContent(host, html('one', false, true), options);
      const disabledFallback = document.activeElement === first.panel;
      const child = makePanel('nested-child');
      const childLife = modal.createModalLifecycle({ getPanel:() => child }); childLife.activate(); child.focus();
      renderModalContent(host, html('one'), options);
      const nestedFocus = document.activeElement === child;
      childLife.deactivate({ restoreFocus:false }); child.remove();
      const changed = renderModalContent(host, html('two'), options);
      const replaced = !changed.patched && changed.panel !== first.panel;
      life.deactivate({ restoreFocus:false });
      return { stable, restored, disabledFallback, nestedFocus, replaced };
    });
    assert.deepEqual(result, { stable:true, restored:[false,false,81,33,'name',1,4,'backward'], disabledFallback:true, nestedFocus:true, replaced:true });
  });

  await scenario('technician child closes with its parent and ignores a late profile result', async (page) => {
    await page.evaluate(async () => {
      window.profile = await import('/src/features/incidencias-technician-profile/index.js?modal-contract=1');
      const parent = makePanel('ticket-owner', '<button id="technician-opener" data-ticket-id="INC-FIXTURE">Técnico</button>');
      parent.dataset.incidenciasModalRoot = 'true';
      window.ticketLife = modal.createModalLifecycle({ getPanel:() => parent }); ticketLife.activate();
      document.querySelector('#technician-opener').focus();
      profile.testProfileApi({ loadIncidenciaDetail:() => new Promise(resolve => { window.resolveProfile = resolve; }) });
      window.profileTask = profile.testOpenProfile(document.querySelector('#technician-opener'));
    });
    await page.locator('#incidencias-technician-profile-panel').waitFor();
    assert.equal(await page.locator('[role="dialog"]').count(), 2);
    await page.evaluate(() => document.querySelector('#ticket-owner').remove());
    await page.waitForFunction(() => !document.querySelector('#incidencias-technician-profile-panel') && document.body.style.overflow === '');
    await page.evaluate(async () => { resolveProfile({ id:'INC-FIXTURE', assignedToName:'Respuesta anterior' }); await profileTask; });
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
    assert.equal(await page.evaluate(() => document.body.classList.contains('modal-open')), false);
  });

  await scenario('actual Usuarios create keeps its physical shell and draft across conditional fields', async (page) => {
    await page.evaluate(async () => {
      window.create = await import('/src/views/usuarios/usuarios.template.create.js');
      create.open();
      window.createPanel = document.querySelector('[data-usuarios-create-panel="true"]');
      const name = document.querySelector('[data-usr-create-field="name"]'); name.value = 'Usuario de prueba'; name.dispatchEvent(new Event('input', { bubbles:true }));
      const type = document.querySelector('[data-usr-create-field="tipo"]'); type.focus(); type.value = 'empresa'; type.dispatchEvent(new Event('change', { bubbles:true }));
    });
    assert.deepEqual(await page.evaluate(() => [document.querySelector('[data-usuarios-create-panel="true"]') === createPanel, document.querySelector('[data-usr-create-field="name"]').value, document.activeElement.dataset.usrCreateField]), [true,'Usuario de prueba','tipo']);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-usuarios-create-portal]').count(), 0);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });

  await scenario('actual Clientes create releases detached forms and reopens with one owned host', async (page) => {
    await page.evaluate(async () => {
      const { createClientesCreateController } = await import('/src/views/clientes/clientes.create-controller.js');
      window.clientCreate = createClientesCreateController({ isAdmin:() => true, getRole:() => 'admin' });
      clientCreate.open(document.querySelector('#opener'));
      document.querySelector('[data-clientes-create-controller]').remove();
    });
    await page.waitForFunction(() => !clientCreate.getSnapshot().open && document.body.style.overflow === '');
    await page.evaluate(() => clientCreate.open(document.querySelector('#opener')));
    assert.equal(await page.locator('[data-clientes-create-controller]').count(), 1);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-clientes-create-controller]').count(), 0);
    await page.waitForFunction(() => document.activeElement.id === 'opener');
  });

  await scenario('actual Usuarios detail supports repeated open and close', async (page) => {
    await page.evaluate(async () => {
      document.querySelector('#opener').focus();
      window.usuarios = await import('/src/views/usuarios/usuarios.template.modal.js');
      usuarios.openUsuariosModal({ id: 'fixture-user', name: 'Fixture User', email: 'fixture@example.test' });
      usuarios.openUsuariosModal({ id: 'fixture-user', name: 'Fixture Updated', email: 'fixture@example.test' });
    });
    assert.equal(await page.locator('[data-usuarios-modal-panel="true"]').count(), 1);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-usuarios-modal-panel="true"]').count(), 0);
    await page.waitForFunction(() => document.activeElement.id === 'opener');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });
  await scenario('actual resend confirmation resolves once and preserves its parent', async (page) => {
    await page.evaluate(async () => {
      const parent = makePanel('parent');
      window.parentClosed = 0;
      modal.createModalLifecycle({ getPanel: () => parent, onEscape: () => parentClosed++ }).activate();
      parent.querySelector('button').id = 'resend-opener';
      parent.querySelector('button').focus();
      const module = await import('/src/views/facturas/index.js?modal-contract=1');
      window.resendResult = 'pending';
      module.testConfirmFacturaResend({ factura: { id: 'fixture-invoice' }, recipient: 'fixture@example.test' }).then((value) => { resendResult = value; });
    });
    assert.equal(await page.locator('[data-facturas-resend-confirm-dialog="true"]').count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => resendResult === false);
    assert.deepEqual(await page.evaluate(() => [parentClosed, document.body.style.overflow, document.activeElement.id]), [0, 'hidden', 'resend-opener']);
  });

  await scenario('actual Usuarios create shares interaction and releases on close', async (page) => {
    await page.evaluate(async () => {
      document.querySelector('#opener').focus();
      const module = await import('/src/views/usuarios/usuarios.template.create.js');
      await module.open();
    });
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'opener');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });

  await scenario('actual Clientes detail uses the shared lock and Escape', async (page) => {
    await page.evaluate(async () => {
      document.querySelector('#opener').focus();
      const module = await import('/src/views/clientes/clientes.template.modal.js');
      module.openClientesDetailModal({ id: 'fixture-client', nombreFiscal: 'Fixture Client', email: 'fixture@example.test' });
    });
    assert.equal(await page.locator('[data-clientes-modal-panel="true"]').count(), 1);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement.id === 'opener');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });
  // Google is always intercepted locally. No measurement leaves the test.
  await page.route('https://www.googletagmanager.com/**', (route) => route.fulfill({
    status: 200, contentType: 'text/javascript',
    body: 'window.__googleCommandsAtLoad = window.dataLayer.map((item) => Array.from(item));',
  }));

  await scenario('Google declares denied consent before configuration and the remote tag', async (page) => {
    await page.evaluate(async () => {
      localStorage.clear();
      history.replaceState({}, '', '/?gclid=fixture-campaign');
      await import('/src/analytics/google-tag.js');
    });
    await page.waitForFunction(() => window.__googleCommandsAtLoad);
    const before = await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('onion:public-support:accepted'));
      return __googleCommandsAtLoad;
    });
    assert.equal(before[0][0], 'consent');
    assert.equal(before[0][1], 'default');
    for (const key of ['analytics_storage', 'ad_storage', 'ad_user_data', 'ad_personalization']) assert.equal(before[0][2][key], 'denied');
    const jsIndex = before.findIndex((entry) => entry[0] === 'js');
    const configs = before.map((entry, index) => [entry, index]).filter(([entry]) => entry[0] === 'config');
    assert.equal(configs.length, 2);
    assert.ok(configs.every(([, index]) => index > jsIndex && jsIndex > 0));
    assert.deepEqual(await page.evaluate(() => dataLayer.filter((item) => item[0] === 'event').map((item) => item[1])), []);
    await page.evaluate(() => import('/src/analytics/google-tag.js?duplicate-import-test=1'));
    assert.equal(await page.locator('script[data-onion-google-tag]').count(), 1);
    assert.equal(await page.locator('[data-onion-google-consent-root]').count(), 1);
    assert.equal(await page.evaluate(() => dataLayer.filter((item) => item[0] === 'config').length), 2);
  });

  await scenario('Google excludes private routes and strips sensitive URL fields on public navigation', async (page) => {
    await page.evaluate(async () => {
      localStorage.clear();
      history.replaceState({}, '', '/cuenta?token=private-fixture');
      await import('/src/analytics/google-tag.js');
      OnionGoogleConsent.update({ analytics: true, ads: true });
      window.dispatchEvent(new CustomEvent('onion:public-support:accepted'));
    });
    assert.deepEqual(await page.evaluate(() => [window['ga-disable-G-RQ77310QBH'], dataLayer.filter((item) => ['config', 'event'].includes(item[0])).length, document.querySelectorAll('script[data-onion-google-tag]').length]), [true, 0, 0]);
    await page.evaluate(() => history.pushState({}, '', '/?utm_source=fixture&token=secret-fixture#private-fragment'));
    await page.waitForFunction(() => dataLayer.some((item) => item[0] === 'event' && item[1] === 'page_view'));
    const location = await page.evaluate(() => dataLayer.find((item) => item[0] === 'event' && item[1] === 'page_view')[2].page_location);
    const measured = new URL(location);
    assert.equal(measured.search, '?utm_source=fixture');
    assert.equal(measured.hash, '');
    const eventCount = await page.evaluate(() => dataLayer.filter((item) => item[0] === 'event').length);
    await page.evaluate(() => {
      history.pushState({}, '', '/incidencias?token=private-fixture');
      window.dispatchEvent(new CustomEvent('onion:public-support:accepted'));
    });
    await page.waitForFunction(() => !document.querySelector('[data-onion-google-consent-root]'));
    assert.equal(await page.evaluate(() => dataLayer.filter((item) => item[0] === 'event').length), eventCount);
    assert.equal(await page.evaluate(() => window['ga-disable-G-RQ77310QBH']), true);
    assert.ok(await page.evaluate(() => dataLayer.filter((item) => item[0] === 'consent').every((item) => item[2].ad_personalization === 'denied')));
  });

  await scenario('actual Google consent shares Tab, Escape and focus restoration with another dialog', async (page) => {
    await page.evaluate(async () => {
      localStorage.clear();
      await import('/src/analytics/google-tag.js');
      const parent = makePanel('privacy-parent', '<button id="privacy-opener">Preferencias</button>');
      window.privacyParentClosed = 0;
      window.privacyParentLife = modal.createModalLifecycle({ getPanel: () => parent, onEscape() { privacyParentClosed++; parent.remove(); privacyParentLife.deactivate(); } });
      privacyParentLife.activate();
      document.querySelector('#privacy-opener').focus();
      OnionGoogleConsent.open();
    });
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
    await page.evaluate(() => document.querySelector('[data-consent-action="save"]').focus());
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.dataset.consentAction), 'close');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [document.querySelector('[data-consent-dialog]').hidden, privacyParentClosed, document.body.style.overflow, document.activeElement.id]), [true, 0, 'hidden', 'privacy-opener']);
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(() => [privacyParentClosed, document.body.style.overflow]), [1, '']);
  });
  console.log(`Modal lifecycle contract: PASS (${count} browser scenarios)`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
