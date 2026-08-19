# Onion Support — App Chrome V3

Topbar y Sidebar siguen teniendo controladores funcionales independientes, pero la geometría ya no pertenece a ninguno de los dos. Ambos forman una única superficie `App Chrome`.

## Autoridades

- `ui/topbar/**`: título, búsqueda y resultados. No decide offsets del shell.
- `ui/sidebar/**`: navegación, cuenta y contenido lateral. No decide la huella móvil global.
- `ui/chrome/template.js`: root visual compartido, backdrop y trigger móvil.
- `ui/chrome/index.js`: coordinación responsive, apertura/cierre, foco e interacción.
- `css/layout/chrome.css`: **única autoridad geométrica** de Topbar + Sidebar + main/tablehead.
- `features/mobile-shell/index.js`: puente temporal de compatibilidad sin lógica propia.

## Por qué V3

La versión anterior todavía dejaba tres fuentes de geometría activas al mismo tiempo: `topbar.css`, `sidebar.css` y `mobile-shell.css`. Además `mobile-shell.css` se importaba mediante `layer(layout)` y volvía a declarar internamente `@layer layout`, creando una subcapa `layout.layout`. Eso permitía que reglas del Topbar/Sidebar en la capa padre ganaran prioridad aunque conceptualmente Mobile Shell debiera gobernarlas.

El síntoma visible era exactamente un salto del Topbar al abrir/cerrar Sidebar en móvil: durante unos instantes reaparecía el offset de rail móvil heredado y después el shell intentaba reajustarse.

V3 elimina ese conflicto. `chrome.css` se importa una sola vez dentro de `layer(layout)` y **no declara un `@layer` interno**. El Topbar, el contenido principal y el drawer consumen el mismo `--chrome-sidebar-offset`.

## Mobile `<= 900px`

- `--chrome-sidebar-offset` es siempre `0px`.
- Topbar y `main-content` nunca cambian de posición al abrir/cerrar navegación.
- `#topbar-mount` no anima `inset-inline-start` en móvil.
- Sidebar usa ancho constante y sólo anima `transform/opacity`.
- El único trigger móvil vive dentro del Topbar.
- El toggle interno del Sidebar se oculta en móvil.
- El backdrop glass es una superficie real que captura outside-click sin click-through.
- El fondo queda inerte y sin scroll mientras el drawer está abierto.
- `Escape`, historial y navegación cierran el drawer.

## Desktop

Desktop conserva Sidebar persistente/colapsable. La diferencia es que Sidebar, Topbar, main y tablehead toman la misma variable geométrica. Cambiar de `open` a `collapsed` sigue animando el shell como una unidad, no como cuatro elementos calculados por separado.

## Regla de cascada

`src/css/app.css` importa `chrome.css` al final de `layer(layout)`:

```css
@import url("./layout/sidebar.css") layer(layout);
@import url("./layout/topbar.css") layer(layout);
@import url("./layout/chrome.css") layer(layout);
```

`chrome.css` no puede contener `@layer layout { ... }`. Esa regla es estructural: evita volver a introducir una subcapa con menor prioridad que las hojas anteriores.

## Criterios de aceptación

1. En móvil cerrado no existe rail lateral ni espacio vacío a la izquierda del Topbar.
2. Abrir/cerrar Sidebar no produce ningún salto horizontal del Topbar, main o tablehead.
3. El drawer entra por encima de la aplicación y no desplaza contenido.
4. El backdrop cubre también la zona del Topbar situada fuera del drawer.
5. Pulsar el backdrop cierra sin activar lo que hay detrás.
6. Dark/light, safe-area, reduced motion, reduced transparency y forced colors siguen definidos.
7. Las vistas de dominio no contienen reglas para compensar Sidebar/Topbar.

## Siguiente limpieza

Con `chrome.css` como autoridad final ya es seguro seguir recortando de `topbar.css` y `sidebar.css` las antiguas reglas geométricas que ahora son redundantes. Esa limpieza debe conservar únicamente skin/componentes internos y no volver a repartir la autoridad del layout.
