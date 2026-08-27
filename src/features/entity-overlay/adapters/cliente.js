/* =========================================================
   Entity Overlay Adapter - Cliente
========================================================= */

import { AppCore } from "../../../core/index.js";

import {
  loadClienteDetail,
  normalizeClienteModel,
} from "../../../views/clientes/clientes.api.js";

import {
  openClientesDetailModal,
  closeClientesDetailModal,
} from "../../../views/clientes/clientes.template.modal.js";

export const ENTITY_CLIENTE_ADAPTER_VERSION =
  "entity-overlay.cliente.v1";

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function eventPayload(event = null) {
  const detail =
    event?.detail?.detail ||
    event?.detail?.payload ||
    event?.detail ||
    event?.payload ||
    {};

  return detail && typeof detail === "object"
    ? detail
    : {};
}

export async function createEntityAdapter({
  service = null,
} = {}) {
  let adapter = null;
  let suppressClose = false;
  let closeNotified = false;

  const onClosed = (event) => {
    if (suppressClose || closeNotified) {
      return;
    }

    closeNotified = true;

    void service?._adapterClosed?.(
      adapter,
      {
        ...eventPayload(event),
        reason: "cliente-user-close",
      }
    );
  };

  if (isBrowser()) {
    window.addEventListener(
      "clientes:modal:closed",
      onClosed
    );
    document.addEventListener(
      "clientes:modal:closed",
      onClosed
    );
  }

  try {
    AppCore?.events?.on?.(
      "clientes:modal:closed",
      onClosed
    );
  } catch {
    // CustomEvent sigue activo
  }

  adapter = Object.freeze({
    type: "cliente",
    version: ENTITY_CLIENTE_ADAPTER_VERSION,

    async open({
      descriptor = {},
    } = {}) {
      closeNotified = false;

      const detail = await loadClienteDetail(
        descriptor.id,
        {
          dedupe: true,
        }
      );

      const normalized =
        normalizeClienteModel(detail);

      return (
        openClientesDetailModal(
          normalized
        ) !== false
      );
    },

    async close({
      restoreFocus = false,
    } = {}) {
      suppressClose = true;

      try {
        return closeClientesDetailModal({
          emit: false,
          restoreFocus,
        });
      } finally {
        suppressClose = false;
      }
    },

    destroy() {
      suppressClose = true;

      try {
        closeClientesDetailModal({
          emit: false,
          restoreFocus: false,
        });
      } finally {
        suppressClose = false;
      }

      if (isBrowser()) {
        window.removeEventListener(
          "clientes:modal:closed",
          onClosed
        );
        document.removeEventListener(
          "clientes:modal:closed",
          onClosed
        );
      }

      try {
        AppCore?.events?.off?.(
          "clientes:modal:closed",
          onClosed
        );
      } catch {
        // noop
      }

      return true;
    },
  });

  return adapter;
}

export default createEntityAdapter;
