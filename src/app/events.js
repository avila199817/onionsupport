/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   Responsabilidades:
   - bind de eventos globales de la aplicación
   - sincronizar UI tras cambios de sesión
   - rerenderizar ruta al cambiar idioma
   - gestionar notificaciones de auth
   - reaccionar a eventos del router
========================================================= */

import { getCurrentPublicPath } from "./helpers.js";

export function bindAppEvents({
  AppCore,
  I18n,
  Toast,
  scope,
  syncUserUI,
  rerenderCurrentRoute,
  applyPostRenderLoaderPolicy,
}) {
  AppCore.cleanup.event(scope, "app:user:change", () => {
    syncUserUI?.(AppCore);
  });

  AppCore.cleanup.event(scope, "app:session:cleared", () => {
    syncUserUI?.(AppCore);
  });

  AppCore.cleanup.event(scope, "app:lang:change", ({ detail }) => {
    const lang = String(detail?.lang || I18n.getLang?.() || "es");

    AppCore.setState({
      lang,
    });

    document.documentElement.setAttribute("lang", lang);

    rerenderCurrentRoute?.();

    Toast?.success?.(
      I18n.t("settings.languageChanged", {}, "Idioma actualizado"),
      {
        title: I18n.t("settings.language", {}, "Idioma"),
        duration: 2200,
      }
    );

    AppCore.utils.log("Idioma cambiado.", {
      lang,
      route: getCurrentPublicPath(AppCore),
    });
  });

  AppCore.cleanup.event(scope, "auth:login:success", () => {
    syncUserUI?.(AppCore);

    Toast?.success?.("Sesión iniciada correctamente.", {
      title: "Bienvenido",
      duration: 2800,
    });
  });

  AppCore.cleanup.event(scope, "auth:logout:success", () => {
    Toast?.info?.("Sesión cerrada correctamente.", {
      title: "Sesión finalizada",
      duration: 2200,
    });
  });

  AppCore.cleanup.event(scope, "router:before-render", ({ detail }) => {
    AppCore.utils.log("Router before render:", {
      path: detail?.path || null,
      canonicalPath: detail?.canonicalPath || null,
      username: detail?.username || null,
    });
  });

  AppCore.cleanup.event(scope, "router:rendered", ({ detail }) => {
    const publicPath = getCurrentPublicPath(AppCore);

    AppCore.setPublicPath(publicPath);
    applyPostRenderLoaderPolicy?.();

    AppCore.events.emit("app:user-ui:sync", {
      route: publicPath,
    });

    AppCore.utils.log("Ruta renderizada:", {
      publicPath,
      canonicalPath: detail?.canonicalPath || detail?.path || null,
      username: detail?.username || null,
      found: Boolean(detail?.found),
      forbidden: Boolean(detail?.forbidden),
      lang: AppCore.state.lang,
    });
  });
}
