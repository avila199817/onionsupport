/* =========================================================
   Onion SPA - App Warmup
   Archivo: src/app/warmup.js

   Responsabilidades:
   - ejecutar diagnóstico inicial no bloqueante
   - registrar información útil de sesión y estado
   - facilitar trazabilidad del arranque
========================================================= */

export async function warmup(AppCore) {
  AppCore.utils.log("Warmup app iniciado.");
  AppCore.utils.log("API configurada:", AppCore.config.apiBase);

  if (AppCore.state.token) {
    AppCore.utils.log("Token detectado en storage.");
  } else {
    AppCore.utils.log("No hay token en storage.");
  }

  if (AppCore.state.user?.username) {
    AppCore.utils.log("Username detectado:", AppCore.state.user.username);
  }

  AppCore.utils.log("Estado app:", {
    authenticated: AppCore.state.authenticated,
    role: AppCore.state.role,
    route: AppCore.state.route,
    publicPath: AppCore.state.publicPath,
    theme: AppCore.state.theme,
    lang: AppCore.state.lang,
  });
}
