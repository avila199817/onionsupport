# Mobile Shell — retirado

`Mobile Shell` ya no existe como implementación ni como autoridad independiente del layout.

Sus responsabilidades fueron absorbidas por **App Chrome** y el bridge temporal `src/features/mobile-shell/index.js` ha sido eliminado en UI System V4.

La autoridad canónica es:

- `src/ui/chrome/template.js` — estructura compartida, backdrop y trigger móvil;
- `src/ui/chrome/index.js` — comportamiento responsive, apertura/cierre, foco e interacción;
- `src/css/layout/chrome.css` — geometría completa de Topbar + Sidebar + main/tablehead;
- `docs/UI_CHROME.md` — contrato de arquitectura y criterios de aceptación.

`index.html` carga directamente `src/ui/chrome/index.js` antes de `main.js`. No existe un segundo controlador, bridge JS ni stylesheet `mobile-shell.css`.

No añadir nuevas reglas, listeners, features o documentación de layout bajo el concepto `Mobile Shell`. Cualquier cambio transversal de Topbar + Sidebar pertenece a App Chrome.
