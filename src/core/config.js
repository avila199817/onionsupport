/* =========================================================
   Onion SPA - Core Config
   Archivo: src/core/config.js

   Responsabilidades:
   - centralizar configuración global del núcleo
   - exponer rutas base
   - exponer claves de storage
   - exponer flags de auth y UI
========================================================= */

export const config = {
  appName: "Onion Support",
  version: "2.1.0",
  debug: true,

  apiBase: "https://api.onionit.net",
  requestTimeout: 15000,
  requestRetries: 0,

  defaultLang: "es",
  defaultTheme: "dark",

  storagePrefix: "onion",

  routes: {
    login: "/login",
    home: "/",
  },

  storageKeys: {
    token: "token",
    user: "user",
    theme: "theme",
    lang: "lang",
    sidebarOpen: "sidebarOpen",
    lastPublicPath: "lastPublicPath",
  },

  legacyStorageKeys: {
    token: "onion_token",
    userSlug: "onion_user_slug",
    userName: "onion_user_name",
    role: "onion_role",
    tempToken: "onion_temp_token",
  },

  ui: {
    themeColorDark: "#0a0c11",
    themeColorLight: "#f4f7fb",
  },

  auth: {
    bearerPrefix: "Bearer",
    publicApiPaths: [
      "/api/auth/login",
      "/api/auth/refresh",
      "/api/auth/reset-password-request",
      "/api/auth/reset-password-confirm",
      "/api/auth/activate/first-user",
      "/api/auth/2fa/login",
      "/api/auth/_health",
    ],
  },
};
