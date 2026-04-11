/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   Responsabilidades:
   - sincronizar UI de usuario global
   - inicializar sistemas UI compartidos
   - registrar módulos UI en AppCore
   - enlazar refresco UI ante cambio de idioma
   - evitar roturas si falta AppCore o eventos
========================================================= */

import { registerModule } from "./helpers.js";

export function syncUserUI(AppCore) {
  if (!AppCore) {
    console.warn(
      "[Onion App UI] syncUserUI llamado sin AppCore"
    );
    return;
  }

  if (
    typeof AppCore.syncUserUI === "function"
  ) {
    AppCore.syncUserUI();
  }

  AppCore.events?.emit?.(
    "app:user-ui:sync",
    {
      user:
        AppCore.state?.user || null,
      authenticated: Boolean(
        AppCore.state?.authenticated
      ),
      role:
        AppCore.state?.role || null,
    }
  );
}

export function bindAppLanguageSync(
  AppCore
) {
  if (!AppCore?.events?.on) return;

  if (AppCore.__appLangUiBound) return;

  AppCore.events.on(
    "app:lang:change",
    () => {
      syncUserUI(AppCore);

      if (
        AppCore.dom?.topbarTitle &&
        typeof document !==
          "undefined" &&
        document.title
      ) {
        AppCore.dom.topbarTitle.textContent =
          document.title;
      }
    }
  );

  AppCore.__appLangUiBound = true;
}

export function initUISystems({
  AppCore,
  Toast,
  SidebarUI,
  TopbarUI,
  state,
}) {
  if (!AppCore) {
    console.warn(
      "[Onion App UI] initUISystems llamado sin AppCore"
    );
    return;
  }

  if (state?.uiInitialized) return;

  registerModule(
    AppCore,
    "toast",
    Toast
  );
  registerModule(
    AppCore,
    "sidebar",
    SidebarUI
  );
  registerModule(
    AppCore,
    "topbar",
    TopbarUI
  );

  if (
    Toast &&
    typeof Toast.init === "function"
  ) {
    Toast.init();
  }

  if (
    SidebarUI &&
    typeof SidebarUI.init ===
      "function"
  ) {
    SidebarUI.init();
  }

  if (
    TopbarUI &&
    typeof TopbarUI.init ===
      "function"
  ) {
    TopbarUI.init();
  }

  bindAppLanguageSync(AppCore);
  syncUserUI(AppCore);

  if (state) {
    state.uiInitialized = true;
  }
}
