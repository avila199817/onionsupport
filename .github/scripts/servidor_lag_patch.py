from pathlib import Path
import re


def replace_once(path, old, new):
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one anchor, found {count}: {old!r}")
    p.write_text(text.replace(old, new, 1), encoding="utf-8")


INDEX = "src/views/server/index.js"
BASE = "src/views/server/server.api.base.js"
API = "src/views/server/server.api.js"
PACKAGE = "package.json"

# Version: this is a lifecycle/performance contract change, not visual redesign.
replace_once(
    INDEX,
    '  "servidor.index.api-boundary.v2.health-internal";',
    '  "servidor.index.api-boundary.v3.nonblocking-observability";',
)

# The active view controller must own the request it starts.
replace_once(
    INDEX,
    "    loadSequence: 0,\n    loadTask: null,\n\n    clickHandler: null,",
    "    loadSequence: 0,\n    loadTask: null,\n    loadAbortController: null,\n\n    clickHandler: null,",
)

abort_helpers = '''  function abortLoad(
    reason = "server-load-aborted"
  ) {
    const requestController =
      state.loadAbortController;

    state.loadAbortController =
      null;

    if (!requestController) {
      return false;
    }

    try {
      if (
        requestController.signal
          ?.aborted !== true
      ) {
        requestController.abort(
          reason
        );
      }
    } catch {
      try {
        requestController.abort();
      } catch {
        // noop
      }
    }

    return true;
  }

  function createLoadSignal() {
    abortLoad(
      "server-load-replaced"
    );

    if (
      typeof AbortController ===
      "undefined"
    ) {
      return null;
    }

    const requestController =
      new AbortController();

    state.loadAbortController =
      requestController;

    return requestController.signal;
  }

'''

replace_once(
    INDEX,
    "  async function load({\n",
    abort_helpers + "  async function load({\n",
)

# On initial route entry, mount has already painted cache/loading. Do not rebuild
# the whole Servidor DOM a second time before the first network await.
replace_once(
    INDEX,
    '''  async function load({
    silent = false,
    force = false,
  } = {}) {''',
    '''  async function load({
    silent = false,
    force = false,
    paintPending = true,
  } = {}) {''',
)

replace_once(
    INDEX,
    '''    const hadSnapshot =
      Boolean(
        state.snapshot
          ?.checkedAt
      );

    state.error = "";''',
    '''    const hadSnapshot =
      Boolean(
        state.snapshot
          ?.checkedAt
      );

    const requestSignal =
      createLoadSignal();

    state.error = "";''',
)

replace_once(
    INDEX,
    '''    paint({
      mode:
        state.loading
          ? "loading"
          : "auto",
    });''',
    '''    if (paintPending) {
      paint({
        mode:
          state.loading
            ? "loading"
            : "auto",
      });
    }''',
)

# Both health and Azure cost requests inherit this controller-owned signal.
replace_once(
    INDEX,
    '''        const snapshot =
          force
            ? await refreshServerSnapshotApi({
                source:
                  `${SERVIDOR_INDEX_SOURCE}.refresh`,
              })
            : await loadServerSnapshotApi({
                source:
                  `${SERVIDOR_INDEX_SOURCE}.load`,
              });''',
    '''        const snapshot =
          force
            ? await refreshServerSnapshotApi({
                source:
                  `${SERVIDOR_INDEX_SOURCE}.refresh`,
                signal:
                  requestSignal,
              })
            : await loadServerSnapshotApi({
                source:
                  `${SERVIDOR_INDEX_SOURCE}.load`,
                signal:
                  requestSignal,
              });''',
)

replace_once(
    INDEX,
    '''        if (
          state.loadTask ===
          task
        ) {
          state.loadTask =
            null;
        }''',
    '''        if (
          state.loadAbortController
            ?.signal ===
          requestSignal
        ) {
          state.loadAbortController =
            null;
        }

        if (
          state.loadTask ===
          task
        ) {
          state.loadTask =
            null;
        }''',
)

# Critical path: Router waits for route.render(). Servidor must therefore return
# its cleanup owner immediately after its first paint, never after observability I/O.
replace_once(
    INDEX,
    '''    await load({
      force: false,
      silent:
        Boolean(
          cached
        ),
    });

    return getSnapshot();''',
    '''    void load({
      force: false,
      silent:
        Boolean(
          cached
        ),
      paintPending: false,
    });

    return controller;''',
)

replace_once(
    INDEX,
    '''    state.loadSequence += 1;

    stopLive({''',
    '''    state.loadSequence += 1;

    abortLoad(
      "server-view-destroyed"
    );

    stopLive({''',
)

# Core Http already supports options.signal. Server's health boundary was
# silently dropping it in both GET and generic request fallbacks.
base = Path(BASE).read_text(encoding="utf-8")
base_anchor = '''          source:
            cleanText(
              options.source,
              "views.server.api"
            ),'''
base_count = base.count(base_anchor)
if base_count != 2:
    raise SystemExit(f"{BASE}: expected 2 HTTP source anchors, found {base_count}")
base = base.replace(
    base_anchor,
    base_anchor + '''

          signal:
            options.signal ||
            null,''',
)
Path(BASE).write_text(base, encoding="utf-8")

# Same for /health/costs, which can be the slowest request on a cold cache.
api = Path(API).read_text(encoding="utf-8")
cost_anchor = '      source: safeText(options.source, "views.server.api.costs"),'
cost_count = api.count(cost_anchor)
if cost_count != 2:
    raise SystemExit(f"{API}: expected 2 cost source anchors, found {cost_count}")
api = api.replace(
    cost_anchor,
    cost_anchor + '\n      signal: options.signal || null,',
)
Path(API).write_text(api, encoding="utf-8")

# Permanent regression guard. It protects both the route critical path and the
# request lifecycle so the lag cannot quietly return later.
contract = '''import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, apiBase, api] = await Promise.all([
  readFile("src/views/server/index.js", "utf8"),
  readFile("src/views/server/server.api.base.js", "utf8"),
  readFile("src/views/server/server.api.js", "utf8"),
]);

const mountStart = index.indexOf("  async function mount(");
const destroyStart = index.indexOf("  async function destroy(");
assert.ok(mountStart >= 0 && destroyStart > mountStart, "Servidor mount/destroy boundaries must exist");
const mount = index.slice(mountStart, destroyStart);

assert.match(index, /servidor\.index\.api-boundary\.v3\.nonblocking-observability/);
assert.match(mount, /void load\(\{/);
assert.match(mount, /paintPending:\s*false/);
assert.match(mount, /return controller;/);
assert.doesNotMatch(mount, /await load\(\{/);

assert.match(index, /loadAbortController:\s*null/);
assert.match(index, /function abortLoad\(/);
assert.match(index, /server-view-destroyed/);
assert.match(index, /signal:\s*requestSignal/);

const baseSignalCount = (apiBase.match(/signal:\s*\n\s*options\.signal\s*\|\|\s*\n\s*null/g) || []).length;
assert.equal(baseSignalCount, 2, "Health GET/request must both forward the abort signal");

const costSignalCount = (api.match(/signal:\s*options\.signal\s*\|\|\s*null/g) || []).length;
assert.equal(costSignalCount, 2, "Cost GET/request must both forward the abort signal");

assert.match(api, /const healthPromise = Base\.loadServerSnapshot\(opts\);/);
assert.match(api, /const costsPromise = resolveCostsForDashboard\(opts\);/);

console.log("Servidor navigation performance contract: PASS · immediate route commit · single entry paint · abortable health/cost I/O");
'''
Path(".github/scripts/servidor_navigation_performance_contract.mjs").write_text(contract, encoding="utf-8")

replace_once(
    PACKAGE,
    'node .github/scripts/whatsapp_route_contract.mjs && python3 .github/scripts/repo_integrity.py',
    'node .github/scripts/whatsapp_route_contract.mjs && node .github/scripts/servidor_navigation_performance_contract.mjs && python3 .github/scripts/repo_integrity.py',
)

print("Servidor lag patch staged")
