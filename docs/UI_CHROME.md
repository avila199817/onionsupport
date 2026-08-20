# Onion Support — App Chrome

Topbar y Sidebar conservan controladores funcionales separados, pero forman una única superficie de layout: **App Chrome**. La geometría transversal y la interacción responsive tienen una sola autoridad.

## Autoridades

- `src/ui/topbar/**`: título, búsqueda y resultados. No decide offsets globales.
- `src/ui/sidebar/**`: navegación, cuenta y contenido lateral. No decide la huella global del shell.
- `src/ui/chrome/template.js`: estructura compartida, backdrop y trigger móvil.
- `src/ui/chrome/index.js`: coordinación responsive, apertura/cierre, foco e interacción.
- `src/css/layout/chrome.css`: única autoridad geométrica de Topbar + Sidebar + main/tablehead.
- `src/app/enhancements.js`: registra App Chrome en la fase `pre-router`.
- `src/main.js`: único entrypoint ejecutable; prepara enhancements antes de arrancar el App/Router.

`index.html` no ejecuta App Chrome ni otros módulos globales directamente. Sólo ejecuta `/src/main.js`.

No existen `mobile-shell.css` ni `features/mobile-shell/index.js`, y no debe reintroducirse un bridge paralelo.

## Contrato de arranque

El orden canónico es:

```text
index.html
  -> src/main.js
       -> src/app/enhancements.js
            -> ticket-deeplink
            -> App Chrome
       -> src/app/index.js
       -> enhancements post-router
```

App Chrome se prepara antes del Router para que el shell responsive esté listo durante el primer montaje, sin convertir `index.html` en un segundo orquestador.

## Geometría

`src/css/app.css` carga las piezas visuales y deja `chrome.css` como última autoridad dentro de `layer(layout)`:

```css
@import url("./layout/sidebar.css") layer(layout);
@import url("./layout/topbar.css") layer(layout);
@import url("./layout/chrome.css") layer(layout);
```

`chrome.css` no declara otro `@layer layout { ... }` interno. Hacerlo crearía una subcapa y volvería a repartir la prioridad geométrica.

## Mobile `<= 900px`

- `--chrome-sidebar-offset` es `0px`.
- Topbar, `main-content` y tablehead no cambian de posición al abrir/cerrar navegación.
- Sidebar funciona como drawer overlay y anima únicamente su propia entrada/salida.
- El trigger móvil vive en el Topbar.
- El backdrop captura outside-click sin click-through.
- El fondo queda inerte y sin scroll mientras el drawer está abierto.
- `Escape`, historial, navegación y pulsación exterior cierran el drawer.
- Safe areas y viewport dinámico forman parte del contrato.

## Desktop

Sidebar es persistente/colapsable. Sidebar, Topbar, main y tablehead consumen el mismo `--chrome-sidebar-offset`, por lo que los estados `open`, `collapsed` y `hidden` mueven el shell como una unidad.

## Criterios de aceptación

1. En móvil cerrado no existe rail ni hueco lateral.
2. Abrir/cerrar Sidebar no desplaza Topbar, main o tablehead.
3. El drawer se superpone a la aplicación sin mover contenido.
4. El backdrop cubre también la zona del Topbar fuera del drawer.
5. Pulsar el backdrop cierra sin activar controles situados detrás.
6. Dark/light, safe-area, reduced motion, reduced transparency y forced colors tienen salida definida.
7. Las vistas de dominio no compensan Sidebar/Topbar con offsets propios.
8. No existe una segunda autoridad `Mobile Shell`.
9. `index.html` conserva un único script `type="module"`: `/src/main.js`.

## Regla final

> Topbar y Sidebar pueden tener componentes internos separados; su geometría y su interacción transversal pertenecen a App Chrome, y su arranque pertenece al entrypoint único de la SPA.
