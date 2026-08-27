/* =========================================================
   Entity Overlay Adapter - Incidencia
========================================================= */

import {
  createIncidenciasController,
} from "../../../views/incidencias/index.js";

export const ENTITY_INCIDENCIA_ADAPTER_VERSION =
  "entity-overlay.incidencia.v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function nextPaint() {
  if (!isBrowser()) return Promise.resolve();

  return new Promise((resolve) => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    window.setTimeout(resolve, 0);
  });
}

function modalOpen() {
  return Boolean(
    isBrowser() &&
    document.querySelector(
      "[data-incidencias-modal-root='true'], [data-incidencias-detail-root='true'], #incidencias-detail-modal-root"
    )
  );
}

export async function createEntityAdapter({
  service = null,
} = {}) {
  if (!isBrowser()) {
    throw new Error("ENTITY_OVERLAY_BROWSER_REQUIRED");
  }

  const host = document.createElement("div");
  host.hidden = true;
  host.setAttribute(
    "data-entity-overlay-incidencias-host",
    "true"
  );
  document.body.appendChild(host);

  let adapter = null;

  const controller = createIncidenciasController(
    host,
    {
      detailOnly: true,
      mode: "entity-overlay",
      entityOverlay: {
        service,
        onClose(payload = {}) {
          void service?._adapterClosed?.(
            adapter,
            payload
          );
        },
      },
    }
  );

  controller.mountDetailOnly();

  adapter = Object.freeze({
    type: "incidencia",
    version: ENTITY_INCIDENCIA_ADAPTER_VERSION,

    async open({
      descriptor = {},
      opener = null,
    } = {}) {
      const task = Promise.resolve(
        controller.openDetail(
          descriptor.id,
          opener
        )
      );

      await Promise.resolve();
      await nextPaint();

      if (modalOpen()) {
        task.then(
          (opened) => {
            if (opened === false && !modalOpen()) {
              void service?._adapterClosed?.(
                adapter,
                {
                  reason: "incidencia-open-failed",
                }
              );
            }
          },
          () => {
            if (!modalOpen()) {
              void service?._adapterClosed?.(
                adapter,
                {
                  reason: "incidencia-open-failed",
                }
              );
            }
          }
        );

        return true;
      }

      return (await task) !== false && modalOpen();
    },

    async close({
      reason = "entity-overlay-close",
      restoreFocus = false,
    } = {}) {
      return controller.closeDetailModal({
        force: true,
        reason,
        restoreFocus,
        suppressEntityOverlayCallback: true,
      });
    },

    getSnapshot() {
      return controller.getSnapshot();
    },

    destroy() {
      controller.destroy();
      host.remove();
      return true;
    },
  });

  return adapter;
}

export default createEntityAdapter;
