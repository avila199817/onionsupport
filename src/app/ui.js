/* =========================================================
   Onion SPA - App UI Systems
   Archivo: src/app/ui.js

   Responsabilidades:
   - sincronizar UI de usuario global
   - inicializar sistemas UI compartidos
   - registrar módulos UI en AppCore
   - enlazar refresco UI ante cambio de idioma
   - evitar roturas si falta AppCore o eventos
   - exponer bridge global de toast en AppCore
========================================================= */

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

function registerAppModule(
  AppCore,
  name,
  moduleRef
) {
  if (!AppCore?.modules) return;
  if (!name || !moduleRef) return;

  if (
    typeof AppCore.modules.has === "function" &&
    AppCore.modules.has(name)
  ) {
    return;
  }

  if (
    typeof AppCore.modules.register ===
    "function"
  ) {
    AppCore.modules.register(
      name,
      moduleRef
    );
  }
}

function bindToastBridge(AppCore, Toast) {
  if (!AppCore || !Toast) return;

  AppCore.showToast = (
    message = "",
    type = "info",
    options = {}
  ) => {
    const normalizedType = String(type || "info")
      .trim()
      .toLowerCase();

    switch (normalizedType) {
      case "success":
        return typeof Toast.success === "function"
          ? Toast.success(message, options)
          : Toast.show({
              ...options,
              type: "success",
              message,
            });

      case "error":
        return typeof Toast.error === "function"
          ? Toast.error(message, options)
          : Toast.show({
              ...options,
              type: "error",
              message,
            });

      case "warning":
        return typeof Toast.warning === "function"
          ? Toast.warning(message, options)
          : Toast.show({
              ...options,
              type: "warning",
              message,
            });

      case "loading":
        return typeof Toast.loading === "function"
          ? Toast.loading(message, options)
          : Toast.show({
              ...options,
              type: "loading",
              message,
            });

      case "info":
      default:
        return typeof Toast.info === "function"
          ? Toast.info(message, options)
          : Toast.show({
              ...options,
              type: "info",
              message,
            });
    }
  };
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

  registerAppModule(
    AppCore,
    "toast",
    Toast
  );

  registerAppModule(
    AppCore,
    "sidebar",
    SidebarUI
  );

  registerAppModule(
    AppCore,
    "topbar",
    TopbarUI
  );

  if (
    Toast &&
    typeof Toast.init === "function"
  ) {
    Toast.init();
    bindToastBridge(AppCore, Toast);
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
