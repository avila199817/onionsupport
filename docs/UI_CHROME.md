# Onion Support — App Chrome V4

Topbar y Sidebar conservan sus controladores funcionales, pero **no son dos piezas de layout independientes**. Forman una única superficie `App Chrome` y toda la geometría compartida pertenece a una sola autoridad.

## Autoridades

- `ui/topbar/**`: título, búsqueda y resultados. No decide offsets globales.
- `ui/sidebar/**`: navegación, cuenta y contenido lateral. No decide la huella global del shell.
- `ui/chrome/template.js`: estructura compartida, backdrop y trigger móvil.
- `ui/chrome/index.js`: coordinación responsive, apertura/cierre, foco e interacción.
- `css/layout/chrome.css`: **única autoridad geométrica** de Topbar + Sidebar + main/tablehead.
- `index.html`: carga directamente `ui/chrome/index.js` antes de `main.js`.

No existe `mobile-shell.css` ni `features/mobile-shell/index.js`. No debe reintroducirse un bridge entre el arranque y App Chrome.

## Por qué existe App Chrome

La arquitectura anterior repartía geometría entre `topbar.css`, `sidebar.css`, `core/layout.css` y una capa Mobile Shell. Eso permitía estados en los que Sidebar y Topbar calculaban posiciones distintas y provocaba saltos visibles al abrir/cerrar navegación en móvil.

App Chrome elimina ese problema. `chrome.css` se importa una sola vez al final de `layer(layout)` y **no declara un `@layer` interno**. Topbar, Sidebar, main y tablehead consumen el mismo contrato geométrico.

## Mobile `<= 900px`

- `--chrome-sidebar-offset` es siempre `0px`.
- Topbar, `main-content` y tablehead no cambian de posición al abrir/cerrar navegación.
- Sidebar es un drawer overlay de ancho constante y sólo anima `transform/opacity`.
- El único trigger móvil vive dentro del Topbar.
- El toggle interno del Sidebar se reserva a desktop.
- El backdrop glass captura outside-click sin click-through.
- El fondo queda inerte y sin scroll mientras el drawer está abierto.
- `Escape`, historial, navegación y pulsación exterior cierran el drawer.
- Safe areas y viewport dinámico forman parte del contrato.

## Desktop

Desktop conserva Sidebar persistente/colapsable. Sidebar, Topbar, main y tablehead consumen el mismo `--chrome-sidebar-offset`, por lo que cambiar entre `open`, `collapsed` y `hidden` mueve el shell como una unidad.

## Regla de cascada

`src/css/app.css` importa las piezas visuales y deja `chrome.css` como última autoridad dentro de `layer(layout)`:

```css
@import url("./layout/sidebar.css") layer(layout);
@import url("./layout/topbar.css") layer(layout);
@import url("./layout/chrome.css") layer(layout);
```

`chrome.css` no puede contener `@layer layout { ... }`. Hacerlo crearía una subcapa con prioridad distinta y volvería a repartir la autoridad.

## Criterios de aceptación

1. En móvil cerrado no existe rail lateral ni hueco a la izquierda del Topbar.
2. Abrir/cerrar Sidebar no produce salto horizontal del Topbar, main o tablehead.
3. El drawer entra por encima de la aplicación y no desplaza contenido.
4. El backdrop cubre también la zona del Topbar situada fuera del drawer.
5. Pulsar el backdrop cierra sin activar controles situados detrás.
6. Dark/light, safe-area, reduced motion, reduced transparency y forced colors tienen salida definida.
7. Las vistas de dominio no compensan Sidebar/Topbar con offsets propios.
8. No existe bridge Mobile Shell ni hoja de layout paralela.

## UI System V4

La barrida V4 completa la consolidación:

- `index.html` carga App Chrome directamente;
- se elimina el bridge `features/mobile-shell`;
- Repository Integrity impide que reaparezcan `mobile-shell.css` o el bridge JS;
- cualquier nueva necesidad transversal del chrome debe ampliar estas autoridades canónicas, no crear una segunda implementación.

## Regla final

> Topbar y Sidebar pueden tener componentes internos separados; su geometría y su interacción transversal pertenecen a una sola pieza: App Chrome.
