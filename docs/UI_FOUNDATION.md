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
7. `core/guardrails.css` cierra la cascada con invariantes geométricas no negociables.

## Contratos no negociables

### Una sola autoridad de scroll vertical

`.main-content` es el scroll vertical del panel. Una vista normal no crea otro viewport vertical completo dentro del viewport principal.

Los componentes que necesitan scroll propio —tablas, correo, modales o listas deliberadamente contenidas— deben declararlo de manera explícita.

### El scroll horizontal pertenece al componente

Las tablas no expanden el viewport. Los shells de Incidencias, Facturas, Clientes y Usuarios son los propietarios del scroll horizontal.

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

### Mobile es una composición, no una reducción

A 900 px:

- los heroes pasan a una columna;
- las acciones dejan de competir con el título;
- las métricas pasan a dos columnas;
- toolbars y filtros pasan a una columna;
- los filtros horizontales controlan su propio scroll.

A 560 px:

- las métricas pasan a una columna;
- títulos y subtítulos usan escala móvil común;
- paneles históricos conservan borde/radio y dejan de usar márgenes negativos;
- grids técnicos y de cuenta pasan a una columna.

A 480 px:

- los grupos de acciones principales son una columna;
- cada acción ocupa el ancho disponible.

## Lo que guardrails.css NO puede hacer

No puede:

- declarar colores hexadecimales;
- crear una paleta propia;
- contener lógica dark/light;
- arreglar una sola vista por ID o por un bug coyuntural;
- sustituir el CSS de dominio;
- incluir lógica de negocio.

Si una necesidad sólo aplica a una vista, pertenece a esa vista. Si es una invariante geométrica del producto, pertenece a Foundation.

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
