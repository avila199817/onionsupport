import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { renderPublicLegalFooter } from '../../src/core/public-legal.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next browser */ }
}
assert.ok(executablePath, 'Set CHROME_BIN to a local Chrome/Chromium executable');
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (['/', '/soporte-informatico', '/login', '/password-request', '/password-reset', '/activate-account/opaque-fixture'].includes(url.pathname)) {
    return response.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'",
    }).end(`<!doctype html><html lang="es"><head><title>Consent layout</title><link rel="stylesheet" href="/fixture.css"><link rel="stylesheet" href="/src/css/views/public/legal-footer.css">${url.searchParams.has('preloaded') ? '<link rel="stylesheet" href="/src/analytics/google-consent.css" data-onion-google-consent-style="2">' : ''}</head><body><main><button id="opener">Preferencias</button></main>${renderPublicLegalFooter()}<script type="module" src="/src/analytics/google-tag.js"></script></body></html>`);
  }
  if (url.pathname === '/fixture.css') {
    return response.writeHead(200, { 'Content-Type': 'text/css' }).end('html,body{margin:0}main{min-height:100vh}[hidden]{display:none!important}');
  }
  try {
    const target = resolve(root, `.${url.pathname}`);
    if (!target.startsWith(root) || !/\.(?:js|css)$/.test(url.pathname)) throw new Error('Invalid path');
    response.writeHead(200, { 'Content-Type': extname(target) === '.css' ? 'text/css' : 'text/javascript' }).end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
let count = 0;
try {
  async function scenario(name, options, run) {
    const page = await browser.newPage({ viewport: options.viewport || { width: 412, height: 823 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    let release;
    const held = new Promise((done) => { release = done; });
    if (!options.preloaded) await page.route('**/src/analytics/google-consent.css', async (route) => {
      await held;
      if (options.fail) await route.abort();
      else await route.continue();
    });
    await page.addInitScript(() => {
      window.__consentCls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__consentCls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    try {
      await page.goto(origin + (options.path || '/') + (options.preloaded ? '?preloaded=1' : ''), { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-onion-google-consent-root]', { state: 'attached' });
      if (!options.preloaded) {
        await page.waitForTimeout(120); // Allow the unstyled state to cross paint frames.
        assert.equal(await page.locator('[data-onion-google-consent-root]').isVisible(), false, 'pending CSS must not paint the consent root');
      }
      await run(page, release);
      assert.deepEqual(errors, [], 'consent must not throw');
      count++;
      console.log(`PASS consent layout ${name}`);
    } finally { release(); await page.close(); }
  }
  async function ready(page, release) {
    release();
    await page.waitForSelector('[data-consent-banner]', { state: 'visible' });
    await page.waitForTimeout(120);
  }
  for (const viewport of [{ width: 412, height: 823 }, { width: 1350, height: 940 }]) {
    await scenario(`delayed CSS produces no CLS at ${viewport.width}px`, { viewport }, async (page, release) => {
      await ready(page, release);
      assert.equal(await page.evaluate(() => __consentCls), 0);
      assert.equal(await page.getByRole('button', { name: 'Rechazar', exact: true }).isVisible(), true);
    });
  }
  await scenario('early settings opens only when styled and restores focus', {}, async (page, release) => {
    await page.evaluate(() => { document.querySelector('#opener').focus(); OnionGoogleConsent.open(); });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    release();
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'opener');
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  });
  await scenario('route departure cancels pending settings and public return reuses CSS', {}, async (page, release) => {
    await page.evaluate(() => { OnionGoogleConsent.open(); history.pushState({}, '', '/cuenta'); });
    await page.waitForSelector('[data-onion-google-consent-root]', { state: 'detached' });
    await page.evaluate(() => OnionGoogleConsent.open());
    assert.equal(await page.locator('[data-onion-google-consent-root]').count(), 0, 'private routes must not remount settings');
    release();
    await page.waitForFunction(() => document.querySelector('link[data-onion-google-consent-style]').sheet);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.onionConsentDialog), undefined);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
    await page.evaluate(() => history.pushState({}, '', '/'));
    await page.waitForSelector('[data-consent-banner]', { state: 'visible' });
    assert.equal(await page.locator('link[data-onion-google-consent-style]').count(), 1);
    await page.getByRole('button', { name: 'Configurar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
  });
  await scenario('failed CSS leaves usable privacy choices and settings', { fail: true }, async (page, release) => {
    await ready(page, release);
    await page.getByRole('button', { name: 'Configurar', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
    await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
    assert.equal(await page.evaluate(() => OnionGoogleConsent.get().decided), true);
    await page.getByRole('button', { name: 'Cambiar preferencias de medición', exact: true }).click();
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
  });
  await scenario('already loaded CSS is reused', { preloaded: true }, async (page) => {
    await page.waitForSelector('[data-consent-banner]', { state: 'visible' });
    assert.equal(await page.locator('link[data-onion-google-consent-style]').count(), 1);
  });
  await scenario('direct service page waits for the same consent stylesheet', { path: '/soporte-informatico' }, async (page, release) => {
    await ready(page, release);
    assert.equal(await page.evaluate(() => __consentCls), 0);
    await page.getByRole('button', { name: 'Rechazar', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => OnionGoogleConsent.get()), { decided: true, analytics: false, ads: false, adPersonalization: false });
    await page.locator('[data-public-cookie-settings]').click();
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
  });

  for (const path of ['/login', '/password-request', '/password-reset', '/activate-account/opaque-fixture']) {
    await scenario(`footer preferences on ${path} do not enable measurement`, { path }, async (page, release) => {
      release();
      await page.waitForFunction(() => document.querySelector('link[data-onion-google-consent-style]').sheet);
      assert.equal(await page.locator('[data-consent-banner]').isVisible(), false, 'account pages do not show a marketing banner');
      assert.equal(await page.locator('.onion-google-consent__preferences').isVisible(), false, 'account pages use the footer control');
      await page.locator('[data-public-cookie-settings]').click();
      await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
      await page.locator('[data-consent-option="analytics"]').check();
      await page.locator('[data-consent-option="ads"]').check();
      await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => OnionGoogleConsent.get()), { decided: true, analytics: true, ads: true, adPersonalization: false });
      const measurement = await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('onion:public-support:accepted'));
        return {
          disabled: window['ga-disable-G-RQ77310QBH'],
          events: dataLayer.filter((entry) => entry[0] === 'event').length,
          configs: dataLayer.filter((entry) => entry[0] === 'config').length,
          consentUpdates: dataLayer.filter((entry) => entry[0] === 'consent' && entry[1] === 'update').length,
          scripts: document.querySelectorAll('script[data-onion-google-tag]').length,
        };
      });
      assert.deepEqual(measurement, { disabled: true, events: 0, configs: 0, consentUpdates: 0, scripts: 0 }, 'changing consent must not contact Google from account pages or leak token URLs');
      await page.locator('[data-public-cookie-settings]').click();
      await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(() => document.activeElement.hasAttribute('data-public-cookie-settings')), true, 'closing preferences restores focus to the footer');
    });
  }

  await scenario('an account choice reaches Google only after returning to marketing', { preloaded: true }, async (page) => {
    await page.waitForSelector('[data-consent-banner]', { state: 'visible' });
    await page.getByRole('button', { name: 'Aceptar medición', exact: true }).click();
    const before = await page.evaluate(() => ({
      events: dataLayer.filter((entry) => entry[0] === 'event').length,
      updates: dataLayer.filter((entry) => entry[0] === 'consent' && entry[1] === 'update').length,
    }));
    await page.evaluate(() => history.pushState({}, '', '/password-reset?token=private-fixture'));
    await page.waitForFunction(() => window['ga-disable-G-RQ77310QBH'] === true);
    await page.locator('[data-public-cookie-settings]').click();
    await page.waitForFunction(() => document.activeElement.matches('[data-consent-dialog]'));
    await page.locator('[data-consent-option="ads"]').uncheck();
    await page.getByRole('button', { name: 'Guardar preferencias', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => ({
      events: dataLayer.filter((entry) => entry[0] === 'event').length,
      updates: dataLayer.filter((entry) => entry[0] === 'consent' && entry[1] === 'update').length,
    })), before, 'no event or consent ping may be triggered on the token route');
    const boundary = await page.evaluate(() => dataLayer.length);
    await page.evaluate(() => history.pushState({}, '', '/soporte-informatico'));
    await page.waitForFunction((size) => dataLayer.slice(size).some((entry) => entry[0] === 'event'), boundary);
    const commands = await page.evaluate((size) => dataLayer.slice(size).map((entry) => Array.from(entry)), boundary);
    const updateIndex = commands.findIndex((entry) => entry[0] === 'consent' && entry[1] === 'update');
    const pageViewIndex = commands.findIndex((entry) => entry[0] === 'event' && entry[1] === 'page_view');
    assert.ok(updateIndex >= 0 && pageViewIndex > updateIndex, 'the saved choice must be applied before the next measured page');
    assert.equal(commands[updateIndex][2].ad_storage, 'denied');
    assert.equal(commands[updateIndex][2].analytics_storage, 'granted');
    assert.equal(JSON.stringify(commands).includes('private-fixture'), false);
  });

  await scenario('footer exposes consistent identity and accessible legal sections', { path: '/login', preloaded: true }, async (page) => {
    assert.equal(await page.locator('footer.public-legal-footer').count(), 1);
    for (const id of ['public-legal-notice', 'public-privacy', 'public-cookies']) {
      const details = page.locator(`details#${id}`);
      assert.equal(await details.count(), 1);
      await details.locator('summary').click();
      assert.equal(await details.getAttribute('open'), '');
      assert.equal(await details.locator('.public-legal-footer__content').isVisible(), true);
      await details.locator('summary').click();
    }
    const identity = await page.locator('.public-legal-footer__identity').innerText();
    for (const value of ['Cristian Ávila Luque', '20568568J', 'C/ Rafael de Casanova, 54, 1.º 3.ª', '08295 Sant Vicenç de Castellet (Barcelona)']) assert.ok(identity.includes(value), `verified identity includes ${value}`);
    assert.equal(await page.locator('.public-legal-footer__overview a[href="mailto:soporte@onionsupport.com"]').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'legal footer must fit a narrow viewport');
  });
  console.log(`Consent layout browser: PASS (${count} scenarios)`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
