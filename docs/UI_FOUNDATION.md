# Onion Support — UI Foundation V1

## Objetivo

La SPA privada debe comportarse como un sistema y no como una colección de vistas que sobreviven por sus propios parches. El contenido puede cambiar; la geometría no debe romperse.

Esta foundation establece una jerarquía única:

1. `tokens/variables.css` y `tokens/light.css` definen decisiones visuales.
2. `core/reset.css` normaliza el navegador.
3. `core/core.css` define tipografía, accesibilidad y helpers.
4. `core/layout.css` gobierna shell, offsets y la autoridad de scroll vertical.
5. `components/ui.css` define componentes reutilizables.
6. `views/**` compone cada dominio.
7. `compositions/**` puede recomponer varios dominios para una experiencia transversal —por ejemplo DataList móvil— sin introducir lógica de negocio ni `!important`.
8. `core/guardrails.css` cierra la cascada con invariantes geométricas no negociables.

Topbar y Sidebar mantienen controladores independientes, pero visualmente pertenecen a una única superficie `App Chrome`. La coordinación móvil vive fuera de ambos controladores para no crear dependencias cruzadas.

## Contratos no negociables

### Una sola autoridad de scroll vertical

`.main-content` es el scroll vertical del panel. Una vista normal no crea otro viewport vertical completo dentro del viewport principal.

Los componentes que necesitan scroll propio —tablas, correo, modales o listas deliberadamente contenidas— deben declararlo de manera explícita.

### El scroll horizontal pertenece al componente

Las tablas no expanden el viewport. Los shells de Incidencias, Facturas, Clientes y Usuarios son los propietarios del scroll horizontal en desktop/tablet cuando resulte necesario.

En teléfono, esos cuatro listados usan la composición DataList: el scroll horizontal deja de ser la UX principal y cada fila conserva el mismo dataset en una tarjeta jerárquica.

Un identificador, email, endpoint o nombre largo nunca puede convertir el panel completo en una superficie horizontal.

### Flex y Grid siempre pueden encoger

Los roots y elementos estructurales privados reciben `min-inline-size: 0`. El tamaño `min-content` de un hijo no puede imponer el ancho de su padre.

### El texto tiene estrategia

- texto narrativo: puede envolver;
- identificadores y tokens largos: pueden romper cuando sea necesario;
- una sola línea: usa `text-truncate` / `ui-truncate`;
- resumen breve: usa `text-clamp-2` o `text-clamp-3`;
- nunca se usa una cadena larga como autoridad de layout.

### Modales dentro del viewport real

`dialog`, `[role="dialog"]` y `[aria-modal="true"]` respetan `100dvh`, `100dvw` y safe areas. Un modal no puede quedar detrás de la barra del navegador móvil ni crecer fuera de pantalla.

### App Chrome móvil

A `900px` Topbar y Sidebar cambian de composición sin fusionar su lógica interna:

- el único trigger de navegación móvil vive dentro del Topbar;
- Sidebar cerrado está totalmente off-canvas y tiene huella espacial cero;
- Main y Topbar ocupan el ancho completo del viewport;
- Sidebar abierto se superpone como drawer y nunca desplaza contenido;
- un backdrop glass real cubre la aplicación, captura el toque exterior y evita click-through;
- la interacción de fondo queda inerte mientras el drawer está abierto cuando el navegador soporta `inert`;
- el foco de teclado queda contenido en Sidebar y `Escape` devuelve el foco al trigger;
- el toggle interno de Sidebar queda reservado a desktop.

`ui/chrome/template.js` posee la estructura visual compartida. `features/mobile-shell/index.js` posee la coordinación del drawer y consume únicamente la API pública de `SidebarUI`. `TopbarUI` y `SidebarUI` no se importan mutuamente.

### Mobile es una composición, no una reducción

A 900 px:

- App Chrome adopta navegación drawer desde Topbar;
- Main y Topbar pasan a ancho completo;
- los heroes pasan a una columna;
- las acciones dejan de competir con el título;
- las métricas pasan a dos columnas;
- toolbars y filtros pasan a una columna;
- los filtros horizontales controlan su propio scroll.

A 680 px:

- los listados tabulares de Incidencias, Facturas, Clientes y Usuarios se recomponen como DataList;
- el dato principal ocupa la primera línea completa;
- los metadatos conservan labels compactos y posiciones predecibles;
- los bloques de acciones permanecen táctiles y simétricos;
- el DOM de tabla se conserva para desktop y accesibilidad.

A 560 px:

- las métricas pasan a una columna;
- títulos y subtítulos usan escala móvil común;
- paneles históricos conservan borde/radio y dejan de usar márgenes negativos;
- grids técnicos y de cuenta pasan a una columna.

A 480 px:

- los grupos de acciones principales son una columna;
- cada acción ocupa el ancho disponible.

## Capa `compositions`

`compositions` existe para patrones que necesitan imponerse después de las hojas de dominio, pero que no son guardrails ni parches.

Puede:

- recomponer varios dominios bajo un mismo patrón responsive;
- utilizar clases/atributos de mejora progresiva compartidos;
- adaptar densidad, orden visual y slots manteniendo el DOM funcional existente.

No puede:

- contener llamadas de red, auth, router o store;
- decidir estados de negocio;
- introducir una paleta paralela;
- arreglar un único bug coyuntural de una única vista;
- usar `!important` como mecanismo de arquitectura.

## Lo que guardrails.css NO puede hacer

No puede:

- declarar colores hexadecimales;
- crear una paleta propia;
- contener lógica dark/light;
- arreglar una sola vista por ID o por un bug coyuntural;
- sustituir el CSS de dominio;
- incluir lógica de negocio.

Si una necesidad sólo aplica a una vista, pertenece a esa vista. Si es una invariante geométrica del producto, pertenece a Foundation. Si recompone varios dominios bajo una experiencia común, pertenece a `compositions`.

## Política contra micro-parches

El core, layout y components no aceptan archivos con nombres `patch`, `hotfix` o `quickfix`. Repository Integrity valida esta regla.

Los cambios visuales transversales deben convertirse en sistema o permanecer en la hoja canónica del dominio correspondiente.

## Migración progresiva

UI Foundation V1 estabiliza inmediatamente todas las vistas privadas existentes sin exigir una reescritura destructiva simultánea.

Los siguientes refactors pueden eliminar CSS duplicado de `views/**` de forma incremental, moviendo únicamente patrones ya probados al sistema común. Cada migración debe mantener:

- contratos funcionales;
- dark/light;
- responsive;
- reduced motion;
- forced colors;
- impresión cuando exista;
- Repository Integrity;
- preview de Azure Static Web Apps antes de mergear.

## Regla de diseño

> El contenido cambia. La geometría permanece estable.

Si una vista sólo funciona con datos cortos, un ancho concreto o una resolución concreta, la vista no está terminada.
