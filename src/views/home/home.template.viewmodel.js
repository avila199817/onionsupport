/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

import {
  DEFAULT_ROUTES,
  clamp,
  cleanText,
  first,
  initialsFrom,
  isObject,
  normalizeKey,
  number,
  optionalNumber,
  safeArray,
  safeImageSrc,
} from "./home.template.foundation.js";

export function buildVm(input = {}) {
  const data = isObject(input) ? input : {};
  const dashboard = isObject(data.dashboard) ? data.dashboard : data;
  const summary = isObject(dashboard.summary) ? dashboard.summary : {};
  const userCandidate = first(data.user, dashboard.user, {});
  const user = isObject(userCandidate) ? userCandidate : {};

  const role = cleanText(
    first(data.role, dashboard.role, user.role, user.rol, "user"),
    "user"
  ).toLowerCase();

  const admin =
    dashboard.admin === true ||
    normalizeKey(role) === "admin" ||
    normalizeKey(user.role) === "admin";

  const routes = {
    ...DEFAULT_ROUTES,
    ...(isObject(data.routes) ? data.routes : {}),
  };

  const incidencias = safeArray(first(dashboard.incidencias, dashboard.tickets, []));
  const facturas = safeArray(first(dashboard.facturas, dashboard.invoices, []));
  const activity = safeArray(first(dashboard.activity, dashboard.actividad, dashboard.movimientos, []));

  const displayName = cleanText(
    first(
      user.displayName,
      user.name,
      user.fullName,
      user.nombre,
      user.username,
      data.displayName
    ),
    "Usuario"
  );

  const totalInvoiced = optionalNumber(
    first(
      summary.totalInvoiced,
      summary.totalAmount,
      summary.grossAmount,
      summary.totalFacturado,
      null
    )
  );

  let paidTotal = optionalNumber(
    first(
      summary.paidTotal,
      summary.paidAmount,
      summary.totalPagado,
      null
    )
  );

  let outstandingAmount = optionalNumber(
    first(
      summary.outstandingAmount,
      summary.pendingAmount,
      summary.totalPendiente,
      null
    )
  );

  if (totalInvoiced !== null) {
    if (paidTotal === null && outstandingAmount !== null) {
      paidTotal = Math.max(0, totalInvoiced - outstandingAmount);
    }

    if (outstandingAmount === null && paidTotal !== null) {
      outstandingAmount = Math.max(0, totalInvoiced - paidTotal);
    }
  }

  const collectionRate =
    totalInvoiced !== null &&
    totalInvoiced > 0 &&
    paidTotal !== null
      ? clamp((paidTotal / totalInvoiced) * 100, 0, 100)
      : null;

  const currency = cleanText(
    first(
      summary.currency,
      summary.moneda,
      facturas[0]?.currency,
      facturas[0]?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  const updatedAt = first(
    dashboard.updatedAt,
    dashboard.loadedAt,
    dashboard.cache?.loadedAt,
    data.updatedAt,
    ""
  );

  const invoiceStatsAvailable =
    summary.invoiceStatsAvailable === true &&
    totalInvoiced !== null;

  const onboardingCandidate = first(
    data.onboarding,
    dashboard.onboarding,
    user.onboarding,
    {}
  );

  const onboarding = isObject(onboardingCandidate)
    ? { ...onboardingCandidate }
    : {};

  return {
    user: {
      ...user,
      displayName,
      initials: cleanText(user.initials, initialsFrom(displayName)),
      avatarUrl: safeImageSrc(
        first(
          user.avatarUrl,
          user.avatar,
          user.picture,
          user.photoUrl,
          user.photoURL,
          user.imageUrl,
          ""
        )
      ),
    },
    role,
    admin,
    incidencias,
    facturas,
    activity,
    routes,
    updatedAt,
    loading: data.loading === true,
    refreshing: data.refreshing === true,
    error: cleanText(first(data.error, dashboard.error, ""), ""),
    stale: dashboard.stale === true,
    partial: dashboard.partial === true,
    warnings: safeArray(dashboard.warnings),
    onboarding,
    onboardingLoaded: data.onboardingLoaded === true,
    onboardingSaving: data.onboardingSaving === true,
    onboardingError: cleanText(data.onboardingError, ""),
    counts: {
      incidencias: number(first(summary.incidencias, summary.tickets, incidencias.length, 0), 0),
      facturas: number(first(summary.facturas, summary.invoices, facturas.length, 0), 0),
      clientes: admin ? number(first(summary.clientes, summary.clients, 0), 0) : 0,
      usuarios: admin ? number(first(summary.usuarios, summary.users, 0), 0) : 0,
      totalInvoiced,
      currency,
      invoiceStatsAvailable,
    },
    billing: {
      available: invoiceStatsAvailable,
      totalInvoiced,
      paidTotal,
      outstandingAmount,
      collectionRate,
      currency,
    },
  };
}

/* =========================================================
   SHARED PARTS
========================================================= */
