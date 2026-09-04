import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import { createAsyncScope } from "../../src/core/async-scope.js";
import Http from "../../src/core/http.js";
import { CorreoView } from "../../src/views/correo/index.js";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("latest result wins even when the old I/O ignores abort", async () => {
  const scope = createAsyncScope();
  const paints = [];
  const run = async (io) => {
    const request = scope.begin("reader");
    try {
      const result = await io;
      if (request.isCurrent()) paints.push(result);
    } finally { request.finish(); }
  };
  const old = deferred();
  const current = deferred();
  const first = run(old.promise);
  const second = run(current.promise);
  current.resolve("current");
  await second;
  old.resolve("obsolete");
  await first;
  assert.deepEqual(paints, ["current"]);
  scope.dispose();
});

test("finishing an obsolete operation cannot remove its replacement", () => {
  const scope = createAsyncScope();
  const first = scope.begin("messages");
  const second = scope.begin("messages");
  assert.equal(first.signal.aborted, true);
  first.finish();
  assert.equal(second.isCurrent(), true);
  assert.equal(scope.cancel("messages"), true);
  assert.equal(second.isCurrent(), false);
  scope.dispose();
});

test("independent channels do not cancel each other", () => {
  const scope = createAsyncScope();
  const list = scope.begin("messages");
  const reader = scope.begin("reader");
  scope.cancel("reader");
  assert.equal(list.isCurrent(), true);
  assert.equal(reader.signal.aborted, true);
  scope.dispose();
  assert.equal(list.isCurrent(), false);
  assert.equal(list.signal.aborted, true);
  assert.equal(scope.begin("late").isCurrent(), false);
});

test("a synchronous abort callback can start the newest operation safely", () => {
  const scope = createAsyncScope();
  const first = scope.begin("reader");
  let newest;
  first.signal.addEventListener("abort", () => { newest = scope.begin("reader"); });
  const interrupted = scope.begin("reader");
  assert.equal(newest.isCurrent(), true);
  assert.equal(interrupted.isCurrent(), false);
  assert.equal(interrupted.signal.aborted, true);
  scope.dispose();
});

test("one parent listener, no listener accumulation after 100 requests", () => {
  const parent = new AbortController();
  const scope = createAsyncScope({ signal: parent.signal });
  for (let index = 0; index < 100; index += 1) scope.begin("reader").finish();
  assert.equal(getEventListeners(parent.signal, "abort").length, 1);
  assert.equal(getEventListeners(scope.signal, "abort").length, 0);
  scope.dispose();
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("parent abort cleans listeners and resources once, including failed disposers", () => {
  const parent = new AbortController();
  const scope = createAsyncScope({ signal: parent.signal });
  const target = new EventTarget();
  let clicks = 0;
  let disposed = 0;
  scope.listen(target, "click", () => clicks++);
  scope.onDispose(() => disposed++);
  scope.onDispose(() => { throw new Error("isolated cleanup failure"); });
  const request = scope.begin("reader");
  target.dispatchEvent(new Event("click"));
  parent.abort("navigation");
  target.dispatchEvent(new Event("click"));
  scope.dispose();
  assert.equal(clicks, 1);
  assert.equal(disposed, 1);
  assert.equal(request.signal.aborted, true);
  assert.equal(request.isCurrent(), false);
  assert.equal(getEventListeners(target, "click").length, 0);
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
});

test("transition release detaches external cancellation without aborting a mounted view", () => {
  const parent = new AbortController();
  const scope = createAsyncScope({ signal: parent.signal });
  scope.release();
  assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  parent.abort();
  assert.equal(scope.isActive(), true);
  scope.dispose();
  assert.equal(scope.isActive(), false);
});

test("an already aborted parent cannot install handlers or start live work", () => {
  const parent = new AbortController();
  parent.abort();
  const scope = createAsyncScope({ signal: parent.signal });
  const target = new EventTarget();
  scope.listen(target, "click", () => assert.fail("closed listener"));
  assert.equal(getEventListeners(target, "click").length, 0);
  assert.equal(scope.begin("request").signal.aborted, true);
  assert.equal(scope.isActive(), false);
});

// The controller and API adapter below are the real production modules.
// Only the HTTP transport and DOM ports are replaced; deferred HTTP ignores
// AbortSignal intentionally so every stale-result guard is exercised.
class DomPort {
  constructor() {
    this.handlers = new Map();
    this.dataset = {};
    this.innerHTML = "";
    this.textContent = "";
    this.scrollTop = 0;
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  addEventListener(type, handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(handler);
  }
  removeEventListener(type, handler) { this.handlers.get(type)?.delete(handler); }
  setAttribute() {}
  querySelectorAll() { return []; }
  querySelector() { return null; }
  contains() { return true; }
  replaceChildren() { this.innerHTML = ""; }
  async emit(type, event) {
    await Promise.all([...this.handlers.get(type) || []].map((handler) => handler(event)));
  }
  listenerCount() { return [...this.handlers.values()].reduce((sum, handlers) => sum + handlers.size, 0); }
}

class MailHost extends DomPort {
  constructor() {
    super();
    this.regions = new Map([
      "[data-correo-message-list]", "[data-correo-reader]", "[data-correo-folder-list]",
      "[data-correo-account-card]", "[data-correo-notice]", "[data-correo-notice-text]", "[data-correo-modal-root]",
    ].map((selector) => [selector, new DomPort()]));
  }
  querySelector(selector) {
    if (selector === ".correo-workspace") return this.innerHTML.includes("correo-workspace") ? this : null;
    return this.regions.get(selector) || null;
  }
  click(dataset) {
    const target = { dataset, closest: () => target };
    return this.emit("click", { target });
  }
}

const message = (id, subject = id) => ({ id, subject, isRead: true, body: { content: subject } });
const connected = {
  connected: true, healthy: true, mailbox: "primary@example.test",
  mailboxes: [{ mailbox: "primary@example.test" }, { mailbox: "shared@example.test", type: "shared" }],
};

test("Correo rejects late status after navigation and removes all mounted handlers", async () => {
  const originals = Object.fromEntries(["Node", "document", "window"].map((key) => [key, globalThis[key]]));
  const oldGet = Http.get;
  const calls = [];
  globalThis.Node = DomPort;
  globalThis.document = new DomPort();
  document.documentElement = new DomPort();
  globalThis.window = new DomPort();
  window.location = { href: "https://onionsupport.com/correo" };
  Http.get = (path, options) => {
    const request = { path, options, ...deferred() };
    calls.push(request);
    return request.promise;
  };
  const parent = new AbortController();
  const host = new MailHost();
  const controller = CorreoView(host, { signal: parent.signal });
  try {
    assert.equal(calls.length, 1);
    const before = host.innerHTML;
    parent.abort("navigated-away");
    assert.equal(controller.getSnapshot().destroyed, true);
    calls[0].resolve(connected);
    await flush();
    assert.equal(calls.length, 1, "late status must not launch a workspace load");
    assert.equal(host.innerHTML, before, "late status must not repaint the old host");
    assert.equal(host.listenerCount() + document.listenerCount() + window.listenerCount(), 0);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  } finally {
    controller.destroy();
    Http.get = oldGet;
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test("Correo coordinates list, reader, folder and mailbox races through one scope", async () => {
  const originals = Object.fromEntries(["Node", "document", "window"].map((key) => [key, globalThis[key]]));
  const oldGet = Http.get;
  const calls = [];
  globalThis.Node = DomPort;
  globalThis.document = new DomPort();
  document.documentElement = new DomPort();
  globalThis.window = new DomPort();
  window.location = { href: "https://onionsupport.com/correo" };
  Http.get = (path, options) => {
    const request = { path, options, ...deferred() };
    calls.push(request);
    return request.promise;
  };
  const latest = (suffix) => calls.findLast((call) => call.path.split("?")[0].endsWith(suffix));
  const host = new MailHost();
  const parent = new AbortController();
  const controller = CorreoView(host, { signal: parent.signal });
  try {
    latest("/status").resolve(connected);
    await flush();
    latest("/folders").resolve({ folders: [{ id: "inbox", displayName: "Inbox" }, { id: "archive", displayName: "Archivo" }] });
    latest("/me").resolve({ profile: {} });
    await flush();
    latest("/messages").resolve({ messages: [message("a"), message("b")] });
    await flush();
    latest("/messages/a").resolve({ message: message("a") });
    await flush();

    const oldRead = host.click({ correoAction: "select-message", correoMessageId: "b" });
    const oldDetail = latest("/messages/b");
    const newRead = host.click({ correoAction: "select-message", correoMessageId: "a" });
    latest("/messages/a").resolve({ message: message("a", "CURRENT DETAIL") });
    await newRead;
    oldDetail.resolve({ message: message("b", "STALE DETAIL") });
    await oldRead;
    assert.equal(oldDetail.options.signal.aborted, true);
    assert.match(host.querySelector("[data-correo-reader]").innerHTML, /CURRENT DETAIL/);
    assert.doesNotMatch(host.querySelector("[data-correo-reader]").innerHTML, /STALE DETAIL/);

    const folderRead = host.click({ correoAction: "select-message", correoMessageId: "b" });
    const folderDetail = latest("/messages/b");
    const folderChange = host.click({ correoAction: "folder", correoFolderId: "archive", correoFolderName: "Archivo" });
    folderDetail.resolve({ message: message("b", "WRONG FOLDER") });
    await folderRead;
    assert.equal(controller.getSnapshot().selectedMessageId, "");
    assert.doesNotMatch(host.querySelector("[data-correo-reader]").innerHTML, /WRONG FOLDER/);
    latest("/messages").resolve({ messages: [] });
    await folderChange;

    const oldFilter = host.click({ correoAction: "filter", correoFilter: "flagged" });
    const oldList = latest("/messages");
    const newFilter = host.click({ correoAction: "filter", correoFilter: "unread" });
    latest("/messages").resolve({ messages: [message("new", "CURRENT LIST")] });
    await flush();
    latest("/messages/new").resolve({ message: message("new", "CURRENT LIST") });
    await newFilter;
    oldList.resolve({ messages: [message("stale", "STALE LIST")] });
    await oldFilter;
    assert.match(host.querySelector("[data-correo-message-list]").innerHTML, /CURRENT LIST/);
    assert.doesNotMatch(host.querySelector("[data-correo-message-list]").innerHTML, /STALE LIST/);

    const oldMailbox = host.click({ correoAction: "mailbox", correoMailbox: "shared@example.test" });
    const oldFolders = latest("/folders");
    const oldProfile = latest("/me");
    const newMailbox = host.click({ correoAction: "mailbox", correoMailbox: "primary@example.test" });
    latest("/folders").resolve({ folders: [{ id: "primary-inbox", displayName: "Inbox" }] });
    latest("/me").resolve({ profile: {} });
    await flush();
    latest("/messages").resolve({ messages: [] });
    await newMailbox;
    const countBeforeLateMailbox = calls.length;
    oldFolders.resolve({ folders: [{ id: "wrong-mailbox", displayName: "Inbox" }] });
    oldProfile.resolve({ profile: {} });
    await oldMailbox;
    assert.equal(controller.getSnapshot().activeMailbox, "primary@example.test");
    assert.equal(controller.getSnapshot().selectedFolderId, "primary-inbox");
    assert.equal(calls.length, countBeforeLateMailbox, "stale workspace must not start another list load");
    assert.equal(oldFolders.options.signal.aborted, true);

    const lateWorkspace = host.click({ correoAction: "refresh" });
    const lateFolders = latest("/folders");
    const lateProfile = latest("/me");
    parent.abort("route-removed");
    const before = host.querySelector("[data-correo-message-list]").innerHTML;
    lateFolders.resolve({ folders: [{ id: "after-destroy", displayName: "Inbox" }] });
    lateProfile.resolve({ profile: {} });
    await lateWorkspace;
    assert.equal(controller.getSnapshot().selectedFolderId, "primary-inbox");
    assert.equal(host.querySelector("[data-correo-message-list]").innerHTML, before);
    assert.equal(host.listenerCount() + document.listenerCount() + window.listenerCount(), 0);
    assert.equal(getEventListeners(parent.signal, "abort").length, 0);
  } finally {
    controller.destroy();
    Http.get = oldGet;
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});


test("Correo confirmed writes keep their original message across selection, mailbox and teardown races", async () => {
  const keys = ["Node", "HTMLElement", "document", "window", "requestAnimationFrame"];
  const originals = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const oldHttp = Object.fromEntries(["get", "patch", "post", "delete"].map((key) => [key, Http[key]]));
  const calls = [];
  globalThis.Node = globalThis.HTMLElement = DomPort;
  globalThis.document = new DomPort();
  document.documentElement = new DomPort();
  globalThis.window = new DomPort();
  window.location = { href: "https://onionsupport.com/correo" };
  globalThis.requestAnimationFrame = (callback) => { queueMicrotask(callback); return 0; };
  for (const method of Object.keys(oldHttp)) {
    Http[method] = (path, payload, options) => {
      const request = { method, path, payload, options: options || payload, ...deferred() };
      calls.push(request);
      return request.promise;
    };
  }
  const latest = (suffix, method = "get") => calls.findLast((call) => call.method === method && call.path.split("?")[0].endsWith(suffix));
  const host = new MailHost();
  const parent = new AbortController();
  const controller = CorreoView(host, { signal: parent.signal });
  const reader = () => host.querySelector("[data-correo-reader]").innerHTML;
  const list = () => host.querySelector("[data-correo-message-list]").innerHTML;
  async function select(id, subject = id) {
    const task = host.click({ correoAction: "select-message", correoMessageId: id });
    latest(`/messages/${id}`).resolve({ message: message(id, subject) });
    await task;
  }
  async function workspace(subject = "A") {
    latest("/folders").resolve({ folders: [{ id: "inbox", displayName: "Inbox" }] });
    latest("/me").resolve({ profile: {} });
    await flush();
    latest("/messages").resolve({ messages: [message("a", subject), message("b", "B")] });
    await flush();
    if (controller.getSnapshot().selectedMessageId === "a") latest("/messages/a").resolve({ message: message("a", subject) });
    await flush();
  }
  try {
    latest("/status").resolve(connected);
    await flush();
    await workspace();
    await select("a", "A");

    const patch = host.click({ correoAction: "toggle-flag" });
    const oldPatch = latest("/messages/a", "patch");
    const writeCount = calls.filter((call) => call.method === "patch").length;
    await host.click({ correoAction: "toggle-read" });
    assert.equal(calls.filter((call) => call.method === "patch").length, writeCount, "one pending write per mailbox/message");
    await select("b", "READER B");
    oldPatch.resolve({ message: { ...message("a", "CONFIRMED A"), flag: { flagStatus: "flagged" } } });
    await patch;
    assert.match(list(), /CONFIRMED A/, "confirmed original row must still be updated");
    assert.match(reader(), /READER B/);
    assert.equal(controller.getSnapshot().selectedMessageId, "b");

    await select("a");
    const move = host.click({ correoAction: "move-to", correoDestinationId: "archive" });
    const pendingMove = latest("/messages/a/move", "post");
    await select("b", "B AFTER MOVE");
    pendingMove.resolve({ message: message("moved-a") });
    await move;
    assert.equal(controller.getSnapshot().selectedMessageId, "b");
    assert.match(reader(), /B AFTER MOVE/);
    assert.doesNotMatch(list(), /data-correo-message-id="a"/);

    const reset = host.click({ correoAction: "filter", correoFilter: "all" });
    latest("/messages").resolve({ messages: [message("a"), message("b")] });
    await reset;
    await select("a");
    const deletion = host.click({ correoAction: "delete-message" });
    await host.click({ correoAction: "confirm-accept" });
    await flush();
    const pendingDelete = latest("/messages/a", "delete");
    assert.ok(pendingDelete, "delete starts only after the actual confirmation handler");
    await select("b", "B AFTER DELETE");
    pendingDelete.resolve({ deleted: true });
    await deletion;
    assert.equal(controller.getSnapshot().selectedMessageId, "b");
    assert.match(reader(), /B AFTER DELETE/);
    assert.doesNotMatch(list(), /data-correo-message-id="a"/);

    const mailboxPatch = host.click({ correoAction: "toggle-read" });
    const pendingMailboxPatch = latest("/messages/b", "patch");
    assert.match(pendingMailboxPatch.path, /mailbox=primary%40example.test/);
    const shared = host.click({ correoAction: "mailbox", correoMailbox: "shared@example.test" });
    await workspace("SHARED A");
    await shared;
    await select("b", "SHARED READER");
    assert.equal(controller.getSnapshot().activeMailbox, "shared@example.test");
    const primary = host.click({ correoAction: "mailbox", correoMailbox: "primary@example.test" });
    await workspace("FRESH PRIMARY");
    await primary;
    await select("b", "FRESH PRIMARY B");
    pendingMailboxPatch.resolve({ message: message("b", "OBSOLETE PRIMARY B") });
    await mailboxPatch;
    assert.match(reader(), /FRESH PRIMARY B/, "A → B → A mailbox transitions invalidate the old operation");
    assert.doesNotMatch(reader(), /OBSOLETE PRIMARY B/);

    const teardownPatch = host.click({ correoAction: "toggle-flag" });
    const pendingTeardown = latest("/messages/b", "patch");
    parent.abort("navigation");
    const before = [reader(), list()];
    pendingTeardown.resolve({ message: message("b", "AFTER DESTROY") });
    await teardownPatch;
    assert.deepEqual([reader(), list()], before);
    assert.equal(pendingTeardown.options.signal.aborted, true);
    assert.equal(host.listenerCount() + document.listenerCount() + window.listenerCount(), 0);
  } finally {
    controller.destroy();
    Object.assign(Http, oldHttp);
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test("Correo stops attachment/send stages on teardown and releases an orphaned form's busy owner", async () => {
  const keys = ["Node", "HTMLElement", "document", "window", "requestAnimationFrame", "FormData", "File"];
  const originals = Object.fromEntries(keys.map((key) => [key, globalThis[key]]));
  const oldHttp = { get: Http.get, post: Http.post };
  globalThis.Node = globalThis.HTMLElement = DomPort;
  globalThis.document = new DomPort();
  document.documentElement = new DomPort();
  globalThis.window = new DomPort();
  window.location = { href: "https://onionsupport.com/correo", assign() {} };
  globalThis.requestAnimationFrame = (callback) => { queueMicrotask(callback); return 0; };
  globalThis.File = class { constructor() { this.name = "fixture.txt"; this.size = 12; } };
  globalThis.FormData = class {
    get(key) { return { to: "fixture@example.test", subject: "Fixture", body: "Fixture body" }[key] || ""; }
  };
  try {
    for (const scenario of ["send", "draft", "removed-form"]) {
      const calls = [];
      Http.get = (path, options) => {
        const request = { method: "get", path, options, ...deferred() };
        calls.push(request); return request.promise;
      };
      Http.post = (path, payload, options) => {
        const request = { method: "post", path, payload, options, ...deferred() };
        calls.push(request); return request.promise;
      };
      const host = new MailHost();
      const controller = CorreoView(host);
      const form = new DomPort();
      form.isConnected = true;
      form.dataset = { correoComposeMode: "compose" };
      form.querySelector = (selector) => selector === "[data-correo-attachments-input]" ? { files: [new File()] } : null;
      form.closest = (selector) => selector === "[data-correo-compose-form]" ? form : null;
      try {
        let action;
        if (scenario === "draft") {
          const target = { dataset: { correoAction: "save-draft" }, closest: (selector) => selector === "[data-correo-compose-form]" ? form : target };
          action = host.emit("click", { target });
        } else {
          await host.emit("submit", { target: form, preventDefault() {} });
        }
        await flush();
        const pending = calls.find((call) => call.method === "post" && call.path.split("?")[0].endsWith("/drafts"));
        assert.ok(pending, `${scenario}: the real composer creates a draft before uploading`);
        if (scenario === "removed-form") {
          const refresh = controller.refresh();
          calls.findLast((call) => call.method === "get" && call.path.endsWith("/status")).resolve({ connected: false });
          await refresh;
          form.isConnected = false; // The DOM port mirrors renderAll replacing the old form.
        } else {
          controller.destroy();
        }
        const before = host.innerHTML;
        pending.resolve({ draft: { id: "created-draft" } });
        if (action) await action;
        await flush();
        assert.equal(calls.filter((call) => call.method === "post").length, 1, `${scenario}: no stale upload/send stage starts`);
        assert.equal(host.innerHTML, before);
        if (scenario === "removed-form") {
          const connect = host.click({ correoAction: "connect" });
          const connection = calls.findLast((call) => call.path.endsWith("/connect"));
          assert.ok(connection, "settled orphaned form cannot leave the controller permanently busy");
          connection.resolve({ authorizationUrl: "https://login.microsoftonline.com/fixture" });
          await connect;
        }
      } finally { controller.destroy(); }
    }
  } finally {
    Object.assign(Http, oldHttp);
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
