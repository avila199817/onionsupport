/* =========================================================
   Onion SPA - App I18n
   Archivo: src/app/i18n.js

   Responsabilidades:
   - inicializar i18n de la aplicación
   - sincronizar idioma activo con AppCore
   - aplicar atributo lang al documento
   - rerenderizar la ruta actual al cambiar idioma
========================================================= */

import {
  getCurrentPublicPath,
  registerModule,
} from "./helpers.js";

export function syncLangState(AppCore, I18n) {
  try {
    const lang = I18n.getLang?.() || AppCore.state.lang || "es";

    AppCore.setState({
      lang,
    });

    document.documentElement.setAttribute("lang", lang);

    return lang;
  } catch {
    const fallbackLang =
      AppCore.state.lang || AppCore.config.defaultLang || "es";

    AppCore.setState({
      lang: fallbackLang,
    });

    document.documentElement.setAttribute("lang", fallbackLang);

    return fallbackLang;
  }
}

export function initI18n({
  AppCore,
  I18n,
  state,
}) {
  if (state?.i18nInitialized) {
    syncLangState(AppCore, I18n);
    return;
  }

  try {
    I18n.boot?.();
  } catch (error) {
    AppCore.utils.warn(
      "I18n.boot falló; se continuará con fallback.",
      error
    );
  }

  syncLangState(AppCore, I18n);
  registerModule(AppCore, "i18n", I18n);

  if (state) {
    state.i18nInitialized = true;
  }

  AppCore.utils.log("I18n inicializado.", {
    lang: AppCore.state.lang,
    available: I18n?.getAvailable?.() || [],
  });
}

export function rerenderCurrentRoute({
  AppCore,
  Router,
  I18n,
  applyPostRenderLoaderPolicy,
  syncUserUI,
}) {
  const currentPath = getCurrentPublicPath(AppCore);

  AppCore.utils.log("Rerender por cambio de idioma.", {
    path: currentPath,
    lang: I18n?.getLang?.() || AppCore.state.lang,
  });

  Router.render(currentPath, {
    skipHistory: true,
    replaceState: true,
    force: true,
  });

  AppCore.setPublicPath(currentPath);
  applyPostRenderLoaderPolicy?.();
  syncUserUI?.();
}
