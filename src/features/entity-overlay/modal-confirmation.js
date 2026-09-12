import { createModalHost } from "./modal-host.js";
import { createModalLifecycle, restoreModalFocus } from "./modal-lifecycle.js";

// Owners supply the content and decide what an accepted confirmation does.
// Mounting, dismissal and settlement share the existing interaction authority.
export function openModalConfirmation({ host: hostOptions, render, opener, signal, bodyClasses = [] } = {}) {
  if (signal?.aborted) return Promise.resolve(false);
  const host = createModalHost(hostOptions);
  const root = host.ensure();
  if (!root) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    let settled = false;
    let surface;
    try {
      surface = render(root);
    } catch (error) {
      host.remove();
      reject(error);
      return;
    }
    const { panel, overlay, cancel, confirm } = surface || {};
    if (!panel?.isConnected || !cancel || !confirm) {
      host.remove();
      resolve(false);
      return;
    }
    const window = root.ownerDocument.defaultView;
    const lifecycle = createModalLifecycle({
      getPanel: () => panel,
      onEscape: () => settle(false),
      onDetached: () => settle(false),
      bodyClasses,
    });
    const dismiss = () => settle(false);
    const accept = () => settle(true);
    const onBackdrop = (event) => { if (event.target === overlay) dismiss(); };

    function settle(value) {
      if (settled) return;
      settled = true;
      overlay?.removeEventListener("click", onBackdrop);
      cancel.removeEventListener("click", dismiss);
      confirm.removeEventListener("click", accept);
      for (const event of ["popstate", "hashchange", "pagehide"]) window?.removeEventListener(event, dismiss);
      signal?.removeEventListener("abort", dismiss);
      host.remove();
      lifecycle.deactivate({ restoreFocus: false });
      restoreModalFocus(opener);
      resolve(Boolean(value));
    }

    overlay?.addEventListener("click", onBackdrop);
    cancel.addEventListener("click", dismiss);
    confirm.addEventListener("click", accept);
    for (const event of ["popstate", "hashchange", "pagehide"]) window?.addEventListener(event, dismiss, { once: true });
    signal?.addEventListener("abort", dismiss, { once: true });
    if (signal?.aborted || !lifecycle.activate({ opener })) {
      dismiss();
      return;
    }
    queueMicrotask(() => {
      if (!settled && lifecycle.isTop()) restoreModalFocus(cancel);
    });
  });
}
