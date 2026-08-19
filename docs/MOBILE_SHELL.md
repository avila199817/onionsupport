# Onion Support — Unified Mobile Chrome V2

## Objetivo

En móvil el panel privado se comporta como una aplicación nativa y no como un escritorio reducido. A `<= 900px`, Topbar y Sidebar forman un único chrome visual:

- el botón hamburguesa vive dentro del Topbar real;
- Sidebar cerrado queda totalmente fuera del viewport y no reserva ningún rail;
- Sidebar abierto aparece como drawer superpuesto, sin desplazar `main-content` ni el Topbar;
- el resto del viewport queda cubierto por un backdrop glass real con blur;
- pulsar el backdrop cierra el drawer y el toque no atraviesa al contenido;
- navegar desde Sidebar, pulsar `Escape` o usar atrás/adelante cierra el drawer;
- Main y Topbar mantienen el ancho completo del viewport en móvil;
- al volver a desktop se restaura el estado previo del Sidebar cuando el shell privado continúa visible.

La composición sigue el patrón de navegación lateral de aplicaciones móviles modernas: el menú pertenece al chrome superior, el drawer aparece por encima de la aplicación y el contenido queda temporalmente subordinado visualmente.

## Arquitectura

### `src/ui/chrome/template.js`

Es la autoridad DOM del chrome compuesto. Crea un único `#app-chrome`, agrupa los mounts existentes de Topbar y Sidebar, crea el backdrop y añade el trigger móvil como hijo del Topbar.

No conoce `SidebarUI`, Router, Auth, HTTP ni estado de negocio. Su trabajo es exclusivamente estructural y ARIA/visual.

### `src/features/mobile-shell/index.js`

Es la autoridad de comportamiento móvil. Consume la API pública existente de `SidebarUI` para abrir/cerrar el drawer y sincroniza el estado del chrome.

No duplica navegación, rutas, autenticación ni datos. El cierre exterior se hace contra el backdrop real, no mediante hit-testing global contra toda la página.

### `src/css/layout/mobile-shell.css`

Es la autoridad geométrica del chrome privado móvil. Coordina `sidebar.css`, `topbar.css` y `core/layout.css` sin convertir ninguna vista de dominio en responsable del shell.

En móvil:

- el offset lateral global pasa a `0`;
- el Topbar sólo reserva dentro de sí el espacio táctil de su botón;
- Sidebar mantiene su ancho completo tanto abierto como cerrado y anima únicamente `transform/opacity`;
- el toggle interno de Sidebar queda reservado a desktop;
- el backdrop ocupa el viewport entre Topbar/contenido y el drawer;
- no se utiliza una sombra gigante como sustituto del backdrop.

## Contrato de interacción

Estado cerrado:

```text
┌─────────────────────────────────────┐
│ [☰]               Topbar / búsqueda │
├─────────────────────────────────────┤
│                                     │
│            Vista actual             │
│                                     │
└─────────────────────────────────────┘
```

Estado abierto:

```text
┌──────────────────┬──────────────────┐
│                  │                  │
│     SIDEBAR      │   GLASS / BLUR   │
│   ancho completo │   vista detrás   │
│                  │                  │
│                  │  tocar = cerrar  │
└──────────────────┴──────────────────┘
```

El drawer no cambia el ancho ni la posición de la vista. Abrir navegación es un estado temporal superpuesto.

## Reglas no negociables

1. No crear un rail móvil permanente.
2. No colocar el trigger móvil dentro de Sidebar.
3. No reservar una columna de Sidebar dentro del Topbar móvil.
4. No desplazar `main-content` al abrir el drawer.
5. No duplicar el botón hamburguesa en vistas concretas.
6. No implementar cierres exteriores con listeners distintos por vista.
7. No sustituir el backdrop por `box-shadow` de tamaño viewport.
8. No acoplar TopbarUI con SidebarUI: la coordinación pertenece a Mobile Shell.
9. No alterar API, Auth, Router o lógica de dominio para resolver geometría del chrome.
10. DataList, formularios, tablas y detalles responsive siguen siendo composiciones de contenido independientes del chrome.

## Desktop

Desktop conserva la arquitectura funcional existente de Sidebar y Topbar. El control interno de Sidebar sigue pudiendo abrir/colapsar el rail en escritorio; Unified Mobile Chrome sólo sustituye esa interacción al entrar en el breakpoint móvil.

## DataList

`Mobile DataList` permanece separado. El chrome gobierna viewport, navegación y capas; DataList gobierna cómo Incidencias, Facturas, Clientes y Usuarios representan sus datos en pantallas estrechas. Ninguno debe absorber responsabilidades del otro.
