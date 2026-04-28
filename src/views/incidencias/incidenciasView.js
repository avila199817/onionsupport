/* =========================================================
   Onion SPA - Incidencias View
   Archivo: src/views/incidencias/incidenciasView.js

   CLIENT EXPERIENCE MODE · VIEW REAL · EXTREME GOD MODE

   RESPONSABILIDADES:
   - punto de entrada real de la vista de incidencias
   - render principal con template final unificado
   - paginación visual fija a 5 incidencias por vista
   - carga inicial robusta con fallback a cache
   - refresh con loader SOLO en historial / tabla
   - apertura de incidencia con estado visual de loading
   - apertura de modal de creación de incidencia
   - bind de eventos de pantalla
   - evitar doble bind de listeners
   - soportar destroy limpio del router
   - permitir reload con rerender seguro
   - coordinar acciones y modales sin mezclar responsabilidades
   - preservar importes de facturas asociadas para tabla
   - preservar numeroFacturaLegal para tabla/modal
   - cargar el modal de detalle por import directo

   HARDENING EXTREME:
   - render inicial inmediato
   - bind inmediato tras primer render para evitar pérdida de clicks
   - cola segura para crear incidencia antes de app ready
   - carga posterior segura
   - anti-race token
   - cleanup total
   - click delegation sólida
   - fallback elegante si los modales aún no existen
   - bloqueo de acciones antes de app ready sin perder intención del usuario
   - anti spam click en apertura rápida
   - anti spam apertura rápida de tickets
   - compatibilidad con template nuevo data-incidencias-action
   - compatibilidad con data-action legacy
   - template controlado por state real
   - blindaje contra normalizadores que descartan total/importe/linkedInvoices
   - blindaje contra normalizadores que descartan numeroFacturaLegal
   - bridge fuerte con incidencias.modal.js
   - soporte backend aliases: tickets/items/data/incidencias/results
========================================================= */

import { AppCore } from "../../core/index.js";

import {
  incidenciasState,
  DEFAULT_PAGE_SIZE as STATE_DEFAULT_PAGE_SIZE,
  setHydrated,
  setLoading,
  setRefreshing,
  setLoaded,
  setError,
  clearError,
  setLastSyncAt,
  touchLastSyncAt,
  setRemoteCount,
  setPage,
  setPageSize,
  setCreating,
  setOpeningTicketId,
  writeCachePayload,
  hydrateStateFromCache,
  getIncidenciasStateSnapshot,
} from "./incidencias.state.js";

import {
  loadIncidencias,
  hydrateFromCache,
} from "./incidencias.api.js";

import {
  getIncidencias,
} from "./incidencias.store.js";

import renderIncidenciasTableTemplate from "./incidencias.table.template.js";

import {
  DEFAULT_PAGE_SIZE as MODEL_DEFAULT_PAGE_SIZE,
  normalizeIncidenciasCollection,
  sortIncidenciasByUpdatedDesc,
  paginateIncidencias,
  findIncidenciaById,
} from "./incidencias.model.js";

import {
  openTicketAction,
  copyTicketIdAction,
  exportIncidenciasCsvAction,
  refreshTicketDetailAction,
} from "./incidencias.actions.js";

import IncidenciasCreateView from "./incidencias.create.modal.js";
import { OnionIncidenciasModal } from "./incidencias.modal.js";

export const IncidenciasView = (() => {
  "use strict";

  /* =========================================================
     CONSTANTS
  ========================================================= */

  const SCOPE = "view:incidencias";

  const PAGE_SIZE =
    Number(MODEL_DEFAULT_PAGE_SIZE || STATE_DEFAULT_PAGE_SIZE || 5) || 5;

  const CREATE_CLICK_THROTTLE_MS = 450;
  const OPEN_TICKET_THROTTLE_MS = 350;

  const DEFAULT_CURRENCY = "EUR";

  /* =========================================================
     LOCAL RUNTIME
  ========================================================= */

  let initialized = false;
  let destroyed = false;

  let inflightInit = null;
  let inflightReload = null;
  let queuedReloadOptions = null;

  let bindingsCleanup = null;

  let renderToken = 0;

  let pendingCreateRequest = false;
  let lastCreateClickAt = 0;
  let lastOpenTicketClickAt = 0;

  let lastApiPayload = null;

  /* =========================================================
     SAFE HELPERS
  ========================================================= */

  function safeLog(...args) {
    try {
      AppCore?.utils?.log?.("[IncidenciasView]", ...args);
    } catch {}
  }

  function safeWarn(...args) {
    try {
      AppCore?.utils?.warn?.("[IncidenciasView]", ...args);
    } catch {}

    try {
      console.warn("[IncidenciasView]", ...args);
    } catch {}
  }

  function safeEmit(event = "", payload = {}) {
    const eventName = safeText(event, "");
    if (!eventName) return false;

    try {
      AppCore?.events?.emit?.(eventName, payload);
      return true;
    } catch {}

    try {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          detail: payload,
        })
      );
      return true;
    } catch {}

    return false;
  }

  function safeText(value, fallback = "") {
    if (value === null || value === undefined) return fallback;

    const text = String(value)
      .replace(/[\r\n\t]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return text || fallback;
  }

  function safeLower(value, fallback = "") {
    return safeText(value, fallback).toLowerCase();
  }

  function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }

  function first(...values) {
    for (const value of values) {
      if (value === undefined || value === null) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      if (Array.isArray(value) && value.length === 0) continue;

      return value;
    }

    return null;
  }

  function hasOwnKeys(value = {}) {
    return Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).length
    );
  }

  function uniqueStrings(values = []) {
    return [
      ...new Set(
        safeArray(values)
          .flatMap((value) => (Array.isArray(value) ? value : [value]))
          .map((value) => safeText(value, ""))
          .filter(Boolean)
      ),
    ];
  }

  function getStableTicketId(item = {}) {
    return safeText(
      first(
        item?.ticketId,
        item?.id,
        item?.code,
        item?.numero,
        item?.ticketCode,
        item?.incidenciaId,

        item?.raw?.ticketId,
        item?.raw?.id,
        item?.raw?.code,
        item?.raw?.numero,
        item?.raw?.ticketCode,
        item?.raw?.incidenciaId
      ),
      ""
    );
  }

  function normalizeMoney(value, fallback = null) {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : fallback;
    }

    const normalized = String(value)
      .replace(/\s+/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const amount = Number(normalized);

    if (!Number.isFinite(amount)) {
      return fallback;
    }

    return amount;
  }

  function roundMoney(value) {
    const amount = normalizeMoney(value, null);

    if (!Number.isFinite(amount)) {
      return null;
    }

    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function getEventPayload(event = null) {
    return safeObject(
      first(
        event?.detail,
        event?.payload,
        event
      )
    );
  }

  function waitForPaint() {
    return new Promise((resolve) => {
      try {
        if (typeof window === "undefined") {
          resolve();
          return;
        }

        if (typeof window.requestAnimationFrame !== "function") {
          window.setTimeout(resolve, 0);
          return;
        }

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(resolve);
        });
      } catch {
        resolve();
      }
    });
  }

  function getContainer() {
    return (
      AppCore?.dom?.viewContainer ||
      document.getElementById("view-container") ||
      null
    );
  }

  function nextRenderToken() {
    renderToken += 1;
    return renderToken;
  }

  function isActiveToken(token) {
    return !destroyed && token === renderToken;
  }

  function showToast(message = "", type = "info") {
    const text = safeText(message, "");
    if (!text) return;

    try {
      if (typeof AppCore?.toast?.[type] === "function") {
        AppCore.toast[type](text);
        return;
      }
    } catch {}

    try {
      AppCore?.toast?.show?.(text, type);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.[type]?.(text);
      return;
    } catch {}

    try {
      AppCore?.ui?.toast?.show?.(text, type);
    } catch {}
  }

  function safeErrorMessage(error = null) {
    return safeText(
      first(
        error?.message,
        error?.response?.message,
        error?.response?.data?.message,
        error?.data?.message,
        error?.error,
        "No se pudo cargar el historial de incidencias."
      ),
      "No se pudo cargar el historial de incidencias."
    );
  }

  /* =========================================================
     BACKEND PAYLOAD HELPERS
  ========================================================= */

  function extractItemsFromPayload(payload = null) {
    if (Array.isArray(payload)) {
      return payload;
    }

    const data = safeObject(payload);

    return safeArray(
      first(
        data.tickets,
        data.items,
        data.data,
        data.incidencias,
        data.results,
        data.rows,
        data.list,
        data.payload?.tickets,
        data.payload?.items,
        data.payload?.data,
        data.payload?.incidencias
      )
    );
  }

  function extractRemoteCountFromPayload(payload = null, fallback = 0) {
    const data = safeObject(payload);

    return Math.max(
      0,
      safeNumber(
        first(
          data.total,
          data.count,
          data.remoteCount,
          data.totalCount,
          data.meta?.total,
          data.meta?.count,
          data.pagination?.total,
          data.payload?.total,
          data.payload?.count,
          fallback
        ),
        fallback
      )
    );
  }

  function makeRawMap(...collections) {
    const map = new Map();

    for (const collection of collections) {
      safeArray(collection).forEach((item) => {
        const id = getStableTicketId(item);

        if (id && !map.has(id)) {
          map.set(id, item);
        }
      });
    }

    return map;
  }

  /* =========================================================
     INVOICE FIELD PRESERVER
     Evita que normalizeIncidenciasCollection pierda:
     - facturaTotal / facturaImporte / importeFactura
     - total / amount / importe
     - linkedInvoices.total
     - numeroFacturaLegal
     - factura/invoice/billing
  ========================================================= */

  function collectInvoiceObjects(source = {}, raw = {}) {
    const output = [];

    const candidates = [
      source?.factura,
      source?.invoice,
      source?.billing,
      source?.linkedInvoices,

      raw?.factura,
      raw?.invoice,
      raw?.billing,
      raw?.linkedInvoices,

      ...safeArray(source?.facturas),
      ...safeArray(source?.invoices),
      ...safeArray(source?.facturasRelacionadas),
      ...safeArray(source?.linkedInvoices?.invoices),

      ...safeArray(raw?.facturas),
      ...safeArray(raw?.invoices),
      ...safeArray(raw?.facturasRelacionadas),
      ...safeArray(raw?.linkedInvoices?.invoices),
    ];

    candidates.forEach((candidate) => {
      if (hasOwnKeys(candidate)) {
        output.push(candidate);
      }
    });

    return output;
  }

  function resolveInvoiceNumber(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return safeText(
      first(
        source.numeroFacturaLegal,
        source.numeroFactura,
        source.invoiceNumber,
        source.legalInvoiceNumber,
        source.facturaNumeroLegal,

        source.billing?.numeroFacturaLegal,
        source.billing?.numeroFactura,
        source.billing?.invoiceNumber,

        source.factura?.numeroFacturaLegal,
        source.factura?.numeroFactura,
        source.factura?.invoiceNumber,
        source.factura?.legalNumber,
        source.factura?.number,

        source.invoice?.numeroFacturaLegal,
        source.invoice?.numeroFactura,
        source.invoice?.invoiceNumber,
        source.invoice?.legalNumber,
        source.invoice?.number,

        source.linkedInvoices?.numeroFacturaLegal,
        source.linkedInvoices?.numeroFactura,
        source.linkedInvoices?.invoiceNumber,

        raw.numeroFacturaLegal,
        raw.numeroFactura,
        raw.invoiceNumber,
        raw.legalInvoiceNumber,
        raw.facturaNumeroLegal,

        raw.billing?.numeroFacturaLegal,
        raw.billing?.numeroFactura,
        raw.billing?.invoiceNumber,

        raw.factura?.numeroFacturaLegal,
        raw.factura?.numeroFactura,
        raw.factura?.invoiceNumber,
        raw.factura?.legalNumber,
        raw.factura?.number,

        raw.invoice?.numeroFacturaLegal,
        raw.invoice?.numeroFactura,
        raw.invoice?.invoiceNumber,
        raw.invoice?.legalNumber,
        raw.invoice?.number,

        raw.linkedInvoices?.numeroFacturaLegal,
        raw.linkedInvoices?.numeroFactura,
        raw.linkedInvoices?.invoiceNumber,

        ...invoices.map((invoice) => invoice?.numeroFacturaLegal),
        ...invoices.map((invoice) => invoice?.numeroFactura),
        ...invoices.map((invoice) => invoice?.invoiceNumber),
        ...invoices.map((invoice) => invoice?.legalNumber),
        ...invoices.map((invoice) => invoice?.number)
      ),
      ""
    );
  }

  function resolvePrimaryInvoiceId(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return safeText(
      first(
        source.facturaId,
        source.invoiceId,
        source.linkedFacturaId,
        source.linkedInvoiceId,

        source.billing?.facturaId,
        source.billing?.invoiceId,

        source.factura?.id,
        source.factura?.facturaId,
        source.factura?.invoiceId,

        source.invoice?.id,
        source.invoice?.facturaId,
        source.invoice?.invoiceId,

        source.linkedInvoices?.primaryInvoiceId,

        raw.facturaId,
        raw.invoiceId,
        raw.linkedFacturaId,
        raw.linkedInvoiceId,

        raw.billing?.facturaId,
        raw.billing?.invoiceId,

        raw.factura?.id,
        raw.factura?.facturaId,
        raw.factura?.invoiceId,

        raw.invoice?.id,
        raw.invoice?.facturaId,
        raw.invoice?.invoiceId,

        raw.linkedInvoices?.primaryInvoiceId,

        ...safeArray(source.facturaIds),
        ...safeArray(source.invoiceIds),
        ...safeArray(source.linkedInvoices?.ids),

        ...safeArray(raw.facturaIds),
        ...safeArray(raw.invoiceIds),
        ...safeArray(raw.linkedInvoices?.ids),

        ...invoices.map((invoice) => invoice?.id),
        ...invoices.map((invoice) => invoice?.facturaId),
        ...invoices.map((invoice) => invoice?.invoiceId)
      ),
      ""
    );
  }

  function resolveInvoiceIds(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return uniqueStrings([
      source.facturaId,
      source.invoiceId,
      source.linkedFacturaId,
      source.linkedInvoiceId,

      raw.facturaId,
      raw.invoiceId,
      raw.linkedFacturaId,
      raw.linkedInvoiceId,

      source.linkedInvoices?.primaryInvoiceId,
      raw.linkedInvoices?.primaryInvoiceId,

      ...safeArray(source.facturaIds),
      ...safeArray(source.invoiceIds),
      ...safeArray(source.linkedInvoices?.ids),

      ...safeArray(raw.facturaIds),
      ...safeArray(raw.invoiceIds),
      ...safeArray(raw.linkedInvoices?.ids),

      ...invoices.flatMap((invoice) => [
        invoice?.id,
        invoice?.facturaId,
        invoice?.invoiceId,
        invoice?.numeroFacturaLegal,
        invoice?.numeroFactura,
        invoice?.invoiceNumber,
      ]),
    ]);
  }

  function resolveInvoiceCount(source = {}, raw = {}, invoiceIds = []) {
    const invoices = collectInvoiceObjects(source, raw);

    return Math.max(
      0,
      safeNumber(
        first(
          source.facturasCount,
          source.invoicesCount,
          source.linkedInvoices?.count,

          source.meta?.linkedInvoiceCount,
          source.meta?.invoiceCount,

          raw.facturasCount,
          raw.invoicesCount,
          raw.linkedInvoices?.count,

          raw.meta?.linkedInvoiceCount,
          raw.meta?.invoiceCount,

          invoiceIds.length,
          invoices.length
        ),
        Math.max(invoiceIds.length, invoices.length)
      )
    );
  }

  function resolveInvoiceCurrency(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    return safeText(
      first(
        source.facturaCurrency,
        source.facturaMoneda,
        source.currency,
        source.moneda,

        source.linkedInvoices?.currency,
        source.linkedInvoices?.moneda,

        source.meta?.invoiceCurrency,
        source.meta?.currency,
        source.meta?.moneda,

        source.billing?.currency,
        source.billing?.moneda,

        source.factura?.currency,
        source.factura?.moneda,

        source.invoice?.currency,
        source.invoice?.moneda,

        raw.facturaCurrency,
        raw.facturaMoneda,
        raw.currency,
        raw.moneda,

        raw.linkedInvoices?.currency,
        raw.linkedInvoices?.moneda,

        raw.meta?.invoiceCurrency,
        raw.meta?.currency,
        raw.meta?.moneda,

        raw.billing?.currency,
        raw.billing?.moneda,

        raw.factura?.currency,
        raw.factura?.moneda,

        raw.invoice?.currency,
        raw.invoice?.moneda,

        ...invoices.map((invoice) => invoice?.currency),
        ...invoices.map((invoice) => invoice?.moneda),

        DEFAULT_CURRENCY
      ),
      DEFAULT_CURRENCY
    ).toUpperCase();
  }

  function resolveInvoiceAmount(source = {}, raw = {}) {
    const invoices = collectInvoiceObjects(source, raw);

    const candidates = [
      source.facturaTotal,
      source.facturaImporte,
      source.importeFactura,
      source.totalFactura,
      source.invoiceAmount,

      source.facturasTotal,
      source.invoicesTotal,
      source.importeFacturas,
      source.invoiceTotal,

      source.linkedInvoices?.total,
      source.linkedInvoices?.amount,
      source.linkedInvoices?.importe,

      source.meta?.invoicesTotal,
      source.meta?.invoiceTotal,

      source.billing?.total,
      source.billing?.amount,
      source.billing?.importe,

      source.factura?.total,
      source.factura?.amount,
      source.factura?.importe,
      source.factura?.importeTotal,
      source.factura?.totalFactura,

      source.invoice?.total,
      source.invoice?.amount,
      source.invoice?.importe,
      source.invoice?.importeTotal,
      source.invoice?.totalFactura,

      raw.facturaTotal,
      raw.facturaImporte,
      raw.importeFactura,
      raw.totalFactura,
      raw.invoiceAmount,

      raw.facturasTotal,
      raw.invoicesTotal,
      raw.importeFacturas,
      raw.invoiceTotal,

      raw.linkedInvoices?.total,
      raw.linkedInvoices?.amount,
      raw.linkedInvoices?.importe,

      raw.meta?.invoicesTotal,
      raw.meta?.invoiceTotal,

      raw.billing?.total,
      raw.billing?.amount,
      raw.billing?.importe,

      raw.factura?.total,
      raw.factura?.amount,
      raw.factura?.importe,
      raw.factura?.importeTotal,
      raw.factura?.totalFactura,

      raw.invoice?.total,
      raw.invoice?.amount,
      raw.invoice?.importe,
      raw.invoice?.importeTotal,
      raw.invoice?.totalFactura,

      ...invoices.map((invoice) => invoice?.total),
      ...invoices.map((invoice) => invoice?.amount),
      ...invoices.map((invoice) => invoice?.importe),
      ...invoices.map((invoice) => invoice?.importeTotal),
      ...invoices.map((invoice) => invoice?.totalFactura),
    ];

    for (const candidate of candidates) {
      const amount = roundMoney(candidate);

      if (amount !== null) {
        return amount;
      }
    }

    /*
      Último recurso:
      solo usamos total/amount/importe genéricos si existe algún indicio de factura.
      Esto evita transformar tickets sin factura en "0 €" artificial.
    */
    const invoiceNumber = resolveInvoiceNumber(source, raw);
    const invoiceIds = resolveInvoiceIds(source, raw);
    const hasInvoiceEvidence =
      Boolean(invoiceNumber) ||
      invoiceIds.length > 0 ||
      collectInvoiceObjects(source, raw).length > 0;

    if (hasInvoiceEvidence) {
      const genericAmount = roundMoney(
        first(
          source.total,
          source.amount,
          source.importe,
          source.price,
          raw.total,
          raw.amount,
          raw.importe,
          raw.price
        )
      );

      return genericAmount === null ? 0 : genericAmount;
    }

    return null;
  }

  function normalizeInvoiceLite(invoice = {}) {
    if (!hasOwnKeys(invoice)) return null;

    const total = resolveInvoiceAmount(invoice, {});
    const numeroFacturaLegal = resolveInvoiceNumber(invoice, {});
    const id = resolvePrimaryInvoiceId(invoice, {});

    return {
      ...invoice,

      id,
      facturaId: safeText(first(invoice.facturaId, id), id),
      invoiceId: safeText(first(invoice.invoiceId, id), id),

      numeroFacturaLegal,
      numeroFactura: safeText(first(invoice.numeroFactura, numeroFacturaLegal), numeroFacturaLegal),
      invoiceNumber: safeText(first(invoice.invoiceNumber, numeroFacturaLegal), numeroFacturaLegal),

      total: total === null ? 0 : total,
      amount: total === null ? 0 : total,
      importe: total === null ? 0 : total,
      totalFactura: total === null ? 0 : total,
      importeTotal: total === null ? 0 : total,

      currency: resolveInvoiceCurrency(invoice, {}),
      moneda: resolveInvoiceCurrency(invoice, {}),
    };
  }

  function normalizeInvoiceArray(source = {}, raw = {}) {
    return collectInvoiceObjects(source, raw)
      .map(normalizeInvoiceLite)
      .filter(Boolean);
  }

  function preserveInvoiceAmountFields(item = {}, fallbackRaw = {}) {
    const source = safeObject(item);

    const embeddedRaw = safeObject(source.raw);
    const externalRaw = safeObject(fallbackRaw);

    const raw = hasOwnKeys(embeddedRaw)
      ? embeddedRaw
      : externalRaw;

    const sourceMeta = safeObject(source.meta);
    const rawMeta = safeObject(raw.meta);

    const sourceLinkedInvoices = safeObject(source.linkedInvoices);
    const rawLinkedInvoices = safeObject(raw.linkedInvoices);

    const linkedInvoices = hasOwnKeys(sourceLinkedInvoices)
      ? sourceLinkedInvoices
      : rawLinkedInvoices;

    const invoiceIds = resolveInvoiceIds(source, raw);
    const primaryInvoiceId = resolvePrimaryInvoiceId(source, raw) || invoiceIds[0] || "";
    const facturasCount = resolveInvoiceCount(source, raw, invoiceIds);

    const amount = resolveInvoiceAmount(source, raw);
    const normalizedAmount = amount === null ? null : roundMoney(amount);

    const currency = resolveInvoiceCurrency(source, raw);
    const numeroFacturaLegal = resolveInvoiceNumber(source, raw);

    const normalizedInvoices = normalizeInvoiceArray(source, raw);

    const hasInvoiceEvidence = Boolean(
      numeroFacturaLegal ||
        primaryInvoiceId ||
        invoiceIds.length ||
        facturasCount ||
        normalizedInvoices.length ||
        normalizedAmount !== null
    );

    const finalAmount = normalizedAmount === null
      ? hasInvoiceEvidence
        ? 0
        : null
      : normalizedAmount;

    const nextLinkedInvoices = {
      ...linkedInvoices,

      count: Math.max(
        facturasCount,
        safeNumber(linkedInvoices.count, 0),
        safeNumber(rawLinkedInvoices.count, 0),
        invoiceIds.length,
        normalizedInvoices.length,
        hasInvoiceEvidence ? 1 : 0
      ),

      ids: uniqueStrings(
        first(
          linkedInvoices.ids,
          rawLinkedInvoices.ids,
          invoiceIds
        )
      ),

      primaryInvoiceId: safeText(
        first(
          linkedInvoices.primaryInvoiceId,
          rawLinkedInvoices.primaryInvoiceId,
          primaryInvoiceId
        ),
        primaryInvoiceId
      ),

      numeroFacturaLegal: safeText(
        first(
          linkedInvoices.numeroFacturaLegal,
          rawLinkedInvoices.numeroFacturaLegal,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),

      numeroFactura: safeText(
        first(
          linkedInvoices.numeroFactura,
          rawLinkedInvoices.numeroFactura,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),

      invoiceNumber: safeText(
        first(
          linkedInvoices.invoiceNumber,
          rawLinkedInvoices.invoiceNumber,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),

      total: first(linkedInvoices.total, rawLinkedInvoices.total, finalAmount),
      amount: first(linkedInvoices.amount, rawLinkedInvoices.amount, finalAmount),
      importe: first(linkedInvoices.importe, rawLinkedInvoices.importe, finalAmount),

      currency: safeText(first(linkedInvoices.currency, rawLinkedInvoices.currency, currency), currency),
      moneda: safeText(first(linkedInvoices.moneda, rawLinkedInvoices.moneda, currency), currency),

      invoices: safeArray(
        first(
          linkedInvoices.invoices,
          rawLinkedInvoices.invoices,
          normalizedInvoices
        )
      ),
    };

    const nextMeta = {
      ...sourceMeta,

      hasLinkedInvoices: Boolean(
        sourceMeta.hasLinkedInvoices ||
          rawMeta.hasLinkedInvoices ||
          hasInvoiceEvidence
      ),

      linkedInvoiceCount: Math.max(
        safeNumber(sourceMeta.linkedInvoiceCount, 0),
        safeNumber(rawMeta.linkedInvoiceCount, 0),
        nextLinkedInvoices.count,
        facturasCount,
        invoiceIds.length,
        normalizedInvoices.length
      ),

      invoicesTotal: first(
        sourceMeta.invoicesTotal,
        rawMeta.invoicesTotal,
        finalAmount
      ),

      invoiceTotal: first(
        sourceMeta.invoiceTotal,
        rawMeta.invoiceTotal,
        finalAmount
      ),

      invoiceCurrency: safeText(
        first(
          sourceMeta.invoiceCurrency,
          rawMeta.invoiceCurrency,
          currency
        ),
        currency
      ),

      numeroFacturaLegal: safeText(
        first(
          sourceMeta.numeroFacturaLegal,
          rawMeta.numeroFacturaLegal,
          numeroFacturaLegal
        ),
        numeroFacturaLegal
      ),
    };

    return {
      ...source,

      raw: hasOwnKeys(source.raw) ? source.raw : raw,

      facturaId: safeText(
        first(source.facturaId, raw.facturaId, source.invoiceId, raw.invoiceId, primaryInvoiceId),
        ""
      ),

      invoiceId: safeText(
        first(source.invoiceId, raw.invoiceId, source.facturaId, raw.facturaId, primaryInvoiceId),
        ""
      ),

      linkedFacturaId: safeText(
        first(source.linkedFacturaId, raw.linkedFacturaId, primaryInvoiceId),
        ""
      ),

      linkedInvoiceId: safeText(
        first(source.linkedInvoiceId, raw.linkedInvoiceId, primaryInvoiceId),
        ""
      ),

      numeroFacturaLegal,
      numeroFactura: safeText(first(source.numeroFactura, raw.numeroFactura, numeroFacturaLegal), numeroFacturaLegal),
      invoiceNumber: safeText(first(source.invoiceNumber, raw.invoiceNumber, numeroFacturaLegal), numeroFacturaLegal),

      facturaIds: uniqueStrings(first(source.facturaIds, raw.facturaIds, invoiceIds)),
      invoiceIds: uniqueStrings(first(source.invoiceIds, raw.invoiceIds, invoiceIds)),

      facturaRelacionada: safeText(
        first(
          source.facturaRelacionada,
          raw.facturaRelacionada,
          facturasCount > 0
            ? `${facturasCount} factura${facturasCount === 1 ? "" : "s"} vinculada${facturasCount === 1 ? "" : "s"}`
            : ""
        ),
        ""
      ),

      facturasCount,
      invoicesCount: Math.max(
        facturasCount,
        safeNumber(source.invoicesCount, 0),
        safeNumber(raw.invoicesCount, 0)
      ),

      linkedInvoices: nextLinkedInvoices,

      factura: first(source.factura, raw.factura, normalizedInvoices[0], null),
      invoice: first(source.invoice, raw.invoice, normalizedInvoices[0], null),
      billing: first(
        source.billing,
        raw.billing,
        hasInvoiceEvidence
          ? {
              facturaId: primaryInvoiceId,
              invoiceId: primaryInvoiceId,
              numeroFacturaLegal,
              total: finalAmount,
              amount: finalAmount,
              currency,
            }
          : null
      ),

      invoices: safeArray(first(source.invoices, raw.invoices, normalizedInvoices)),
      facturas: safeArray(first(source.facturas, raw.facturas, normalizedInvoices)),
      facturasRelacionadas: safeArray(
        first(source.facturasRelacionadas, raw.facturasRelacionadas, normalizedInvoices)
      ),

      facturasTotal: finalAmount,
      invoicesTotal: finalAmount,
      importeFacturas: finalAmount,
      invoiceTotal: finalAmount,

      facturaTotal: finalAmount,
      facturaImporte: finalAmount,
      importeFactura: finalAmount,
      totalFactura: finalAmount,
      invoiceAmount: finalAmount,

      total: finalAmount,
      amount: finalAmount,
      importe: finalAmount,
      price: finalAmount,

      currency,
      moneda: currency,
      facturaCurrency: currency,
      facturaMoneda: currency,

      meta: nextMeta,
    };
  }

  /* =========================================================
     CLEANUP
  ========================================================= */

  function cleanupBindings() {
    try {
      bindingsCleanup?.();
    } catch {}

    bindingsCleanup = null;

    try {
      AppCore?.cleanup?.run?.(SCOPE);
    } catch {}
  }

  /* =========================================================
     STATE HELPERS
  ========================================================= */

  function ensureBaseState() {
    try {
      if (!Number.isFinite(Number(incidenciasState.page))) {
        setPage(1);
      }

      if (!Number.isFinite(Number(incidenciasState.pageSize))) {
        setPageSize(PAGE_SIZE);
      }

      if (safeNumber(incidenciasState.pageSize, 0) <= 0) {
        setPageSize(PAGE_SIZE);
      }
    } catch {
      incidenciasState.page = Math.max(1, safeNumber(incidenciasState.page, 1));
      incidenciasState.pageSize = Math.max(
        1,
        safeNumber(incidenciasState.pageSize, PAGE_SIZE)
      );
    }

    if (typeof incidenciasState.loading !== "boolean") {
      incidenciasState.loading = false;
    }

    if (typeof incidenciasState.refreshing !== "boolean") {
      incidenciasState.refreshing = false;
    }

    if (typeof incidenciasState.creating !== "boolean") {
      incidenciasState.creating = false;
    }

    incidenciasState.openingTicketId = safeText(
      incidenciasState.openingTicketId,
      ""
    );

    incidenciasState.error = safeText(
      incidenciasState.error,
      ""
    );

    incidenciasState.remoteCount = Math.max(
      0,
      safeNumber(incidenciasState.remoteCount, 0)
    );

    return incidenciasState;
  }

  function markIdle() {
    try {
      setLoading(false);
      setRefreshing(false);
    } catch {
      incidenciasState.loading = false;
      incidenciasState.refreshing = false;
    }
  }

  function markLoadedOk(items = [], remoteCountFallback = null) {
    const total = Math.max(
      safeArray(items).length,
      safeNumber(incidenciasState.remoteCount, safeArray(items).length),
      safeNumber(remoteCountFallback, 0)
    );

    try {
      setRemoteCount(total);
      setLoaded(true);
      setHydrated(true);
      clearError();
    } catch {
      incidenciasState.remoteCount = total;
      incidenciasState.loaded = true;
      incidenciasState.hydrated = true;
      incidenciasState.error = "";
      markIdle();
    }

    return total;
  }

  function getRawItems() {
    try {
      return safeArray(getIncidencias());
    } catch {
      return [];
    }
  }

  function getPayloadRawItems() {
    return extractItemsFromPayload(lastApiPayload);
  }

  function getItems() {
    try {
      const storeRawItems = getRawItems();
      const payloadRawItems = getPayloadRawItems();

      const rawById = makeRawMap(payloadRawItems, storeRawItems);

      const baseItems = storeRawItems.length
        ? storeRawItems
        : payloadRawItems;

      const normalizedItems = safeArray(
        normalizeIncidenciasCollection(baseItems)
      );

      const patchedItems = normalizedItems.map((item, index) => {
        const id = getStableTicketId(item);
        const matchingRaw =
          rawById.get(id) ||
          payloadRawItems[index] ||
          storeRawItems[index] ||
          {};

        return preserveInvoiceAmountFields(item, matchingRaw);
      });

      const sorted = sortIncidenciasByUpdatedDesc(patchedItems);

      return safeArray(sorted);
    } catch (error) {
      safeWarn("getItems falló:", error);
      return [];
    }
  }

  function getPaginationMeta(items = []) {
    const page = safeNumber(incidenciasState.page, 1);
    const pageSize = safeNumber(incidenciasState.pageSize, PAGE_SIZE);

    return paginateIncidencias(
      safeArray(items),
      page,
      pageSize || PAGE_SIZE
    );
  }

  function clampPageAgainstItems(items = []) {
    const pagination = getPaginationMeta(items);

    if (safeNumber(incidenciasState.page, 1) !== pagination.page) {
      try {
        setPage(pagination.page);
      } catch {
        incidenciasState.page = pagination.page;
      }
    }

    return pagination;
  }

  function hydrateBestEffort() {
    let hydrated = false;

    try {
      hydrated = Boolean(
        hydrateStateFromCache?.({
          freshOnly: true,
        })
      );
    } catch {}

    try {
      hydrateFromCache?.();
    } catch {}

    try {
      if (getItems().length) {
        setHydrated(true);
        setLoaded(true);
        hydrated = true;
      }
    } catch {}

    return hydrated;
  }

  function persistCacheBestEffort() {
    try {
      writeCachePayload?.();
      return true;
    } catch {
      return false;
    }
  }

  /* =========================================================
     APP READY HARDENING
  ========================================================= */

  function isDomReady() {
    return Boolean(
      typeof document !== "undefined" &&
        document.body &&
        document.readyState !== "loading"
    );
  }

  function isAppReady() {
    return Boolean(
      AppCore?.state?.ready ||
        AppCore?.state?.bootCompleted ||
        AppCore?.state?.appReady ||
        AppCore?.state?.authenticated !== undefined
    );
  }

  function canInteract() {
    return !destroyed && isDomReady() && isAppReady();
  }

  function throttleCreateClick() {
    const now = Date.now();

    if (now - lastCreateClickAt < CREATE_CLICK_THROTTLE_MS) {
      return false;
    }

    lastCreateClickAt = now;
    return true;
  }

  function throttleOpenTicketClick() {
    const now = Date.now();

    if (now - lastOpenTicketClickAt < OPEN_TICKET_THROTTLE_MS) {
      return false;
    }

    lastOpenTicketClickAt = now;
    return true;
  }

  /* =========================================================
     MODAL BRIDGES
  ========================================================= */

  function openTicketModalBridge(detail = null) {
    const payload = safeObject(detail);

    if (!hasOwnKeys(payload)) {
      return false;
    }

    try {
      if (typeof OnionIncidenciasModal?.getState === "function") {
        const state = OnionIncidenciasModal.getState();

        if (state?.isOpen && typeof OnionIncidenciasModal.update === "function") {
          OnionIncidenciasModal.update(payload);
          return true;
        }

        if (typeof OnionIncidenciasModal.open === "function") {
          OnionIncidenciasModal.open(payload);
          return true;
        }
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal import directo falló:", error);
    }

    try {
      const modal = window?.OnionIncidenciasModal;

      if (modal?.getState?.()?.isOpen && typeof modal.update === "function") {
        modal.update(payload);
        return true;
      }

      if (typeof modal?.open === "function") {
        modal.open(payload);
        return true;
      }
    } catch (error) {
      safeWarn("OnionIncidenciasModal hook global falló:", error);
    }

    try {
      const hook =
        window?.renderIncidenciaTicketModal ||
        window?.renderTicketModal;

      if (typeof hook === "function") {
        hook(payload);
        return true;
      }
    } catch (error) {
      safeWarn("ticket modal hook legacy falló:", error);
    }

    safeEmit("incidencias:modal:open", {
      detail: payload,
    });

    return true;
  }

  function openCreateModalBridge(draft = {}) {
    try {
      const modal = window?.OnionIncidenciasCreateModal;

      if (typeof modal?.open === "function") {
        modal.open(draft);
        return true;
      }
    } catch (error) {
      safeWarn("OnionIncidenciasCreateModal hook falló:", error);
    }

    try {
      const hook =
        window?.renderIncidenciasCreateModal ||
        window?.renderIncidenciaCreateModal ||
        IncidenciasCreateView?.open;

      if (typeof hook === "function") {
        hook(draft);
        return true;
      }
    } catch (error) {
      safeWarn("create modal hook falló:", error);
    }

    safeEmit("incidencias:create-modal:open", { draft });

    return true;
  }

  function flushPendingCreate() {
    if (!pendingCreateRequest) return false;
    if (!canInteract()) return false;

    pendingCreateRequest = false;
    lastCreateClickAt = 0;

    try {
      setCreating(false);
    } catch {
      incidenciasState.creating = false;
    }

    void handleCreateIncidencia({
      skipThrottle: true,
      fromPending: true,
    });

    return true;
  }

  /* =========================================================
     DOM POST-RENDER
  ========================================================= */

  function applyErrorStateToDom(container) {
    if (!container) return;

    const oldBanner = container.querySelector(
      "[data-incidencias-error-banner='true']"
    );

    if (oldBanner) {
      oldBanner.remove();
    }

    const message = safeText(incidenciasState.error, "");
    if (!message) return;

    const historyHead =
      container.querySelector(".incidencias-history-head") ||
      container.querySelector("[data-incidencias-history-head='true']") ||
      container.querySelector("[data-incidencias-table-head='true']") ||
      container.querySelector(".content-wrapper");

    if (!historyHead) return;

    const banner = document.createElement("div");
    banner.setAttribute("data-incidencias-error-banner", "true");

    Object.assign(banner.style, {
      margin: "0 18px 14px",
      padding: "11px 13px",
      borderRadius: "14px",
      border:
        "1px solid color-mix(in srgb, var(--danger-strong, #ff6b6b) 22%, var(--border-soft, rgba(15,23,42,.08)))",
      background:
        "linear-gradient(180deg, color-mix(in srgb, var(--danger-strong, #ff6b6b) 6%, transparent), transparent), var(--surface-1, rgba(255,255,255,.78))",
      color: "var(--text-soft, #4b5563)",
      fontSize: "12px",
      lineHeight: "1.5",
    });

    banner.textContent = message;
    historyHead.insertAdjacentElement("afterend", banner);
  }

  function decorateDom(container) {
    if (!container) return container;

    applyErrorStateToDom(container);

    return container;
  }

  /* =========================================================
     RENDER
  ========================================================= */

  function buildHtml() {
    const allItems = getItems();
    const pagination = clampPageAgainstItems(allItems);

    const remoteCount = Math.max(
      allItems.length,
      safeNumber(incidenciasState.remoteCount, allItems.length)
    );

    const totalCount = remoteCount;

    return `
      <section class="panel-content dashboard ready" data-view="incidencias">
        <div class="content-wrapper" style="display:grid;gap:var(--space-lg);">
          ${renderIncidenciasTableTemplate({
            items: allItems,
            totalCount,
            remoteCount,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalPages: pagination.totalPages,
            lastUpdatedAt: incidenciasState.lastSyncAt || "",
            title: "Tus incidencias y solicitudes",
            subtitle:
              "Consulta el estado de tus incidencias, revisa las actualizaciones más recientes y crea nuevas solicitudes desde una vista clara, cercana y fácil de seguir.",
            state: incidenciasState,
          })}
        </div>
      </section>
    `;
  }

  function render() {
    const container = getContainer();

    if (!container) {
      safeWarn("No existe #view-container para renderizar incidencias.");
      return null;
    }

    ensureBaseState();

    try {
      AppCore?.setDocumentTitle?.("Incidencias");
    } catch {}

    try {
      AppCore?.clearDynamicContainers?.();
    } catch {}

    container.innerHTML = buildHtml();
    decorateDom(container);

    try {
      setHydrated(true);
    } catch {
      incidenciasState.hydrated = true;
    }

    return container;
  }

  function rerender() {
    if (destroyed) return null;

    const container = render();

    if (!destroyed) {
      bind();
    }

    return container;
  }

  /* =========================================================
     DATA
  ========================================================= */

  async function loadData({
    force = false,
    silent = false,
    asRefresh = false,
  } = {}) {
    if (destroyed) return getItems();

    const itemsBefore = getItems();
    const hasVisibleData = itemsBefore.length > 0;

    try {
      clearError();

      if (!hasVisibleData && !silent) {
        setLoading(true);
      } else if (asRefresh) {
        setRefreshing(true);
      }
    } catch {
      incidenciasState.error = "";
      incidenciasState.loading = !hasVisibleData && !silent;
      incidenciasState.refreshing = hasVisibleData && asRefresh;
    }

    if (!destroyed) {
      rerender();
    }

    try {
      const payload = await loadIncidencias({
        force,
      });

      lastApiPayload = payload || lastApiPayload;

      const payloadRemoteCount = extractRemoteCountFromPayload(
        payload,
        getItems().length
      );

      if (payloadRemoteCount > 0) {
        try {
          setRemoteCount(payloadRemoteCount);
        } catch {
          incidenciasState.remoteCount = payloadRemoteCount;
        }
      }

      const itemsAfter = getItems();

      markLoadedOk(itemsAfter, payloadRemoteCount);

      try {
        touchLastSyncAt();
      } catch {
        try {
          setLastSyncAt(Date.now());
        } catch {
          incidenciasState.lastSyncAt = Date.now();
        }
      }

      persistCacheBestEffort();

      return itemsAfter;
    } catch (error) {
      const message = safeErrorMessage(error);

      try {
        setError(message);
        setLoaded(true);
      } catch {
        incidenciasState.error = message;
        incidenciasState.loaded = true;
        incidenciasState.hydrated = true;
        markIdle();
      }

      if (!silent) {
        showToast(message, "error");
      }

      return getItems();
    } finally {
      markIdle();
    }
  }

  async function renderAndLoad({
    force = false,
    asRefresh = false,
    silent = false,
  } = {}) {
    const token = nextRenderToken();

    hydrateBestEffort();
    ensureBaseState();

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    await loadData({
      force,
      silent,
      asRefresh,
    });

    if (!isActiveToken(token)) {
      return api;
    }

    render();

    if (!destroyed) {
      bind();
    }

    flushPendingCreate();

    return api;
  }

  /* =========================================================
     ACTIONS
  ========================================================= */

  function goToPage(page = 1) {
    if (incidenciasState.loading || incidenciasState.refreshing) {
      return incidenciasState.page || 1;
    }

    const items = getItems();

    const pagination = paginateIncidencias(
      items,
      page,
      incidenciasState.pageSize || PAGE_SIZE
    );

    try {
      setPage(pagination.page);
    } catch {
      incidenciasState.page = pagination.page;
    }

    rerender();

    return pagination.page;
  }

  function goPrevPage() {
    return goToPage((incidenciasState.page || 1) - 1);
  }

  function goNextPage() {
    return goToPage((incidenciasState.page || 1) + 1);
  }

  function changePageSize(value = PAGE_SIZE) {
    const nextSize = Math.max(1, safeNumber(value, PAGE_SIZE));

    try {
      setPageSize(nextSize);
      setPage(1);
    } catch {
      incidenciasState.pageSize = nextSize;
      incidenciasState.page = 1;
    }

    rerender();

    return nextSize;
  }

  async function handleOpenTicket(ticketId = "") {
    const id = safeText(ticketId, "");
    if (!id) return null;

    if (!throttleOpenTicketClick()) {
      return null;
    }

    if (incidenciasState.openingTicketId) {
      return null;
    }

    try {
      setOpeningTicketId(id);
    } catch {
      incidenciasState.openingTicketId = id;
    }

    rerender();
    await waitForPaint();

    try {
      const detail = await openTicketAction({
        ticketId: id,
        preferFresh: true,
        silent: true,
      });

      if (!detail) {
        showToast("No se pudo abrir la incidencia.", "error");
        return null;
      }

      const patchedDetail = preserveInvoiceAmountFields(
        safeObject(detail),
        safeObject(detail?.raw)
      );

      openTicketModalBridge(patchedDetail);

      return patchedDetail;
    } catch (error) {
      safeWarn("handleOpenTicket falló:", error);
      showToast("No se pudo abrir la incidencia.", "error");
      return null;
    } finally {
      try {
        setOpeningTicketId("");
      } catch {
        incidenciasState.openingTicketId = "";
      }

      if (!destroyed) rerender();
    }
  }

  async function handleRefreshTicketFromModal(ticketId = "") {
    const id = safeText(ticketId, "");
    if (!id) return null;

    try {
      const detail = await refreshTicketDetailAction({
        ticketId: id,
        silent: true,
      });

      if (detail) {
        const patchedDetail = preserveInvoiceAmountFields(
          safeObject(detail),
          safeObject(detail?.raw)
        );

        openTicketModalBridge(patchedDetail);
        return patchedDetail;
      }

      return null;
    } catch (error) {
      safeWarn("handleRefreshTicketFromModal falló:", error);
      showToast("No se pudo actualizar la incidencia.", "error");
      return null;
    }
  }

  async function handleCopyTicketId(ticketId = "") {
    const id = safeText(ticketId, "");

    if (!id) {
      showToast("No hay referencia para copiar.", "error");
      return false;
    }

    try {
      return await copyTicketIdAction({
        ticketId: id,
        silent: false,
      });
    } catch (error) {
      safeWarn("handleCopyTicketId falló:", error);
      showToast("No se pudo copiar la referencia.", "error");
      return false;
    }
  }

  function handleExportCsv() {
    try {
      return exportIncidenciasCsvAction({
        silent: false,
      });
    } catch (error) {
      safeWarn("handleExportCsv falló:", error);
      showToast("No se pudo exportar el historial.", "error");
      return false;
    }
  }

  async function handleCreateIncidencia(options = {}) {
    const opts = safeObject(options);
    const skipThrottle = Boolean(opts.skipThrottle);

    if (incidenciasState.creating && !pendingCreateRequest) {
      return false;
    }

    if (!skipThrottle && !throttleCreateClick()) {
      return false;
    }

    if (!canInteract()) {
      pendingCreateRequest = true;

      try {
        setCreating(true);
      } catch {
        incidenciasState.creating = true;
      }

      rerender();

      showToast("Preparando formulario...", "info");

      return false;
    }

    pendingCreateRequest = false;

    try {
      setCreating(true);
    } catch {
      incidenciasState.creating = true;
    }

    rerender();
    await waitForPaint();

    try {
      const opened = openCreateModalBridge({});

      if (!opened) {
        showToast("No se pudo abrir el formulario.", "error");
      }

      return opened;
    } finally {
      try {
        setCreating(false);
      } catch {
        incidenciasState.creating = false;
      }

      if (!destroyed) rerender();
    }
  }

  /* =========================================================
     BINDINGS
  ========================================================= */

  function getActionTarget(event, actions = []) {
    const selectors = actions
      .map((action) => {
        return [
          `[data-incidencias-action="${action}"]`,
          `[data-action="${action}"]`,
        ].join(",");
      })
      .join(",");

    if (!selectors) return null;

    return event.target?.closest?.(selectors) || null;
  }

  function getTicketIdFromElement(element = null) {
    if (!element) return "";

    const closestRow =
      element.closest?.("[data-ticket-id]") ||
      element.closest?.("[data-incidencia-id]") ||
      element.closest?.("[data-ticket-code]") ||
      null;

    return safeText(
      first(
        element.dataset?.ticketId,
        element.dataset?.incidenciaId,
        element.dataset?.ticketCode,

        element.getAttribute?.("data-ticket-id"),
        element.getAttribute?.("data-incidencia-id"),
        element.getAttribute?.("data-ticket-code"),

        closestRow?.dataset?.ticketId,
        closestRow?.dataset?.incidenciaId,
        closestRow?.dataset?.ticketCode,

        closestRow?.getAttribute?.("data-ticket-id"),
        closestRow?.getAttribute?.("data-incidencia-id"),
        closestRow?.getAttribute?.("data-ticket-code")
      ),
      ""
    );
  }

  function bindNativeActions(container) {
    if (!container) {
      return () => {};
    }

    const onClick = async (event) => {
      if (destroyed) return;

      const detailBtn = getActionTarget(event, [
        "detail",
        "open",
        "open-ticket",
        "view-ticket",
      ]);

      if (detailBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleOpenTicket(getTicketIdFromElement(detailBtn));
        return;
      }

      const copyBtn = getActionTarget(event, [
        "copy",
        "copy-ticket-id",
        "copy-id",
      ]);

      if (copyBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCopyTicketId(getTicketIdFromElement(copyBtn));
        return;
      }

      const pageBtn = getActionTarget(event, [
        "page",
        "go-page",
      ]);

      if (pageBtn) {
        event.preventDefault();

        const page = safeNumber(
          first(
            pageBtn.dataset?.page,
            pageBtn.getAttribute?.("data-page")
          ),
          incidenciasState.page || 1
        );

        goToPage(page);
        return;
      }

      const prevBtn = getActionTarget(event, [
        "prev-page",
        "pagination-prev",
      ]);

      if (prevBtn) {
        event.preventDefault();
        goPrevPage();
        return;
      }

      const nextBtn = getActionTarget(event, [
        "next-page",
        "pagination-next",
      ]);

      if (nextBtn) {
        event.preventDefault();
        goNextPage();
        return;
      }

      const exportBtn =
        getActionTarget(event, [
          "export",
          "export-csv",
        ]) ||
        event.target?.closest?.("#incidencias-export-btn");

      if (exportBtn) {
        event.preventDefault();
        handleExportCsv();
        return;
      }

      const createBtn =
        getActionTarget(event, [
          "create",
          "new",
          "new-ticket",
          "create-ticket",
          "create-incidencia",
        ]) ||
        event.target?.closest?.("#incidencias-create-btn");

      if (createBtn) {
        event.preventDefault();
        event.stopPropagation();

        await handleCreateIncidencia();
        return;
      }

      const retryBtn =
        getActionTarget(event, [
          "retry",
        ]) ||
        event.target?.closest?.("#incidencias-retry-btn");

      if (retryBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: false,
        });

        return;
      }

      const refreshBtn =
        getActionTarget(event, [
          "refresh",
          "reload",
        ]) ||
        event.target?.closest?.("#incidencias-refresh-btn");

      if (refreshBtn) {
        event.preventDefault();

        await reload({
          force: true,
          asRefresh: true,
        });
      }
    };

    const onChange = (event) => {
      if (destroyed) return;

      const pageSizeField =
        event.target?.closest?.("[data-incidencias-field='page-size']") ||
        event.target?.closest?.("[data-field='page-size']");

      if (pageSizeField) {
        changePageSize(pageSizeField.value);
      }
    };

    container.addEventListener("click", onClick);
    container.addEventListener("change", onChange);

    return () => {
      try {
        container.removeEventListener("click", onClick);
        container.removeEventListener("change", onChange);
      } catch {}
    };
  }

  function bindModalBridgeEvents() {
    const bus = AppCore?.events;

    if (!bus?.on) {
      return () => {};
    }

    const onRefresh = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);

      await handleRefreshTicketFromModal(
        payload.ticketId ||
          payload.id ||
          payload.detail?.ticketId ||
          payload.detail?.id ||
          ""
      );
    };

    const onCopy = async (event) => {
      if (destroyed) return;

      const payload = getEventPayload(event);

      await handleCopyTicketId(
        payload.ticketId ||
          payload.id ||
          payload.detail?.ticketId ||
          payload.detail?.id ||
          ""
      );
    };

    const onMutated = async () => {
      if (destroyed) return;

      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
    };

    try {
      bus.on("incidencias:modal:refresh", onRefresh);
      bus.on("incidencias:modal:copy", onCopy);

      bus.on("incidencias:create:success", onMutated);
      bus.on("incidencias:modal:updated", onMutated);
      bus.on("incidencias:ticket:updated", onMutated);
      bus.on("incidencias:upload:success", onMutated);
      bus.on("incidencias:comment:success", onMutated);
      bus.on("incidencias:reopen:success", onMutated);

      bus.on("app:ready", onReady);
      bus.on("app:boot:ready", onReady);
      bus.on("app:boot:complete", onReady);
      bus.on("router:rendered", onReady);
    } catch {}

    return () => {
      try { bus.off("incidencias:modal:refresh", onRefresh); } catch {}
      try { bus.off("incidencias:modal:copy", onCopy); } catch {}

      try { bus.off("incidencias:create:success", onMutated); } catch {}
      try { bus.off("incidencias:modal:updated", onMutated); } catch {}
      try { bus.off("incidencias:ticket:updated", onMutated); } catch {}
      try { bus.off("incidencias:upload:success", onMutated); } catch {}
      try { bus.off("incidencias:comment:success", onMutated); } catch {}
      try { bus.off("incidencias:reopen:success", onMutated); } catch {}

      try { bus.off("app:ready", onReady); } catch {}
      try { bus.off("app:boot:ready", onReady); } catch {}
      try { bus.off("app:boot:complete", onReady); } catch {}
      try { bus.off("router:rendered", onReady); } catch {}
    };
  }

  function bindWindowEvents() {
    const onMutated = async () => {
      if (destroyed) return;

      await reload({
        force: true,
        asRefresh: true,
        silent: true,
      });
    };

    const onReady = () => {
      flushPendingCreate();
    };

    try {
      window.addEventListener("incidencias:create:success", onMutated);
      window.addEventListener("incidencias:modal:updated", onMutated);
      window.addEventListener("incidencias:ticket:updated", onMutated);
      window.addEventListener("incidencias:upload:success", onMutated);
      window.addEventListener("incidencias:comment:success", onMutated);
      window.addEventListener("incidencias:reopen:success", onMutated);

      window.addEventListener("app:ready", onReady);
      window.addEventListener("app:boot:ready", onReady);
      window.addEventListener("app:boot:complete", onReady);
      window.addEventListener("router:rendered", onReady);
    } catch {}

    return () => {
      try {
        window.removeEventListener("incidencias:create:success", onMutated);
        window.removeEventListener("incidencias:modal:updated", onMutated);
        window.removeEventListener("incidencias:ticket:updated", onMutated);
        window.removeEventListener("incidencias:upload:success", onMutated);
        window.removeEventListener("incidencias:comment:success", onMutated);
        window.removeEventListener("incidencias:reopen:success", onMutated);

        window.removeEventListener("app:ready", onReady);
        window.removeEventListener("app:boot:ready", onReady);
        window.removeEventListener("app:boot:complete", onReady);
        window.removeEventListener("router:rendered", onReady);
      } catch {}
    };
  }

  function bind() {
    cleanupBindings();

    if (destroyed) return;

    const container = getContainer();
    const cleanups = [];

    cleanups.push(bindNativeActions(container));
    cleanups.push(bindModalBridgeEvents());
    cleanups.push(bindWindowEvents());

    bindingsCleanup = () => {
      for (const cleanup of cleanups) {
        try {
          cleanup?.();
        } catch {}
      }
    };
  }

  /* =========================================================
     PUBLIC
  ========================================================= */

  async function reload(options = {}) {
    if (destroyed) return api;

    const incomingOptions = safeObject(options);

    if (inflightReload) {
      queuedReloadOptions = {
        ...(queuedReloadOptions || {}),
        ...incomingOptions,
        force: Boolean(queuedReloadOptions?.force || incomingOptions.force),
        asRefresh: Boolean(queuedReloadOptions?.asRefresh || incomingOptions.asRefresh),
        silent: Boolean(queuedReloadOptions?.silent ?? incomingOptions.silent),
      };

      return inflightReload;
    }

    inflightReload = (async () => {
      let currentOptions = incomingOptions;

      do {
        queuedReloadOptions = null;

        await renderAndLoad(currentOptions);

        if (!destroyed) {
          bind();
        }

        currentOptions = queuedReloadOptions;
      } while (currentOptions && !destroyed);

      return api;
    })();

    try {
      return await inflightReload;
    } finally {
      inflightReload = null;
      queuedReloadOptions = null;
    }
  }

  async function init() {
    if (destroyed) {
      destroyed = false;
    }

    if (inflightInit) {
      return inflightInit;
    }

    if (initialized && !destroyed) {
      ensureBaseState();
      rerender();
      flushPendingCreate();
      return api;
    }

    initialized = true;

    inflightInit = (async () => {
      safeLog("init");

      hydrateBestEffort();

      await renderAndLoad({
        force: false,
        asRefresh: false,
        silent: false,
      });

      if (!destroyed) {
        bind();
      }

      flushPendingCreate();

      return api;
    })();

    try {
      return await inflightInit;
    } finally {
      inflightInit = null;
    }
  }

  function destroy() {
    destroyed = true;
    initialized = false;

    nextRenderToken();
    cleanupBindings();

    try {
      setOpeningTicketId("");
      setCreating(false);
      setRefreshing(false);
      setLoading(false);
    } catch {
      incidenciasState.openingTicketId = "";
      incidenciasState.creating = false;
      incidenciasState.refreshing = false;
      incidenciasState.loading = false;
    }

    pendingCreateRequest = false;
    queuedReloadOptions = null;
    inflightReload = null;

    safeLog("destroy");
  }

  /* =========================================================
     API
  ========================================================= */

  const api = {
    init,
    render: rerender,
    reload,
    destroy,

    openTicket: handleOpenTicket,
    copyTicketId: handleCopyTicketId,
    exportCsv: handleExportCsv,
    createIncidencia: handleCreateIncidencia,

    goToPage,
    goPrevPage,
    goNextPage,
    changePageSize,

    getItems: () => getItems(),
    getPageItems: () => getPaginationMeta(getItems()).items,
    getPagination: () => getPaginationMeta(getItems()),
    getTicketById: (ticketId = "") =>
      findIncidenciaById(getItems(), ticketId),

    getState: () => ({
      ...getIncidenciasStateSnapshot?.(),
      initialized,
      destroyed,
      hasInflightInit: Boolean(inflightInit),
      hasInflightReload: Boolean(inflightReload),
      hasQueuedReload: Boolean(queuedReloadOptions),
      pendingCreateRequest,
      lastApiPayloadHasItems: extractItemsFromPayload(lastApiPayload).length > 0,
    }),

    get initialized() {
      return initialized;
    },

    get destroyed() {
      return destroyed;
    },
  };

  return api;
})();

export default IncidenciasView;
