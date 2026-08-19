# Onion Support — App Chrome

Topbar y Sidebar son componentes funcionales independientes, pero pertenecen a una única superficie de aplicación: `App Chrome`.

## Responsabilidades

- `ui/topbar/**`: título, búsqueda y resultados.
- `ui/sidebar/**`: navegación, cuenta y estado open/collapsed.
- `ui/chrome/template.js`: estructura visual compartida, backdrop y trigger móvil.
- `features/mobile-shell/index.js`: coordinación del drawer móvil usando la API pública de `SidebarUI`.
- `css/layout/mobile-shell.css`: geometría responsive del chrome.

Esta separación evita acoplar `TopbarUI` con `SidebarUI` y, al mismo tiempo, elimina la falsa idea de que en móvil existen dos columnas de chrome independientes.

## Mobile

A `<= 900px`, Sidebar tiene huella espacial cero cuando está cerrado. El único trigger de navegación es hijo del Topbar. Al abrirlo, Sidebar se superpone como drawer y un backdrop glass real cubre el resto del viewport. El backdrop captura la pulsación exterior y cierra el drawer sin click-through.

## Desktop

Desktop mantiene el Sidebar persistente/colapsable y el Topbar desplazado según la anchura efectiva del Sidebar. El toggle interno de Sidebar pertenece exclusivamente a esta composición desktop.

## Regla

La lógica de dominio nunca debe importar `ui/chrome/template.js`. App Chrome es infraestructura visual y de interacción transversal, no un servicio de negocio.
