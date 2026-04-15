/* =========================================================
   Onion SPA - App Warmup
   Archivo: src/app/warmup.js

   Responsabilidades:
   - ejecutar diagnóstico inicial seguro
   - registrar estado real tras restoreSession
   - facilitar trazabilidad del arranque
   - cero side effects
   - snapshot útil para debug enterprise

   HARDENING PRO:
   - logs consistentes
   - sin romper si faltan módulos
   - tolerancia total a estructuras parciales
   - métricas de sesión y shell
========================================================= */

export async function warmup(
  AppCore
) {
  if (!AppCore) {
    return false;
  }

  const log =
    AppCore?.utils?.log ||
    console.log;

  const state =
    AppCore?.state || {};

  const config =
    AppCore?.config || {};

  const snapshot = {
    apiBase:
      config.apiBase || null,

    authenticated:
      Boolean(
        state.authenticated
      ),

    hasToken:
      Boolean(
        state.token
      ),

    username:
      state.user?.username ||
      state.user?.email ||
      state.user?.name ||
      null,

    role:
      state.role || null,

    route:
      state.route || "/",

    publicPath:
      state.publicPath || "/",

    theme:
      state.theme || "dark",

    lang:
      state.lang || "es",

    sidebarOpen:
      typeof state.sidebarOpen ===
      "boolean"
        ? state.sidebarOpen
        : null,

    booting:
      Boolean(
        state.booting
      ),

    booted:
      Boolean(
        state.booted
      ),

    loading:
      Boolean(
        state.loading
      ),
  };

  try {
    log(
      "Warmup app iniciado."
    );

    log(
      "Diagnóstico inicial:",
      snapshot
    );

    if (
      snapshot.authenticated &&
      !snapshot.username
    ) {
      log(
        "Warmup aviso:",
        "Sesión autenticada sin username visible."
      );
    }

    if (
      !snapshot.apiBase
    ) {
      log(
        "Warmup aviso:",
        "apiBase no configurada."
      );
    }

    return snapshot;
  } catch {
    return snapshot;
  }
}

export default warmup;
