/* =========================================================
   Onion SPA - App Warmup
   Archivo: src/app/warmup.js

   Responsabilidades:
   - ejecutar diagnóstico inicial seguro
   - registrar estado real tras restoreSession
   - facilitar trazabilidad del arranque
   - cero side effects
========================================================= */

export async function warmup(
  AppCore
) {
  if (!AppCore) return;

  const log =
    AppCore?.utils?.log ||
    console.log;

  const state =
    AppCore.state || {};

  const config =
    AppCore.config || {};

  log(
    "Warmup app iniciado."
  );

  log(
    "API configurada:",
    config.apiBase || null
  );

  log(
    "Diagnóstico sesión:",
    {
      hasToken: Boolean(
        state.token
      ),

      authenticated:
        Boolean(
          state.authenticated
        ),

      username:
        state.user
          ?.username ||
        state.user?.email ||
        null,

      role:
        state.role || null,
    }
  );

  log(
    "Estado app:",
    {
      route:
        state.route || "/",

      publicPath:
        state.publicPath ||
        "/",

      theme:
        state.theme ||
        "dark",

      lang:
        state.lang || "es",

      booted:
        Boolean(
          state.booted
        ),

      booting:
        Boolean(
          state.booting
        ),
    }
  );
}
