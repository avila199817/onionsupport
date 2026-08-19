/* =========================================================
   Onion Support - App Chrome
   Archivo: /src/ui/chrome/index.js

   Boundary público de la estructura compartida Topbar + Sidebar.
   La interacción móvil sigue perteneciendo a features/mobile-shell.
========================================================= */

export {
  APP_CHROME_TEMPLATE_VERSION,
  AppChromeTemplate,
  createTopbarMenuToggle,
  createChromeBackdrop,
  ensureAppChromeTemplate,
  getAppChromeTemplateRefs,
  setAppChromeTemplateState,
} from "./template.js";

export { AppChromeTemplate as default } from "./template.js";
