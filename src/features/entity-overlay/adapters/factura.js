/* =========================================================
   Entity Overlay Adapter - Factura
========================================================= */

import {
  createFacturasController,
} from "../../../views/facturas/index.js";

export const ENTITY_FACTURA_ADAPTER_VERSION =
  "entity-overlay.factura.v1";

const HOST_ATTRIBUTE =
  "data-entity-overlay-facturas-host";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function modalOpen() {
  return Boolean(
    isBrowser() &&
    document.querySelector(
      "[data-facturas-detail-root='true'], [data-facturas-detail-modal='true']"
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
  host.setAttribute(HOST_ATTRIBUTE, "true");
  document.body.appendChild(host);

  let adapter = null;

  const controller = createFacturasController(
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
    type: "factura",
    version: ENTITY_FACTURA_ADAPTER_VERSION,

    async open({
      descriptor = {},
      opener = null,
    } = {}) {
      const task = Promise.resolve(
        controller.openFactura(
          descriptor.id,
          opener
        )
      );

      /*
        openFactura monta el shell antes de su primer await.
        Dejamos la hidratación remota en background y sólo notificamos
        cierre si el flujo terminó sin modal canónico abierto.
      */
      task.then(
        (opened) => {
          if (opened === false && !modalOpen()) {
            void service?._adapterClosed?.(
              adapter,
              {
                reason: "factura-open-failed",
              }
            );
          }
        },
        () => {
          if (!modalOpen()) {
            void service?._adapterClosed?.(
              adapter,
              {
                reason: "factura-open-failed",
              }
            );
          }
        }
      );

      await Promise.resolve();
      return true;
    },

    async close({
      reason = "entity-overlay-close",
      restoreFocus = false,
    } = {}) {
      return controller.closeDetailModal({
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
