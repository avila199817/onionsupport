// Same-origin browser harness. Only fixture data/session/API boundaries are
// synthetic; every owner, list, template, dispatcher and lifecycle is real.
const frame = document.querySelector('#app-fixture');
const status = document.querySelector('#suite-status');
const results = document.querySelector('#suite-results');
const run = document.querySelector('#run-suite');
const types = ['incidencia', 'factura', 'cliente', 'usuario'];
const config = {
  incidencia:{ panel:"[data-incidencias-modal-panel='true']:not([data-clientes-modal-panel='true'])", close:"[data-detail-action='detail-close']", backdrop:"[data-incidencias-modal-overlay='true']", retry:"[data-detail-action='detail-retry']", row:"[data-ticket-row='true']" },
  factura:{ panel:"[data-facturas-detail-modal='true']", close:"[data-facturas-action='close-factura-detail']", backdrop:"[data-facturas-detail-overlay='true']", retry:"[data-facturas-action='retry-factura-detail']", row:"[data-facturas-row='true']" },
  cliente:{ panel:"[data-clientes-modal-panel='true']", close:"[data-clientes-modal-root='true'] [data-detail-action='detail-close']", backdrop:"[data-clientes-modal-overlay='true']", retry:"[data-entity-overlay-action='retry']", row:"[data-cliente-id][data-clientes-action]" },
  usuario:{ panel:"[data-usuarios-modal-panel='true']", close:"[data-usuarios-modal-action='close']", backdrop:"[data-usuarios-modal-overlay='true']", retry:"[data-entity-overlay-action='retry']", row:"[data-user-row='true']" },
};
const panels = Object.values(config).map(item=>item.panel).join(',');
const anyPanel = panels + ",[data-entity-overlay-panel='true']";
const ownerRoot = panel => panel?.closest("[data-facturas-detail-root='true'],[data-incidencias-modal-root='true'],[data-clientes-modal-root='true'],[data-usuarios-modal-root='true']");
let sequence = 0;
let passed = 0;
let failed = 0;
const app = () => frame.contentWindow;
const doc = () => frame.contentDocument;
const node = selector => doc().querySelector(selector);
const check = (condition, message) => { if (!condition) throw new Error(message); };
const equal = (actual, expected, label) => check(Object.is(actual, expected), `${label}: expected ${expected}, got ${actual}`);
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
async function wait(predicate, label = 'condition', timeout = 7000) {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error(`Timeout: ${label}; ${JSON.stringify({ requests:app().__requests?.map(({type,id})=>({type,id})), errors:app().__errors, forbidden:app().__forbiddenCalls?.map(({name})=>name), text:doc()?.body.innerText.slice(-700) })}`);
    await tick();
  }
}
async function load(width = 1280) {
  frame.style.width = width + 'px';
  frame.src = '/@fixture?case=' + (++sequence);
  await wait(() => app().__fixtureReady === true && app().location.search === '?case=' + sequence, 'fixture ready');
  // Keep the synthetic Core boundary aligned with the runtime session-scope capability.
  const { AppCore } = await app().eval('import("/src/core/index.js")');
  AppCore.getSessionEpoch = () => 0;
  const main = node('#main-content');
  main.scrollTop = 260;
  app().__initialScrollTop = main.scrollTop;
}
function invariant({ route = false, closed = false, focus = '' } = {}) {
  equal(app().__forbiddenCalls.length, 0, 'no unapproved HTTP/navigation/write');
  equal(app().__errors.length, 0, 'no browser/unhandled errors: ' + app().__errors.join('; '));
  check(app().__maxPanels <= 1, 'at most one visible modal');
  equal(doc().querySelectorAll(panels).length <= 1, true, 'one mounted owner panel');
  if (!route) {
    equal(node('#view-container'), app().__homeHost, 'same Home host');
    equal(node('#fixture-home'), app().__homeNode, 'same Home section');
    equal(app().__homeHost.innerHTML, app().__homeHTML, 'Home markup unchanged');
    equal(app().location.pathname, '/@fixture', 'Home URL unchanged');
    equal(node('#main-content').scrollTop, app().__initialScrollTop, 'Home scroll preserved');
    equal(app().__listRequests.length, 0, 'Home never loads a list');
  }
  equal(app().history.length, app().__historyLength, 'history length unchanged');
  if (closed) {
    equal(doc().querySelectorAll(anyPanel).length, 0, 'all modal panels removed');
    equal(doc().body.style.overflow, '', 'body scroll restored');
  }
  if (focus) equal(doc().activeElement?.id, focus, 'opener focus restored');
}
async function open(type, count = 1) {
  node('#open-' + type).click();
  await wait(() => app().__requests.length >= count, 'detail request ' + type);
  equal(app().__requests.length, count, 'owner API calls');
  await wait(() => node(anyPanel), 'loading or owner shell');
  return node(config[type].panel);
}
function settle(index, failure = false) {
  const request = app().__requests[index];
  check(request, 'request exists: ' + index);
  if (failure) {
    const error = new (app().Error)('Error temporal al consultar el detalle.');
    error.status = 503;
    request.reject(error);
  } else request.resolve({ ...app().__fixtureData[request.type], id:request.id });
}
async function resolved(type, index = 0) {
  const original = node(config[type].panel);
  const originalRoot = ownerRoot(original);
  settle(index);
  await wait(() => node(config[type].panel) && !node(config[type].retry), 'resolved owner panel ' + type);
  await Promise.all(app().__operations);
  await tick();
  if (original) equal(node(config[type].panel), original, 'loading -> detail keeps physical panel');
  if (originalRoot) equal(ownerRoot(node(config[type].panel)), originalRoot, 'loading -> detail keeps physical root');
  return node(config[type].panel);
}
async function close(type, method = 'escape', options = {}) {
  if (method === 'escape') doc().dispatchEvent(new (app().KeyboardEvent)('keydown', { key:'Escape', bubbles:true, cancelable:true }));
  else node(config[type][method]).click();
  await wait(() => !node(anyPanel), 'closed ' + type);
  invariant({ ...options, closed:true });
}
async function scenario(name, task) {
  status.textContent = `Ejecutando: ${name}`;
  const item = document.createElement('li');
  item.textContent = name;
  results.append(item);
  try {
    await task();
    passed++;
    item.className = 'pass';
    item.textContent = 'PASS ' + name;
  } catch (error) {
    failed++;
    item.className = 'fail';
    item.textContent = 'FAIL ' + name + ': ' + error.message;
  }
  console.log('OWNER MATRIX ' + item.textContent);
}
run.addEventListener('click', async () => {
  run.disabled = true;
  results.replaceChildren();
  passed = failed = 0;
  await scenario('Role policy applies before owner import/API', async () => {
    await load();
    app().__setFixtureRole('user');
    for (const type of ['cliente', 'usuario']) {
      equal(app().__overlay.canOpen(type, app().__fixtureData[type].id), false, 'route policy ' + type);
      equal(await app().__overlay.open({ type, id:app().__fixtureData[type].id }), false, 'deny ' + type);
    }
    equal(app().__requests.length, 0, 'denied requests');
    invariant({ closed:true });
  });
  await scenario('Runtime destroy rejects synchronous reopen from a closed subscriber', async () => {
    await load(); await open('incidencia'); await resolved('incidencia');
    app().__overlay.subscribe(event => {
      if (event.phase === 'closed') app().__operations.push(app().__overlay.open({ type:'factura', id:app().__fixtureData.factura.id, opener:node('#open-factura') }));
    });
    app().__overlay.destroy();
    await Promise.all(app().__operations);
    await tick();
    equal(app().__overlay.getSnapshot().open, false, 'destroyed runtime has no owner');
    equal(app().__overlay.getSnapshot().initialized, false, 'destroyed runtime stays uninitialized');
    equal(app().__requests.length, 1, 'destroy subscriber cannot request new detail');
    invariant({ closed:true });
  });
  for (const type of types) {
    for (const pending of [true, false]) await scenario(`${type}: authorization invalidation tears down ${pending ? 'pending' : 'painted'} owner and rejects stale results`, async () => {
      await load(); await open(type);
      if (!pending) await resolved(type);
      if (!pending && type === 'incidencia') {
        const comment = node("[data-detail-field='comment']");
        comment.value = 'Borrador de la sesión anterior';
        comment.dispatchEvent(new (app().Event)('input', { bubbles:true }));
      }
      app().__overlay.subscribe(event => {
        if (event.phase === 'closed') app().__operations.push(app().__overlay.open({ type, id:app().__fixtureData[type].id, opener:node('#open-' + type) }));
      });
      app().__overlay.onSessionInvalidated();
      if (pending) settle(0);
      await Promise.all(app().__operations);
      await tick();
      equal(app().__overlay.getSnapshot().open, false, 'old authorization scope owns no detail');
      equal(app().__requests.length, 1, 'closed subscriber cannot reopen while invalidating');
      invariant({ closed:true });
    });
  }
  for (const type of types) {
    await scenario(`${type}: immediately resolved API still mounts exactly one owner panel`, async () => {
      await load();
      app().__autoResolve = { [type]:true };
      node('#open-' + type).click();
      await wait(() => node(config[type].panel), 'immediate owner shell');
      await Promise.all(app().__operations);
      await tick();
      equal(app().__requests.length, 1, 'one immediate owner request');
      equal(app().__ownerMounts.length, 1, 'one immediate shell mount');
      invariant();
      await close(type);
    });
    await scenario(`${type}: Home double click has one factory, one request and one physical panel`, async () => {
      await load();
      node('#open-' + type).click();
      node('#open-' + type).click();
      await wait(() => app().__requests.length > 0, 'pending owner');
      equal(app().__requests.length, 1, 'one request before response');
      const shell = node(config[type].panel);
      await resolved(type);
      if (shell) equal(node(config[type].panel), shell, 'same physical panel');
      equal(app().__requests.length, 1, 'one request after decorators');
      equal(app().__controllerCalls.filter(call => /create.*DetailController/.test(call.name)).length, 1, 'one owner factory');
      equal(app().__ownerMounts.length, 1, 'one shell mount, including transient nodes');
      invariant();
      await close(type, 'close', { focus:'open-' + type });
    });
    await scenario(`${type}: Escape during pending GET rejects late response`, async () => {
      await load(); await open(type);
      await close(type);
      settle(0);
      await Promise.all(app().__operations);
      await tick();
      invariant({ closed:true, focus:'open-' + type });
      equal(app().__requests.length, 1, 'pending close no second request');
    });
    await scenario(`${type}: releaseOrigin aborts pending owner and late response cannot reopen`, async () => {
      await load(); await open(type);
      app().__overlay.releaseOrigin(app().__homeNode);
      await wait(() => !node(anyPanel), 'origin disposal');
      settle(0);
      await Promise.all(app().__operations);
      await tick();
      invariant({ closed:true });
    });
    await scenario(`${type}: external AbortSignal removes the pending session immediately`, async () => {
      await load();
      const controller = new (app().AbortController)();
      app().__operations.push(app().__overlay.open({ type, id:app().__fixtureData[type].id, opener:node('#open-' + type), signal:controller.signal }));
      await wait(() => app().__requests.length === 1, 'signal-owned detail request');
      controller.abort();
      await wait(() => !node(anyPanel), 'external abort removes shell');
      settle(0);
      await Promise.all(app().__operations);
      await tick();
      invariant({ closed:true });
    });
    await scenario(`${type}: failed request retries in-place and keeps its mounted shell`, async () => {
      await load(); await open(type);
      const shell = node(config[type].panel);
      settle(0, true);
      await wait(() => node(config[type].retry), 'retry control');
      if (shell) equal(node(config[type].panel), shell, 'failure keeps owner shell');
      node(config[type].retry).click();
      await wait(() => app().__requests.length >= 2, 'retry request');
      equal(app().__requests.length, 2, 'single retry request');
      await resolved(type, 1);
      if (shell) equal(node(config[type].panel), shell, 'retry keeps owner shell');
      invariant();
      await close(type, 'backdrop', { focus:'open-' + type });
    });
    await scenario(`${type}: real list row enters the same factory without changing route/list markup`, async () => {
      await load();
      await app().__mountRoute(type);
      await wait(() => node('#fixture-route ' + config[type].row), 'real list row ' + type);
      await tick();
      const host = app().__routeNode;
      const markup = host.innerHTML;
      const pathname = app().location.pathname;
      const row = node('#fixture-route ' + config[type].row);
      row.click(); row.click();
      await wait(() => app().__requests.length > 0, 'row detail request');
      equal(app().__requests.length, 1, 'row one owner API request');
      await resolved(type);
      equal(app().__controllerCalls.filter(call => /create.*DetailController/.test(call.name)).length, 1, 'list uses same factory');
      equal(app().__ownerMounts.length, 1, 'list opens one physical shell');
      equal(host.innerHTML, markup, 'opening detail never rerenders list');
      equal(app().location.pathname, pathname, 'route URL preserved');
      invariant({ route:true });
      app().__overlay.releaseOrigin(host);
      app().__routeController?.destroy?.();
      await wait(() => !node(anyPanel), 'real route disposal closes owner');
      invariant({ route:true, closed:true });
    });
  }
  await scenario('User refresh shares one pending GET and preserves its physical panel', async () => {
    await load(); await open('usuario'); await resolved('usuario');
    const panel = node(config.usuario.panel);
    const refresh = node("[data-usuarios-modal-action='refresh']");
    check(refresh, 'user refresh action exists');
    refresh.click(); refresh.click();
    await wait(() => app().__requests.length > 1, 'user refresh request');
    equal(app().__requests.length, 2, 'repeated refresh requests deduplicate');
    equal(node(config.usuario.panel), panel, 'refresh loading keeps panel');
    await resolved('usuario', 1);
    equal(node(config.usuario.panel), panel, 'refresh response keeps panel');
    equal(app().__ownerMounts.length, 1, 'refresh never mounts another panel');
    await close('usuario');
  });
  await scenario('Incident duplicate refresh shares GET, preserves panel and keeps the pending draft', async () => {
    await load(); await open('incidencia'); await resolved('incidencia');
    const panel = node(config.incidencia.panel);
    const comment = node("[data-detail-field='comment']");
    comment.value = 'Borrador durante actualización';
    comment.dispatchEvent(new (app().Event)('input', { bubbles:true }));
    const controller = app().__activeControllers.incidencia;
    check(typeof controller?.refreshDetail === 'function', 'owner refreshDetail exists');
    const requests = [controller.refreshDetail(), controller.refreshDetail()];
    await wait(() => app().__requests.length > 1, 'incident refresh request');
    equal(app().__requests.length, 2, 'duplicate refresh makes one GET');
    settle(1);
    await Promise.all(requests);
    await tick();
    equal(node(config.incidencia.panel), panel, 'refresh keeps physical panel');
    equal(node("[data-detail-field='comment']").value, 'Borrador durante actualización', 'refresh keeps draft');
    equal(node("[data-detail-field='comment']").disabled, false, 'composer enabled after refresh');
    equal(app().__ownerMounts.length, 1, 'refresh mounts no second shell');
    invariant();
    node(config.incidencia.close).click();
    node("[data-detail-action='detail-discard-close-confirm']").click();
    await wait(() => !node(anyPanel), 'discard closes refreshed owner');
    invariant({ closed:true });
  });
  for (const [first, second] of [['incidencia','factura'], ['factura','cliente'], ['cliente','usuario'], ['usuario','incidencia']]) {
    await scenario(`${first} -> ${second}: pending replacement rejects old response and keeps one owner`, async () => {
      await load(); await open(first);
      app().__operations.push(app().__overlay.open({ type:second, id:app().__fixtureData[second].id, opener:node('#open-' + second) }));
      await wait(() => app().__requests.length >= 2, 'replacement request');
      settle(0);
      await resolved(second, 1);
      equal(node(config[first].panel), null, 'previous panel disposed');
      invariant();
      await close(second);
    });
  }
  await scenario('Invoice relationship opens incident over the same Home and restores invoice opener', async () => {
    await load(); await open('factura'); await resolved('factura');
    node("[data-facturas-action='open-incidencia']").click();
    await wait(() => app().__requests.length === 2, 'relationship detail');
    await resolved('incidencia', 1);
    equal(node(config.factura.panel), null, 'invoice owner disposed');
    invariant();
    await close('incidencia', 'escape', { focus:'open-factura' });
  });
  await scenario('Incident draft refuses replacement until discard is confirmed', async () => {
    await load(); await open('incidencia'); await resolved('incidencia');
    const comment = node("[data-detail-field='comment']");
    comment.value = 'Borrador que debe conservarse';
    comment.dispatchEvent(new (app().Event)('input', { bubbles:true }));
    const opened = await app().__overlay.open({ type:'factura', id:app().__fixtureData.factura.id, opener:node('#open-factura') });
    equal(opened, false, 'draft rejects replacement');
    equal(app().__requests.length, 1, 'blocked replacement never requests invoice');
    await wait(() => node("[data-detail-action='detail-discard-close-cancel']"), 'discard confirmation');
    node("[data-detail-action='detail-discard-close-cancel']").click();
    equal(node("[data-detail-field='comment']").value, 'Borrador que debe conservarse', 'draft preserved');
    node(config.incidencia.close).click();
    node("[data-detail-action='detail-discard-close-confirm']").click();
    await wait(() => !node(anyPanel), 'discard closes owner');
    invariant({ closed:true });
  });
  await scenario('Failed staged route leaves current incident panel physically intact and interactive', async () => {
    await load(); await open('incidencia'); await resolved('incidencia');
    const previous = node(config.incidencia.panel);
    const ownerHost = previous.closest('[data-incidencias-modal-owner-id]');
    const module = await app().__importIncidencias();
    const staged = doc().createElement('section');
    Object.assign(staged.dataset, { routeHost:'true', routeHostState:'preparing', viewKey:'incidencias' });
    staged.addEventListener = () => { throw new Error('Fixture staged route mount failure'); };
    let failed = false;
    try { await module.IncidenciasView(staged); } catch { failed = true; }
    equal(failed, true, 'staged mount failed');
    equal(node(config.incidencia.panel), previous, 'current panel preserved');
    equal(ownerHost.hidden, false, 'owner still visible');
    equal(ownerHost.hasAttribute('inert'), false, 'owner still interactive');
    invariant();
    await close('incidencia', 'escape', { focus:'open-incidencia' });
  });
  for (const type of types) await scenario(`${type}: mobile viewport keeps panel inside screen`, async () => {
    await load(390); await open(type); await resolved(type);
    const bounds = node(config[type].panel).getBoundingClientRect();
    check(bounds.x >= -1 && bounds.y >= -1 && bounds.right <= 391 && bounds.bottom <= 901, 'panel inside 390 x 900 viewport: ' + JSON.stringify(bounds.toJSON()));
    await close(type);
  });
  status.textContent = `${failed ? 'FAIL' : 'PASS'}: ${passed} correctas, ${failed} fallidas`;
  status.dataset.complete = 'true';
  status.dataset.failed = String(failed);
  run.disabled = false;
});
