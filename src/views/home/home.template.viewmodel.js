/* =========================================================
   Onion Support - Home Template · generated domain module
   Shared by /src/views/home/home.template.js
========================================================= */

import { userNameFromIdentity } from "../../core/user-identity.js";
import { DEFAULT_ROUTES, cleanText, initialsFrom, isObject, homeLabelKey, safeArray, safeImageSrc } from "./home.template.foundation.js";
import { clamp, finiteNumber } from "../../core/numbers.js";
import { firstNonEmpty, safeObject } from "../../core/objects.js";

export function buildVm(input = {}) {
  const data = isObject(input) ? input : {};
  const dashboard = isObject(data.dashboard) ? data.dashboard : data;
  const summary = isObject(dashboard.summary) ? dashboard.summary : {};
  const userCandidate = firstNonEmpty(data.user, dashboard.user, {});
  const user = isObject(userCandidate) ? userCandidate : {};

  const role = cleanText(
    firstNonEmpty(data.role, dashboard.role, user.role, user.rol, "user"),
    "user"
  ).toLowerCase();

  const admin =
    dashboard.admin === true ||
    homeLabelKey(role) === "admin" ||
    homeLabelKey(user.role) === "admin";

  const routes = {
    ...DEFAULT_ROUTES,
    ...(isObject(data.routes) ? data.routes : {}),
  };

  const incidencias = safeArray(firstNonEmpty(dashboard.incidencias, dashboard.tickets, []));
  const facturas = safeArray(firstNonEmpty(dashboard.facturas, dashboard.invoices, []));
  const activity = safeArray(firstNonEmpty(dashboard.activity, dashboard.actividad, dashboard.movimientos, []));

  const displayName = userNameFromIdentity(user, firstNonEmpty(user.username, data.displayName, "Usuario"));

  function summaryCount(...keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(summary, key)) {
        return finiteNumber(summary[key], null);
      }
    }
    return null;
  }

  /* SIN VALOR NO SIGNIFICA LO MISMO QUE NO SE PUDO LEER.
   *
   * Cuando un dominio no contesta, el panel se compone igual con los demás y
   * deja esa cuenta sin valor, pero apunta el aviso con su dominio. Aquí --y
   * sólo aquí-- se cruza una cosa con la otra, para que la tarjeta pueda decir
   * «no se pudo cargar» y ofrecer reintentar, en vez de una raya muda que no
   * se distingue de un dato que de verdad no existe.
   *
   * Los avisos de un dominio pueden llegar con su sufijo (`facturas_stats`),
   * así que se compara por el dominio y sus ramas, no por igualdad exacta. */
  const failedDomains = safeArray(dashboard.warnings)
    .map((warning) => cleanText(isObject(warning) ? warning.domain : "", ""))
    .filter(Boolean);

  const domainFailed = (name) => failedDomains.some(
    (domain) => domain === name || domain.startsWith(`${name}_`)
  );

  const sinConfirmar = safeObject(dashboard.unknownCounts);

  const totalInvoiced = finiteNumber(
    firstNonEmpty(
      summary.totalInvoiced,
      summary.totalAmount,
      summary.grossAmount,
      summary.totalFacturado,
      null
    ),
    null
  );

  let paidTotal = finiteNumber(
    firstNonEmpty(
      summary.paidTotal,
      summary.paidAmount,
      summary.totalPagado,
      null
    ),
    null
  );

  let outstandingAmount = finiteNumber(
    firstNonEmpty(
      summary.outstandingAmount,
      summary.pendingAmount,
      summary.totalPendiente,
      null
    ),
    null
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
    firstNonEmpty(
      summary.currency,
      summary.moneda,
      facturas[0]?.currency,
      facturas[0]?.moneda,
      "EUR"
    ),
    "EUR"
  ).toUpperCase();

  const updatedAt = firstNonEmpty(
    dashboard.updatedAt,
    dashboard.loadedAt,
    dashboard.cache?.loadedAt,
    data.updatedAt,
    ""
  );

  const invoiceStatsAvailable =
    summary.invoiceStatsAvailable === true &&
    totalInvoiced !== null;

  const onboardingCandidate = firstNonEmpty(
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
      name: displayName,
      displayName,
      /* Las iniciales nacen del nombre canónico, nunca de un campo
         precalculado por otro sistema. */
      initials: initialsFrom(displayName),
      avatarUrl: safeImageSrc(
        firstNonEmpty(
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
    error: cleanText(firstNonEmpty(data.error, dashboard.error, ""), ""),
    stale: dashboard.stale === true,
    partial: dashboard.partial === true,
    warnings: safeArray(dashboard.warnings),
    onboarding,
    onboardingLoaded: data.onboardingLoaded === true,
    onboardingSaving: data.onboardingSaving === true,
    onboardingError: cleanText(data.onboardingError, ""),
    counts: {
      incidencias: summaryCount("incidencias", "tickets"),
      facturas: summaryCount("facturas", "invoices"),
      clientes: admin ? summaryCount("clientes", "clients") : null,
      usuarios: admin ? summaryCount("usuarios", "users") : null,
      totalInvoiced,
      currency,
      invoiceStatsAvailable,
      failed: {
        incidencias: domainFailed("incidencias"),
        facturas: domainFailed("facturas"),
        clientes: admin && domainFailed("clientes"),
        usuarios: admin && domainFailed("usuarios"),
      },
      /* Sin confirmar NO es lo mismo que caído: el dominio contestó y su lista
         sirve; lo que no está confirmado es el recuento. Lo declara el panel. */
      unknown: {
        incidencias: sinConfirmar.incidencias === true,
        facturas: sinConfirmar.facturas === true,
        clientes: admin && sinConfirmar.clientes === true,
        usuarios: admin && sinConfirmar.usuarios === true,
      },
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
