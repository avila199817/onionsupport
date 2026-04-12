/* =========================================================
   Onion SPA - App Events
   Archivo: src/app/events.js

   Responsabilidades:
   - bind eventos globales app
   - sincronizar UI tras sesión
   - rerender ruta al cambiar idioma
   - gestionar notificaciones auth
   - reaccionar eventos router
========================================================= */

import {
  getCurrentPublicPath,
} from "./helpers.js";

export function bindAppEvents({
  AppCore,
  I18n,
  Toast,
  scope,
  syncUserUI,
  rerenderCurrentRoute,
  applyPostRenderLoaderPolicy,
}) {
  if (!AppCore?.cleanup?.event) {
    return;
  }

  /* ======================================================
     USER / SESSION
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "app:user:change",
    () => {
      syncUserUI?.(
        AppCore
      );
    }
  );

  AppCore.cleanup.event(
    scope,
    "app:session:cleared",
    () => {
      syncUserUI?.(
        AppCore
      );
    }
  );

  /* ======================================================
     LANGUAGE
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "app:lang:change",
    ({
      detail,
    }) => {
      const lang =
        String(
          detail?.lang ||
            I18n?.getLang?.() ||
            "es"
        ).trim() ||
        "es";

      AppCore.setState({
        lang,
      });

      if (
        typeof document !==
        "undefined"
      ) {
        document.documentElement.setAttribute(
          "lang",
          lang
        );
      }

      rerenderCurrentRoute?.();

      Toast?.success?.(
        I18n?.t?.(
          "settings.languageChanged",
          {},
          "Idioma actualizado"
        ) ||
          "Idioma actualizado",
        {
          title:
            I18n?.t?.(
              "settings.language",
              {},
              "Idioma"
            ) || "Idioma",
          duration: 2200,
        }
      );

      AppCore.utils.log(
        "Idioma cambiado.",
        {
          lang,
          route:
            getCurrentPublicPath(
              AppCore
            ),
        }
      );
    }
  );

  /* ======================================================
     AUTH
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "auth:login:success",
    () => {
      syncUserUI?.(
        AppCore
      );

      Toast?.success?.(
        "Sesión iniciada correctamente.",
        {
          title:
            "Bienvenido",
          duration: 2800,
        }
      );
    }
  );

  AppCore.cleanup.event(
    scope,
    "auth:logout:success",
    () => {
      syncUserUI?.(
        AppCore
      );

      Toast?.info?.(
        "Sesión cerrada correctamente.",
        {
          title:
            "Sesión finalizada",
          duration: 2200,
        }
      );
    }
  );

  /* ======================================================
     ROUTER
  ====================================================== */
  AppCore.cleanup.event(
    scope,
    "router:before-render",
    ({
      detail,
    }) => {
      AppCore.utils.log(
        "Router before render:",
        {
          path:
            detail?.path ??
            null,
          canonicalPath:
            detail?.canonicalPath ??
            null,
          username:
            detail?.username ??
            null,
        }
      );
    }
  );

  AppCore.cleanup.event(
    scope,
    "router:rendered",
    ({
      detail,
    }) => {
      const publicPath =
        getCurrentPublicPath(
          AppCore
        );

      AppCore.setPublicPath(
        publicPath
      );

      applyPostRenderLoaderPolicy?.();

      syncUserUI?.(
        AppCore
      );

      AppCore.events.emit(
        "app:user-ui:sync",
        {
          route:
            publicPath,
        }
      );

      AppCore.utils.log(
        "Ruta renderizada:",
        {
          publicPath,
          canonicalPath:
            detail?.canonicalPath ??
            detail?.path ??
            null,
          username:
            detail?.username ??
            null,
          found:
            Boolean(
              detail?.found
            ),
          forbidden:
            Boolean(
              detail?.forbidden
            ),
          lang:
            AppCore.state
              .lang,
        }
      );
    }
  );
}
