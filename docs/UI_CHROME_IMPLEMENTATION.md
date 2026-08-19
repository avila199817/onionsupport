# App Chrome V2 — decisiones de implementación

La implementación evita fusionar los controladores `TopbarUI` y `SidebarUI`. Ambos siguen siendo propietarios de sus datos y eventos locales. La unificación ocurre en una capa superior y pequeña.

`ui/chrome/template.js` crea/normaliza `#app-chrome`, mueve los mounts existentes bajo ese root cuando todavía son hermanos del shell, crea el backdrop e inserta el único trigger móvil como primer hijo del Topbar una vez que éste existe.

`features/mobile-shell/index.js` observa únicamente el estado global de Sidebar y la aparición estructural de Topbar/Sidebar. No observa renders de vistas ni conoce rutas concretas. Para abrir/cerrar usa `SidebarUI.openSidebar()` y `SidebarUI.closeSidebar()`.

El backdrop es un nodo real. Esto garantiza que un toque exterior tenga un target propio y no pueda atravesar hacia un botón o enlace de la vista. Mientras el drawer está abierto, `main-content` y Topbar se marcan `inert` cuando el navegador lo soporta y existe además un focus trap como fallback de teclado.

El CSS móvil mantiene constante el ancho del drawer y anima `transform/opacity`; el estado cerrado no usa el ancho colapsado de desktop. Así no hay reflow lateral de la aplicación al abrir navegación.
