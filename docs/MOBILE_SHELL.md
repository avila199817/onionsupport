# Mobile Shell — retirado como autoridad

Desde App Chrome V3, `Mobile Shell` ya no es una pieza independiente del layout.

La autoridad canónica es:

- `src/ui/chrome/template.js` — estructura visual compartida;
- `src/ui/chrome/index.js` — comportamiento responsive;
- `src/css/layout/chrome.css` — geometría completa del chrome;
- `docs/UI_CHROME.md` — contrato de arquitectura y aceptación.

`src/features/mobile-shell/index.js` se conserva únicamente como puente de compatibilidad para el arranque actual y no contiene lógica propia.

No añadir nuevas reglas, listeners o documentación de layout bajo el concepto `Mobile Shell`. Cualquier cambio de Topbar + Sidebar pertenece a App Chrome.
