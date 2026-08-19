/* =========================================================
   Onion Support - Mobile Shell Compatibility Bridge
   Archivo: /src/features/mobile-shell/index.js

   La implementación canónica vive ahora en /src/ui/chrome/index.js.
   Este archivo se conserva temporalmente porque index.html ya lo carga
   antes de main.js. No contiene lógica propia.
========================================================= */

import AppChromeUI, {
  APP_CHROME_VERSION,
  initAppChrome,
  destroyAppChrome,
  getAppChromeSnapshot,
} from "../../ui/chrome/index.js";

export const MOBILE_SHELL_VERSION = APP_CHROME_VERSION;
export const MOBILE_SHELL = AppChromeUI;

export const initMobileShell = initAppChrome;
export const destroyMobileShell = destroyAppChrome;
export const getMobileShellSnapshot = getAppChromeSnapshot;

export default AppChromeUI;
