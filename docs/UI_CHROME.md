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

El fondo queda `inert` cuando el navegador lo soporta; además el teclado queda contenido en el drawer como fallback. `Escape` cierra y devuelve foco al trigger. Navegación, historial y backdrop también cierran el drawer.

El ancho del Sidebar móvil permanece constante y la entrada/salida usa `transform` y `opacity`, evitando reflow lateral de la aplicación. El viejo ancho `collapsed` no participa en la composición móvil.

## Desktop

Desktop mantiene el Sidebar persistente/colapsable y el Topbar desplazado según la anchura efectiva del Sidebar. El toggle interno de Sidebar pertenece exclusivamente a esta composición desktop.

## Criterios de aceptación

1. No existe rail lateral en móvil cerrado.
2. El botón hamburguesa vive dentro del Topbar y respeta safe-area.
3. Abrir/cerrar navegación no desplaza Topbar ni `main-content`.
4. El drawer muestra la navegación y cuenta completas.
5. El resto del viewport queda glass/blur, sin interacción ni scroll de fondo.
6. Pulsar fuera cierra sin activar el control situado detrás.
7. `Escape` cierra y restaura foco; `Tab` no escapa del drawer abierto.
8. Dark/light, reduced motion, reduced transparency y forced colors tienen salida definida.

## Regla

La lógica de dominio nunca debe importar `ui/chrome/template.js`. App Chrome es infraestructura visual y de interacción transversal, no un servicio de negocio.
