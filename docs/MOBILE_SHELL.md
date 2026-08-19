# Onion Support — Mobile Shell V1

## Objetivo

En móvil el panel no debe comportarse como un escritorio encogido. El shell privado cambia de composición a `<= 900px`:

- Sidebar cerrado: no existe rail persistente; sólo queda un trigger hamburguesa táctil.
- Sidebar abierto: drawer superpuesto, sin desplazar contenido.
- Main y Topbar: ocupan el ancho completo del viewport.
- El Topbar reserva únicamente el hueco del trigger, no una columna lateral completa.
- La primera pulsación fuera del drawer sólo lo cierra; no activa accidentalmente controles del contenido.
- Navegar desde el Sidebar, pulsar `Escape` o volver/avanzar en historial cierra el drawer.
- Al regresar a desktop se restaura el estado previo del Sidebar cuando el shell privado sigue visible.

## Autoridades

### `src/css/layout/mobile-shell.css`

Es la única autoridad CSS del chrome privado móvil. Coordina `sidebar.css`, `topbar.css` y el layout global. No contiene reglas de dominio ni estilos de vistas.

### `src/features/mobile-shell/index.js`

Es la única autoridad de comportamiento del drawer móvil. Consume la API pública de `SidebarUI`; no replica navegación, auth, router ni estado de negocio.

## Reglas

1. No crear otro rail móvil permanente.
2. No volver a desplazar `main-content` al abrir el drawer.
3. No añadir un segundo botón de navegación en una vista concreta.
4. No crear listeners de navegación por vista.
5. No usar `!important` para gobernar el shell móvil.
6. Cualquier tabla/listado móvil pertenece a su propio sistema de datos responsive; el Mobile Shell sólo gobierna chrome y viewport.

## Siguiente capa

Con el shell estabilizado, las tablas de Incidencias, Facturas, Clientes y Usuarios pueden evolucionar a un patrón `DataList` móvil: el mismo dataset con una representación jerárquica específica para pantallas estrechas, evitando que el scroll horizontal sea la UX principal.
