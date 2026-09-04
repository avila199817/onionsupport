import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = fileURLToPath(new URL('../../', import.meta.url));
const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch { /* next browser */ }
}
assert.ok(executablePath, 'Set CHROME_BIN to a local Chrome/Chromium executable');
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/' || url.pathname === '/soporte-informatico') {
    return response.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'",
    }).end(`<!doctype html><html lang="es"><head><title>Consent layout</title><link rel="stylesheet" href="/fixture.css">${url.searchParams.has('preloaded') ? '<link rel="stylesheet" href="/src/analytics/google-consent.css" data-onion-google-consent-style="2">' : ''}</head><body><main><button id="opener">Preferencias</button></main><script type="module" src="/src/analytics/google-tag.js"></script></body></html>`);
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
    await page.evaluate(() => { OnionGoogleConsent.open(); history.pushState({}, '', '/login'); });
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
  });
  console.log(`Consent layout browser: PASS (${count} scenarios)`);
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
