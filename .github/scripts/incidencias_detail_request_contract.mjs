import assert from "node:assert/strict";

import {
  createDetailRequestCoordinator,
} from "../../src/views/incidencias/incidencias.api.js";

function deferred() {
  let resolve;
  let reject;

  const promise = new Promise((ok, fail) => {
    resolve = ok;
    reject = fail;
  });

  return { promise, resolve, reject };
}

async function testSameTicketSharesAbortableOwner() {
  const pending = deferred();
  const calls = [];

  const coordinator = createDetailRequestCoordinator((id, options) => {
    calls.push({ id, signal: options?.signal || null });
    return pending.promise;
  });

  const ownerController = new AbortController();
  const first = coordinator.request("INC-1", { signal: ownerController.signal });
  const second = coordinator.request("INC-1", {});

  await Promise.resolve();

  assert.equal(calls.length, 1, "dos consumidores del mismo ticket deben compartir un GET");
  assert.equal(calls[0].signal, ownerController.signal, "la request HTTP conserva el signal del owner");
  assert.equal(coordinator.snapshot().inFlight, 1);

  pending.resolve({ ticketId: "INC-1" });

  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.ticketId, "INC-1");
  assert.equal(b.ticketId, "INC-1");
  assert.equal(coordinator.snapshot().inFlight, 0);
}

async function testJoiningCallerCanAbortWithoutCreatingSecondRequest() {
  const pending = deferred();
  let calls = 0;

  const coordinator = createDetailRequestCoordinator(() => {
    calls += 1;
    return pending.promise;
  });

  const owner = coordinator.request("INC-2");
  const joinController = new AbortController();
  const joined = coordinator.request("INC-2", { signal: joinController.signal });

  joinController.abort();

  const joinedResult = await Promise.allSettled([joined]);
  assert.equal(joinedResult[0].status, "rejected");
  assert.equal(joinedResult[0].reason?.name, "AbortError");
  assert.equal(calls, 1, "abortar un consumidor no debe disparar otra request");

  pending.resolve({ ticketId: "INC-2" });
  assert.equal((await owner).ticketId, "INC-2");
}

async function testOwnerAbortPropagatesToSharedFlight() {
  let calls = 0;

  const coordinator = createDetailRequestCoordinator((_id, options) => {
    calls += 1;

    return new Promise((resolve, reject) => {
      const signal = options?.signal;

      if (signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
        return;
      }

      signal?.addEventListener?.("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    });
  });

  const controller = new AbortController();
  const first = coordinator.request("INC-3", { signal: controller.signal });
  const second = coordinator.request("INC-3");

  await Promise.resolve();
  controller.abort();

  const results = await Promise.allSettled([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(results.map((item) => item.status), ["rejected", "rejected"]);
  assert.equal(coordinator.snapshot().inFlight, 0);
}

async function testForcedRefreshDoesNotJoinStaleFlight() {
  const pending = [];
  let calls = 0;

  const coordinator = createDetailRequestCoordinator((id) => {
    calls += 1;
    const current = deferred();
    pending.push(current);
    return current.promise.then(() => ({ ticketId: id, call: calls }));
  });

  const normal = coordinator.request("INC-4");
  const forced = coordinator.request("INC-4", { force: true, cache: false });

  await Promise.resolve();
  assert.equal(calls, 2, "force=true debe mantener semántica de refresh explícito");

  pending[0].resolve();
  pending[1].resolve();
  await Promise.all([normal, forced]);
}

async function testDifferentTicketsNeverShareFlight() {
  const pending = [];
  let calls = 0;

  const coordinator = createDetailRequestCoordinator((id) => {
    calls += 1;
    const current = deferred();
    pending.push(current);
    return current.promise.then(() => id);
  });

  const a = coordinator.request("INC-A");
  const b = coordinator.request("INC-B");

  await Promise.resolve();
  assert.equal(calls, 2);

  pending.forEach((item) => item.resolve());
  assert.deepEqual(await Promise.all([a, b]), ["INC-A", "INC-B"]);
}

const tests = [
  testSameTicketSharesAbortableOwner,
  testJoiningCallerCanAbortWithoutCreatingSecondRequest,
  testOwnerAbortPropagatesToSharedFlight,
  testForcedRefreshDoesNotJoinStaleFlight,
  testDifferentTicketsNeverShareFlight,
];

for (const test of tests) {
  await test();
  console.log(`ok - ${test.name}`);
}

console.log(`Incidencias detail request contracts: ${tests.length}/${tests.length} passed`);
