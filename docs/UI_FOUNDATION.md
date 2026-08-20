# Onion Support — UI Foundation

## Objetivo

La SPA privada se comporta como un sistema, no como una colección de vistas sostenidas por correcciones laterales. El contenido puede cambiar; la geometría debe permanecer estable.

## Jerarquía de autoridad

1. `src/css/tokens/variables.css` y `src/css/tokens/light.css`: decisiones visuales y temas.
2. `src/css/core/reset.css`: normalización del navegador.
3. `src/css/core/core.css`: tipografía, accesibilidad y helpers globales.
4. `src/css/core/layout.css`: shell base y autoridad de scroll vertical.
5. `src/css/layout/**`: componentes visuales del shell; `chrome.css` cierra su geometría.
6. `src/css/components/**`: componentes reutilizables.
7. `src/css/views/**`: composición de cada dominio.
8. `src/css/compositions/**`: recomposición transversal de varios dominios.
9. `src/css/core/guardrails.css`: invariantes geométricas finales.

`src/css/app.css` declara el orden de layers y es el único entrypoint CSS global.

## Scroll

### Vertical

`.main-content` es la autoridad de scroll vertical del panel. Una vista normal no crea otro viewport vertical completo dentro del viewport principal.

Componentes que necesitan scroll propio —tablas, Correo, modales o listas deliberadamente contenidas— lo declaran de forma explícita.

### Horizontal

Las tablas no expanden el viewport. Sus shells son propietarios del overflow horizontal en desktop/tablet cuando sea necesario.

En teléfono, Incidencias, Facturas, Clientes y Usuarios usan la composición DataList y el scroll horizontal deja de ser la UX principal.

Un identificador, email, endpoint o nombre largo nunca puede convertirse en autoridad de layout.

## Flex y Grid

Roots y elementos estructurales privados deben poder encoger (`min-inline-size: 0`). El tamaño `min-content` de un hijo no puede imponer el ancho de su padre.

## Texto

- narrativo: puede envolver;
- identificadores y tokens largos: pueden romper cuando sea necesario;
- una línea: truncado explícito;
- resumen breve: clamp explícito;
- ninguna cadena larga decide el tamaño de la interfaz.

## Modales

`dialog`, `[role="dialog"]` y `[aria-modal="true"]` respetan viewport dinámico y safe areas. Un modal no puede crecer fuera de pantalla ni quedar detrás del chrome del navegador móvil.

El shell transversal de detalle vive en `src/css/components/detail-modal.css` y consume tokens `--ui-detail-modal-*`. Los estilos específicos de cada dominio permanecen en sus hojas de vista.

## App Chrome

Topbar y Sidebar mantienen controladores internos independientes, pero su geometría e interacción transversal pertenecen a App Chrome:

- `src/ui/chrome/template.js`: estructura compartida;
- `src/ui/chrome/index.js`: coordinación responsive;
- `src/css/layout/chrome.css`: autoridad geométrica final;
- `src/app/enhancements.js`: registro `pre-router`;
- `src/main.js`: entrypoint único que prepara Chrome antes del App/Router.

No existen ni deben reaparecer `mobile-shell.css` o `features/mobile-shell/index.js`.

### Mobile `<= 900px`

- el trigger de navegación vive en Topbar;
- `--chrome-sidebar-offset` es `0px`;
- Sidebar cerrado tiene huella espacial cero;
- Main, Topbar y tablehead ocupan el ancho completo;
- abrir/cerrar navegación no desplaza Topbar/Main;
- Sidebar abierto es drawer overlay;
- backdrop, `inert`, foco y `Escape` forman parte del contrato;
- safe areas y viewport dinámico son obligatorios.

### Desktop

Sidebar es persistente/colapsable. Sidebar, Topbar, main y tablehead consumen el mismo `--chrome-sidebar-offset`, de modo que `open`, `collapsed` y `hidden` mueven el shell como una unidad.

### Cascade

`src/css/app.css` mantiene:

```css
@import url("./layout/sidebar.css") layer(layout);
@import url("./layout/topbar.css") layer(layout);
@import url("./layout/chrome.css") layer(layout);
```

`chrome.css` no vuelve a declarar `@layer layout` internamente.

## Responsive como composición

A `900px`:

- App Chrome adopta drawer;
- heroes pasan a una columna;
- acciones dejan de competir con títulos;
- métricas pasan a dos columnas;
- toolbars/filtros pueden pasar a una columna;
- los filtros horizontales son dueños de su propio overflow.

A `680px`:

- Incidencias, Facturas, Clientes y Usuarios se recomponen como DataList;
- el dato principal ocupa la primera línea;
- metadatos conservan labels y posiciones predecibles;
- acciones permanecen táctiles;
- el DOM de tabla se conserva.

A `560px`:

- métricas pasan a una columna;
- títulos/subtítulos usan escala móvil común;
- grids técnicos y de cuenta pasan a una columna.

A `480px`:

- los grupos de acciones principales pasan a una columna;
- cada acción puede ocupar el ancho disponible.

## Capa `compositions`

Puede:

- recomponer varios dominios bajo un patrón responsive común;
- usar clases/atributos de mejora progresiva compartidos;
- adaptar densidad, orden visual y slots sin duplicar datos ni negocio.

No puede:

- contener red, auth, router o store;
- decidir estados de negocio;
- crear paleta propia;
- arreglar un bug aislado de una vista;
- usar `!important` como mecanismo arquitectónico.

La implementación DataList canónica está documentada en `docs/MOBILE_DATALIST.md`.

## Guardrails

`src/css/core/guardrails.css` sólo impone invariantes geométricas transversales.

No puede:

- definir una paleta;
- contener lógica dark/light;
- arreglar una vista concreta por ID;
- sustituir el CSS de dominio;
- incluir lógica de negocio.

Si una necesidad sólo aplica a un dominio, vive en su vista. Si recompone varios dominios, vive en `compositions`. Si es una invariante geométrica global, vive en Foundation/guardrails.

## Política contra parches

Core, layout, components y compositions no aceptan archivos `patch`, `hotfix` o `quickfix`.

Una corrección estructural debe modificar la fuente canónica y retirar la regla, listener, observer, bridge o archivo que deja de ser necesario. No se conserva una segunda capa “por seguridad”.

## Criterios de aceptación

Toda evolución visual debe preservar:

- contratos funcionales;
- dark/light;
- responsive;
- reduced motion;
- forced colors;
- impresión cuando exista;
- Repository Integrity;
- preview de Azure Static Web Apps antes de mergear.

## Regla final

> El contenido cambia. La geometría permanece estable.

Si una vista sólo funciona con datos cortos, una resolución concreta o una cadena de parches correctores, la vista no está terminada.
