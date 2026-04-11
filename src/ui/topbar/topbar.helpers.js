/* =========================================================
   Onion SPA - Topbar Helpers
   Archivo: src/ui/topbar.helpers.js

   Responsabilidades:
   - constantes base del topbar
   - helpers de texto y escape
   - normalización de paths
   - helpers de búsqueda y scoring
   - utilidades puras de resultados
========================================================= */

export const TOPBAR_SCOPE = "ui:topbar";
export const TOPBAR_SEARCH_SCOPE = "ui:topbar:search";

export const TOPBAR_SEARCH_CONFIG = Object.freeze({
  debounceMs: 220,
  minQueryLength: 1,
  maxResultsTotal: 24,
  maxResultsPerGroup: 6,
  cacheTtlMs: 20 * 1000,
  mobileBreakpoint: 900,
});

export function escapeHtml(AppCore, value = "") {
  if (AppCore?.utils?.escapeHtml) {
    return AppCore.utils.escapeHtml(String(value ?? ""));
  }

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeQuery(value = "") {
  return String(value || "").trim();
}

export function uniqBy(items = [], keyGetter) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    const key = keyGetter(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result;
}

export function safeNormalizePath(AppCore, path = "/") {
  try {
    if (typeof AppCore?.utils?.normalizePath === "function") {
      return AppCore.utils.normalizePath(path || "/");
    }
  } catch {
    /* noop */
  }

  const raw = String(path || "/").trim() || "/";
  if (raw === "/") return "/";

  const [pathname = "/", search = ""] = raw.split("?");
  const normalizedPath =
    pathname.replace(/\/{2,}/g, "/").replace(/\/+$/, "") || "/";

  return search ? `${normalizedPath}?${search}` : normalizedPath;
}

export function safeNormalizeCanonicalPath(AppCore, path = "/") {
  try {
    if (typeof AppCore?.utils?.normalizeCanonicalPath === "function") {
      return AppCore.utils.normalizeCanonicalPath(path || "/");
    }

    return safeNormalizePath(AppCore, path);
  } catch {
    return "/";
  }
}

export function getCurrentPublicPath(AppCore) {
  return safeNormalizePath(
    AppCore,
    `${window.location.pathname || "/"}${window.location.search || ""}`
  );
}

export function isMobileViewport(mobileBreakpoint = 900) {
  return window.matchMedia(`(max-width: ${mobileBreakpoint}px)`).matches;
}

export function getTypeLabel(type = "general") {
  const map = {
    cliente: "Clientes",
    clientes: "Clientes",
    user: "Usuarios",
    usuario: "Usuarios",
    usuarios: "Usuarios",
    factura: "Facturas",
    facturas: "Facturas",
    incidencia: "Incidencias",
    incidencias: "Incidencias",
    ticket: "Incidencias",
    tickets: "Incidencias",
    nav: "Navegación",
    route: "Navegación",
    routes: "Navegación",
    recent: "Recientes",
    recientes: "Recientes",
    general: "Resultados",
  };

  return map[String(type || "").toLowerCase()] || "Resultados";
}

export function getTypeIcon(type = "general") {
  const map = {
    cliente: "🏢",
    clientes: "🏢",
    user: "👤",
    usuario: "👤",
    usuarios: "👤",
    factura: "🧾",
    facturas: "🧾",
    incidencia: "🎫",
    incidencias: "🎫",
    ticket: "🎫",
    tickets: "🎫",
    nav: "📂",
    route: "📂",
    routes: "📂",
    recent: "🕘",
    recientes: "🕘",
    general: "🔎",
  };

  return map[String(type || "").toLowerCase()] || "🔎";
}

export function scoreTextMatch(text = "", query = "") {
  const t = normalizeText(text);
  const q = normalizeText(query);

  if (!t || !q) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 90;
  if (t.includes(` ${q}`)) return 70;
  if (t.includes(q)) return 50;
  return 0;
}

export function highlight(AppCore, text = "", query = "") {
  const safeText = String(text || "");
  const safeQuery = String(query || "").trim();

  if (!safeText || !safeQuery) {
    return escapeHtml(AppCore, safeText);
  }

  const normalizedSource = normalizeText(safeText);
  const normalizedNeedle = normalizeText(safeQuery);
  const index = normalizedSource.indexOf(normalizedNeedle);

  if (index === -1) {
    return escapeHtml(AppCore, safeText);
  }

  const start = safeText.slice(0, index);
  const middle = safeText.slice(index, index + safeQuery.length);
  const end = safeText.slice(index + safeQuery.length);

  return `${escapeHtml(AppCore, start)}<mark>${escapeHtml(
    AppCore,
    middle
  )}</mark>${escapeHtml(AppCore, end)}`;
}

export function scoreResult(item, query = "") {
  const titleScore = scoreTextMatch(item.title, query);
  const subtitleScore = scoreTextMatch(item.subtitle, query);
  const urlScore = scoreTextMatch(item.url, query);

  let typeBoost = 0;

  switch (String(item.type || "").toLowerCase()) {
    case "user":
    case "usuario":
    case "usuarios":
      typeBoost = 8;
      break;
    case "cliente":
    case "clientes":
      typeBoost = 7;
      break;
    case "ticket":
    case "tickets":
    case "incidencia":
    case "incidencias":
      typeBoost = 6;
      break;
    case "factura":
    case "facturas":
      typeBoost = 5;
      break;
    case "nav":
    case "route":
    case "routes":
      typeBoost = 3;
      break;
    default:
      typeBoost = 1;
  }

  return titleScore * 2 + subtitleScore + urlScore + typeBoost;
}

export function groupResults(results = []) {
  const groups = new Map();

  results.forEach((item) => {
    const key = String(item.type || "general").toLowerCase();

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(item);
  });

  return Array.from(groups.entries());
}
