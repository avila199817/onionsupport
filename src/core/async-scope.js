/* One owner for cancellation, latest-wins work and lifecycle cleanup.
 * Cancellation stops cooperative I/O; isCurrent() also rejects late results
 * from an operation which ignores its AbortSignal.
 */
export function createAsyncScope({ signal: externalSignal = null } = {}) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const tasks = new Map();
  const cleanups = new Set();
  let closed = false;
  let parentListener = null;

  const signal = controller?.signal || externalSignal || null;
  const isActive = () => !closed && !signal?.aborted;
  const isPending = (key) => tasks.get(key)?.isCurrent() === true;

  function release() {
    if (parentListener) externalSignal?.removeEventListener?.("abort", parentListener);
    parentListener = null;
  }

  function cancel(key, reason = "superseded") {
    const task = tasks.get(key);
    if (!task) return false;
    tasks.delete(key);
    task.abort(reason);
    return true;
  }

  function dispose(reason = "disposed") {
    if (closed) return false;
    closed = true;
    release();
    // Remove ownership before abort callbacks can synchronously start work.
    for (const key of [...tasks.keys()]) cancel(key, reason);
    controller?.abort(reason);
    const pending = [...cleanups].reverse();
    cleanups.clear();
    for (const cleanup of pending) {
      try { cleanup(); } catch { /* One disposer cannot retain other resources. */ }
    }
    return true;
  }

  function onDispose(cleanup) {
    if (typeof cleanup !== "function") throw new TypeError("A cleanup function is required.");
    if (!isActive()) {
      cleanup();
      return () => false;
    }
    cleanups.add(cleanup);
    return () => cleanups.delete(cleanup);
  }

  function listen(target, type, listener, options = false) {
    if (!isActive() || !target?.addEventListener) return () => false;
    target.addEventListener(type, listener, options);
    let listening = true;
    const cleanup = () => {
      if (!listening) return false;
      listening = false;
      cleanups.delete(cleanup);
      target.removeEventListener(type, listener, options);
      return true;
    };
    cleanups.add(cleanup);
    return cleanup;
  }

  function begin(key) {
    const previous = tasks.get(key);
    const request = typeof AbortController === "function" ? new AbortController() : null;
    let finished = false;
    let invalidated = false;
    const task = {
      signal: request?.signal || signal,
      isCurrent: () => !finished && !invalidated && isActive() && tasks.get(key) === task,
      abort(reason) { invalidated = true; request?.abort(reason); },
      finish() {
        if (finished) return false;
        finished = true;
        if (tasks.get(key) === task) tasks.delete(key);
        return true;
      },
    };
    if (isActive()) tasks.set(key, task);
    else task.abort(signal?.reason || "disposed");
    // Ownership precedes abort: a synchronous abort handler may start a newer
    // operation, which must remain the winner instead of being overwritten.
    previous?.abort("superseded");
    return task;
  }

  if (externalSignal?.aborted) dispose(externalSignal.reason);
  else if (externalSignal?.addEventListener) {
    parentListener = () => dispose(externalSignal.reason);
    externalSignal.addEventListener("abort", parentListener, { once: true });
  }

  return Object.freeze({ signal, isActive, isPending, begin, cancel, listen, onDispose, dispose, release });
}

export default createAsyncScope;
