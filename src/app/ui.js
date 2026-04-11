/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   Responsabilidades:
   - sincronizar UI de usuario global
   - inicializar sistemas UI compartidos
   - registrar módulos UI en AppCore
========================================================= */

import { registerModule } from "./helpers.js";

export function syncUserUI(AppCore) {
  AppCore.syncUserUI?.();

  AppCore.events.emit("app:user-ui:sync", {
    user: AppCore.state.user || null,
    authenticated: Boolean(AppCore.state.authenticated),
    role: AppCore.state.role || null,
  });
}

export function initUISystems({
  AppCore,
  Toast,
  SidebarUI,
  TopbarUI,
  state,
}) {
  if (state?.uiInitialized) return;

  registerModule(AppCore, "toast", Toast);
  registerModule(AppCore, "sidebar", SidebarUI);
  registerModule(AppCore, "topbar", TopbarUI);

  if (Toast && typeof Toast.init === "function") {
    Toast.init();
  }

  if (SidebarUI && typeof SidebarUI.init === "function") {
    SidebarUI.init();
  }

  if (TopbarUI && typeof TopbarUI.init === "function") {
    TopbarUI.init();
  }

  if (state) {
    state.uiInitialized = true;
  }
}
