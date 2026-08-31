import assert from "node:assert/strict";
import fs from "node:fs";

import {
  createDetailRequestCoordinator,
  createDetailIntegrityLoader,
  inspectIncidenciaDetailIntegrity,
  INCIDENCIAS_DETAIL_INTEGRITY_VERSION,
  getIncidenciasApiSnapshot,
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

function completeDetail(id = "INC-INTEGRITY-1") {
  return {
    ticketId: id,
    comments: [
      { id: "c1", kind: "comment", message: "uno" },
      { id: "c2", kind: "comment", message: "dos" },
    ],
    commentsCount: 2,
    history: [
      { id: "h1", kind: "update" },
    ],
    historyCount: 1,
    attachments: [
      { id: "a1", name: "uno.txt" },
    ],
    attachmentsCount: 1,
    meta: {
      comments: { total: 2, returned: 2, truncated: false },
      history: { total: 1, returned: 1, truncated: false },
      attachments: { total: 1, returned: 1, truncated: false },
    },
  };
}

function testCountWithoutRowsIsNeverComplete() {
  const integrity = inspectIncidenciaDetailIntegrity({
    ticketId: "INC-MISSING-ROWS",
    comments: [],
    commentsCount: 5,
    history: [],
    historyCount: 3,
    attachments: [],
    attachmentsCount: 2,
    meta: {
      comments: { total: 5, returned: 5 },
      history: { total: 3, returned: 3 },
      attachments: { total: 2, returned: 2 },
    },
  });

  assert.equal(integrity.complete, false);
  assert.deepEqual(
    integrity.incompleteCollections,
    ["comments", "history", "attachments"],
    "contadores positivos con arrays vacíos deben considerarse detalle incompleto"
  );
}

function testBoundedWindowCanBeCompleteWithoutReturningTotal() {
  const detail = completeDetail("INC-BOUNDED");
  detail.commentsCount = 55;
  detail.comments = Array.from({ length: 50 }, (_, index) => ({
    id: `c${index + 1}`,
    kind: "comment",
  }));
  detail.meta.comments = {
    total: 55,
    returned: 50,
    limit: 50,
    truncated: true,
    hasMore: true,
  };

  const integrity = inspectIncidenciaDetailIntegrity(detail);
  assert.equal(integrity.complete, true);
  assert.equal(integrity.collections.comments.actual, 50);
  assert.equal(integrity.collections.comments.total, 55);
  assert.equal(integrity.collections.comments.truncated, true);
}

async function testIntegrityLoaderRetriesIncompletePayloadAndForcesRemote() {
  const calls = [];
  let current = 0;
  const incomplete = {
    ticketId: "INC-RETRY",
    comments: [],
    commentsCount: 2,
    history: [],
    historyCount: 1,
    attachments: [],
    attachmentsCount: 1,
  };
  const complete = completeDetail("INC-RETRY");

  const loader = createDetailIntegrityLoader(
    async (id, options) => {
      calls.push({ id, options: { ...options } });
      current += 1;
      return current < 3 ? incomplete : complete;
    },
    { retryDelays: [0, 0, 0] }
  );

  const result = await loader.request("INC-RETRY", { integrityAttempts: 3 });

  assert.equal(result.comments.length, 2);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.options.force, true);
    assert.equal(call.options.forceRefresh, true);
    assert.equal(call.options.cache, false);
    assert.equal(call.options.noCache, true);
  }
  assert.equal(loader.snapshot().retries, 2);
  assert.equal(loader.snapshot().incompleteResponses, 2);
}

async function testIntegrityLoaderRejectsPersistentlyIncompletePayload() {
  const loader = createDetailIntegrityLoader(
    async () => ({
      ticketId: "INC-BROKEN",
      comments: [],
      commentsCount: 8,
    }),
    { retryDelays: [0, 0] }
  );

  await assert.rejects(
    () => loader.request("INC-BROKEN", { integrityAttempts: 2 }),
    (error) => error?.code === "INCIDENCIA_DETAIL_INCOMPLETE"
  );
}

async function testIntegrityLoaderHonoursAbort() {
  const controller = new AbortController();
  const loader = createDetailIntegrityLoader(
    async () => completeDetail("INC-ABORT"),
    { retryDelays: [0] }
  );
  controller.abort();

  await assert.rejects(
    () => loader.request("INC-ABORT", { signal: controller.signal }),
    (error) => error?.name === "AbortError"
  );
}

function testPublicCoordinatorDeclaresIntegrityPolicy() {
  const snapshot = getIncidenciasApiSnapshot();
  assert.equal(snapshot.detailIntegrity.version, INCIDENCIAS_DETAIL_INTEGRITY_VERSION);
  assert.equal(snapshot.detailIntegrity.modalReadsAlwaysForceRemote, true);
  assert.equal(snapshot.detailIntegrity.staleDetailCacheNeverFinalAuthority, true);
  assert.equal(snapshot.detailIntegrity.mutationsRehydrateAuthoritativeDetail, true);
  assert.equal(snapshot.detailIntegrity.countArrayMismatchIsIncomplete, true);
}

function testMutationWrappersCannotReturnPartialAsFinalPolicy() {
  const apiSource = fs.readFileSync(
    new URL("../../src/views/incidencias/incidencias.api.js", import.meta.url),
    "utf8"
  );

  assert.match(apiSource, /async function authoritativeMutationResult/);
  assert.match(apiSource, /return await getIncidenciaByIdRequest\(id,/);

  for (const mutation of [
    "createIncidencia",
    "updateIncidencia",
    "commentIncidencia",
    "reopenIncidencia",
    "closeIncidencia",
    "uploadIncidenciaAttachments",
    "deleteIncidenciaAttachment",
  ]) {
    assert.match(
      apiSource,
      new RegExp(`export async function ${mutation}\\(`),
      `${mutation} debe permanecer bajo el coordinador público`
    );
  }
}

const tests = [
  testSameTicketSharesAbortableOwner,
  testJoiningCallerCanAbortWithoutCreatingSecondRequest,
  testOwnerAbortPropagatesToSharedFlight,
  testForcedRefreshDoesNotJoinStaleFlight,
  testDifferentTicketsNeverShareFlight,
  testCountWithoutRowsIsNeverComplete,
  testBoundedWindowCanBeCompleteWithoutReturningTotal,
  testIntegrityLoaderRetriesIncompletePayloadAndForcesRemote,
  testIntegrityLoaderRejectsPersistentlyIncompletePayload,
  testIntegrityLoaderHonoursAbort,
  testPublicCoordinatorDeclaresIntegrityPolicy,
  testMutationWrappersCannotReturnPartialAsFinalPolicy,
];

for (const test of tests) {
  await test();
  console.log(`ok - ${test.name}`);
}

console.log(
  `Incidencias detail request/integrity contracts: ${tests.length}/${tests.length} passed`
);
