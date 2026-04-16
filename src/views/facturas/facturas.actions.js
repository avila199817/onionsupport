/* =========================================================
   Onion SPA - Facturas Actions
   Archivo: src/views/facturas/facturas.actions.js

   Responsabilidades:
   - centralizar acciones operativas del módulo de facturas
   - abrir detalle en modal global REAL sobre document.body
   - abrir pdf inline / descarga
   - enviar factura al cliente
   - exportar colección a CSV
   - desacoplar la vista principal de la lógica de acciones

   FULL PRO 10/10:
   - modal global igual filosofía incidencias
   - compat con renderFacturasDetailModal()
   - cierre por overlay / ESC
   - refresh de detalle
   - safe cleanup
   - tolerancia a fallos parciales
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  fetchFacturaPdfUrlRequest,
  sendFacturaRequest,
} from "./facturas.api.js";

import {
  getFacturaByIdStore,
  getSortedFacturasStore,
} from "./facturas.store.js";

import {
  renderFacturasDetailModal,
} from "./facturas.detail.template.js";

import {
  safeText,
  safeNumber,
  showToast,
} from "./facturas.utils.js";

/* =========================================================
   MODAL GLOBAL ROOT
========================================================= */

const FACTURAS_MODAL_ROOT_ID =
  "facturas-detail-modal-root";

function getBody() {
  try {
    return document.body || null;
  } catch {
    return null;
  }
}

function getModalRoot() {
  try {
    return document.getElementById(
      FACTURAS_MODAL_ROOT_ID
    );
  } catch {
    return null;
  }
}

function ensureModalRoot() {
  const existing =
    getModalRoot();

  if (existing) {
    return existing;
  }

  const body = getBody();

  if (!body) {
    return null;
  }

  const root =
    document.createElement("div");

  root.id =
    FACTURAS_MODAL_ROOT_ID;

  body.appendChild(root);

  return root;
}

function removeModalRoot() {
  try {
    getModalRoot()?.remove?.();
  } catch {}
}

function setBodyModalState(
  enabled = false
) {
  try {
    document.body.classList.toggle(
      "modal-open",
      Boolean(enabled)
    );
  } catch {}
}

function bindEscToClose() {
  const onKeydown =
    (event) => {
      if (
        event.key ===
        "Escape"
      ) {
        closeFacturaDetailModal();
      }
    };

  document.addEventListener(
    "keydown",
    onKeydown
  );

  return () => {
    document.removeEventListener(
      "keydown",
      onKeydown
    );
  };
}

let removeEscHandler =
  null;

/* =========================================================
   HELPERS
========================================================= */

function safeEmit(
  eventName = "",
  payload = {}
) {
  try {
    AppCore?.events?.emit?.(
      eventName,
      payload
    );
  } catch {}
}

function resolvePdfUrl(
  response = null
) {
  return safeText(
    response?.file?.url ||
      response?.url ||
      response?.data?.file?.url ||
      response?.data?.url,
    ""
  );
}

function resolveFacturaId(
  factura = null,
  fallback = ""
) {
  return safeText(
    factura?.id ||
      factura?._id ||
      factura?.facturaId ||
      fallback,
    ""
  );
}

function resolveFacturaNumber(
  factura = null,
  fallback = ""
) {
  return safeText(
    factura?.numero ||
      factura?.code ||
      fallback,
    fallback || "—"
  );
}

async function copyText(
  text = ""
) {
  const value =
    safeText(text, "");

  if (!value) {
    return false;
  }

  try {
    if (
      navigator?.clipboard
        ?.writeText
    ) {
      await navigator.clipboard.writeText(
        value
      );
      return true;
    }
  } catch {}

  try {
    const el =
      document.createElement(
        "textarea"
      );

    el.value = value;
    el.setAttribute(
      "readonly",
      "true"
    );
    el.style.position =
      "fixed";
    el.style.opacity =
      "0";
    el.style.pointerEvents =
      "none";

    document.body.appendChild(
      el
    );

    el.select();
    el.setSelectionRange(
      0,
      value.length
    );

    const ok =
      document.execCommand(
        "copy"
      );

    el.remove();

    return Boolean(ok);
  } catch {
    return false;
  }
}

/* =========================================================
   MODAL DETAIL
========================================================= */

export function closeFacturaDetailModal() {
  try {
    removeEscHandler?.();
  } catch {}

  removeEscHandler = null;

  setBodyModalState(false);
  removeModalRoot();

  safeEmit(
    "facturas:detail:closed",
    {}
  );

  return true;
}

function bindFacturaModalEvents({
  facturaId = "",
  detail = null,
  loadFacturaDetail,
  sendingFacturaId = "",
  onSendStart,
  onSendEnd,
  onSent,
  reloadFacturas,
} = {}) {
  const root =
    getModalRoot();

  if (!root) {
    return () => {};
  }

  const onClick = async (
    event
  ) => {
    const overlayClose =
      event.target === root.firstElementChild;

    const closeBtn =
      event.target.closest(
        '[data-action="close-factura-detail"]'
      );

    const pdfBtn =
      event.target.closest(
        '[data-action="view-factura-pdf"]'
      );

    const downloadBtn =
      event.target.closest(
        '[data-action="download-factura"]'
      );

    const sendBtn =
      event.target.closest(
        '[data-action="send-factura"]'
      );

    if (
      overlayClose ||
      closeBtn
    ) {
      event.preventDefault();
      closeFacturaDetailModal();
      return;
    }

    if (pdfBtn) {
      event.preventDefault();

      await openFacturaPdfAction({
        facturaId:
          pdfBtn.dataset
            .facturaId,
      });

      return;
    }

    if (downloadBtn) {
      event.preventDefault();

      await downloadFacturaPdfAction({
        facturaId:
          downloadBtn
            .dataset
            .facturaId,
      });

      return;
    }

    if (sendBtn) {
      event.preventDefault();

      const currentId =
        safeText(
          sendBtn.dataset
            .facturaId,
          ""
        );

      const currentDetail =
        detail &&
        resolveFacturaId(
          detail
        ) === currentId
          ? detail
          : getFacturaByIdStore(
              currentId
            );

      const response =
        await sendFacturaToClientAction(
          {
            facturaId:
              currentId,
            detail:
              currentDetail,
            onStart:
              onSendStart,
            onEnd: onSendEnd,
            onSent,
            reloadFacturas,
            confirmSend: true,
          }
        );

      if (!response) {
        return;
      }

      const refreshed =
        typeof loadFacturaDetail ===
        "function"
          ? await loadFacturaDetail(
              currentId
            ).catch(
              () =>
                currentDetail
            )
          : currentDetail;

      await mountFacturaDetailModal(
        {
          factura:
            refreshed ||
            currentDetail,
          detailLoading:
            false,
          sendingFacturaId,
          loadFacturaDetail,
          onSendStart,
          onSendEnd,
          onSent,
          reloadFacturas,
        }
      );

      return;
    }
  };

  root.addEventListener(
    "click",
    onClick
  );

  return () => {
    root.removeEventListener(
      "click",
      onClick
    );
  };
}

let removeModalEvents =
  null;

export async function mountFacturaDetailModal({
  factura = null,
  detailLoading = false,
  sendingFacturaId = "",
  loadFacturaDetail,
  onSendStart,
  onSendEnd,
  onSent,
  reloadFacturas,
} = {}) {
  const root =
    ensureModalRoot();

  if (!root) {
    return false;
  }

  try {
    removeModalEvents?.();
  } catch {}

  removeModalEvents = null;

  const html =
    renderFacturasDetailModal({
      detailOpen: true,
      detailLoading,
      factura,
      sendingFacturaId,
    });

  root.innerHTML = html;

  setBodyModalState(true);

  try {
    removeEscHandler?.();
  } catch {}

  removeEscHandler =
    bindEscToClose();

  removeModalEvents =
    bindFacturaModalEvents({
      facturaId:
        resolveFacturaId(
          factura
        ),
      detail: factura,
      loadFacturaDetail,
      sendingFacturaId,
      onSendStart,
      onSendEnd,
      onSent,
      reloadFacturas,
    });

  return true;
}

/* =========================================================
   OPEN DETAIL
========================================================= */

export async function openFacturaAction({
  facturaId = "",
  emitOpenEvent = true,
  loadFacturaDetail,
  useStoreFirst = true,
  mountModal = true,
  onSendStart,
  onSendEnd,
  onSent,
  reloadFacturas,
} = {}) {
  const id =
    safeText(
      facturaId,
      ""
    );

  if (!id) {
    return null;
  }

  try {
    if (
      emitOpenEvent &&
      typeof AppCore?.events?.emit ===
        "function"
    ) {
      AppCore.events.emit(
        "facturas:open",
        {
          facturaId: id,
        }
      );
    }

    let detail =
      useStoreFirst
        ? getFacturaByIdStore(
            id
          )
        : null;

    if (mountModal) {
      await mountFacturaDetailModal({
        factura: detail,
        detailLoading:
          !detail,
        loadFacturaDetail,
        onSendStart,
        onSendEnd,
        onSent,
        reloadFacturas,
      });
    }

    if (
      typeof loadFacturaDetail ===
      "function"
    ) {
      detail =
        await loadFacturaDetail(
          id
        );
    } else if (!detail) {
      detail =
        getFacturaByIdStore(
          id
        );
    }

    if (
      mountModal &&
      detail
    ) {
      await mountFacturaDetailModal({
        factura: detail,
        detailLoading:
          false,
        loadFacturaDetail,
        onSendStart,
        onSendEnd,
        onSent,
        reloadFacturas,
      });
    }

    safeEmit(
      "facturas:detail:ready",
      {
        facturaId: id,
        detail,
      }
    );

    return detail;
  } catch (error) {
    console.error(
      "❌ FACTURAS OPEN DETAIL:",
      error
    );

    closeFacturaDetailModal();

    showToast(
      "No se pudo abrir el detalle de la factura.",
      "error"
    );

    return null;
  }
}

/* =========================================================
   PDF INLINE
========================================================= */

export async function openFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
} = {}) {
  const id =
    safeText(
      facturaId,
      ""
    );

  if (!id) {
    return null;
  }

  try {
    onStart?.(id);

    const response =
      await fetchFacturaPdfUrlRequest(
        id,
        "inline"
      );

    const url =
      resolvePdfUrl(
        response
      );

    if (!url) {
      throw new Error(
        "PDF_URL_MISSING"
      );
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    showToast(
      "Abriendo PDF de la factura.",
      "success"
    );

    safeEmit(
      "facturas:pdf:opened",
      {
        facturaId: id,
        url,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "❌ FACTURAS VIEW PDF:",
      error
    );

    showToast(
      "No se pudo abrir el PDF.",
      "error"
    );

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   PDF DOWNLOAD
========================================================= */

export async function downloadFacturaPdfAction({
  facturaId = "",
  onStart,
  onEnd,
} = {}) {
  const id =
    safeText(
      facturaId,
      ""
    );

  if (!id) {
    return null;
  }

  try {
    onStart?.(id);

    const response =
      await fetchFacturaPdfUrlRequest(
        id,
        "attachment"
      );

    const url =
      resolvePdfUrl(
        response
      );

    if (!url) {
      throw new Error(
        "DOWNLOAD_URL_MISSING"
      );
    }

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    showToast(
      "Preparando descarga de factura.",
      "success"
    );

    safeEmit(
      "facturas:pdf:download",
      {
        facturaId: id,
        url,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "❌ FACTURAS DOWNLOAD PDF:",
      error
    );

    showToast(
      "No se pudo descargar la factura.",
      "error"
    );

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   SEND
========================================================= */

export async function sendFacturaToClientAction({
  facturaId = "",
  detail = null,
  onStart,
  onEnd,
  onSent,
  reloadFacturas,
  confirmSend = true,
} = {}) {
  const id =
    safeText(
      facturaId,
      ""
    );

  if (!id) {
    return null;
  }

  const factura =
    resolveFacturaId(
      detail
    ) === id
      ? detail
      : getFacturaByIdStore(
          id
        );

  const targetEmail =
    factura?.cliente?.email ||
    factura?.enviadoA ||
    "el cliente";

  if (confirmSend) {
    const confirmed =
      window.confirm(
        `Se va a enviar la factura ${
          resolveFacturaNumber(
            factura,
            id
          )
        } a ${targetEmail}. ¿Continuar?`
      );

    if (!confirmed) {
      return null;
    }
  }

  try {
    onStart?.(id);

    const response =
      await sendFacturaRequest(
        id
      );

    onSent?.({
      facturaId: id,
      response,
      factura,
    });

    safeEmit(
      "facturas:sent",
      {
        facturaId: id,
        response,
      }
    );

    showToast(
      "Factura enviada correctamente.",
      "success"
    );

    if (
      typeof reloadFacturas ===
      "function"
    ) {
      await reloadFacturas();
    }

    return response;
  } catch (error) {
    console.error(
      "❌ FACTURAS SEND:",
      error
    );

    showToast(
      "No se pudo enviar la factura.",
      "error"
    );

    return null;
  } finally {
    onEnd?.(id);
  }
}

/* =========================================================
   COPY FACTURA ID
========================================================= */

export async function copyFacturaIdAction({
  facturaId = "",
  numero = "",
} = {}) {
  const value =
    safeText(
      numero,
      ""
    ) ||
    safeText(
      facturaId,
      ""
    );

  if (!value) {
    showToast(
      "No se encontró identificador para copiar.",
      "info"
    );
    return false;
  }

  const ok =
    await copyText(value);

  if (!ok) {
    showToast(
      "No se pudo copiar el identificador.",
      "error"
    );
    return false;
  }

  showToast(
    "Identificador copiado.",
    "success"
  );

  safeEmit(
    "facturas:copied",
    {
      facturaId: safeText(
        facturaId,
        ""
      ),
      numero: safeText(
        numero,
        ""
      ),
      value,
    }
  );

  return true;
}

/* =========================================================
   EXPORT CSV
========================================================= */

export function exportFacturasCsvAction({
  items = null,
  filenamePrefix = "facturas",
} = {}) {
  const list =
    Array.isArray(items)
      ? items
      : getSortedFacturasStore();

  if (!list.length) {
    showToast(
      "No hay facturas para exportar.",
      "info"
    );
    return false;
  }

  const headers = [
    "numero",
    "cliente",
    "email",
    "fecha",
    "estadoPago",
    "estado",
    "formaPago",
    "total",
    "moneda",
  ];

  const rows = list.map(
    (item) => ({
      numero:
        item?.numero || "",
      cliente:
        item?.cliente
          ?.empresa ||
        item?.cliente
          ?.nombre ||
        "",
      email:
        item?.cliente
          ?.email || "",
      fecha:
        item?.fecha || "",
      estadoPago:
        item?.estadoPago || "",
      estado:
        item?.estado || "",
      formaPago:
        item?.formaPago || "",
      total: safeNumber(
        item?.total,
        0
      ),
      moneda:
        item?.moneda || "EUR",
    })
  );

  const csv = [
    headers.join(","),
    ...rows.map((row) =>
      headers
        .map(
          (key) =>
            `"${String(
              row[key] ?? ""
            ).replaceAll(
              '"',
              '""'
            )}"`
        )
        .join(",")
    ),
  ].join("\n");

  const blob =
    new Blob([csv], {
      type: "text/csv;charset=utf-8;",
    });

  const url =
    URL.createObjectURL(
      blob
    );

  const anchor =
    document.createElement(
      "a"
    );

  anchor.href = url;
  anchor.download = `${safeText(
    filenamePrefix,
    "facturas"
  )}_${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;

  document.body.appendChild(
    anchor
  );

  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);

  showToast(
    "Exportación CSV generada.",
    "success"
  );

  safeEmit(
    "facturas:exported",
    {
      total: list.length,
      filenamePrefix:
        safeText(
          filenamePrefix,
          "facturas"
        ),
    }
  );

  return true;
}

export default {
  openFacturaAction,
  closeFacturaDetailModal,
  mountFacturaDetailModal,
  openFacturaPdfAction,
  downloadFacturaPdfAction,
  sendFacturaToClientAction,
  copyFacturaIdAction,
  exportFacturasCsvAction,
};
