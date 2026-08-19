# Onion Support — Mobile DataList V1

## Objetivo

En teléfono, una tabla de escritorio no debe limitarse a encogerse ni obligar al usuario a deslizar horizontalmente para entender una fila.

El mismo dataset se representa como una fila-card jerárquica, inspirada en aplicaciones móviles de alta densidad:

- identidad/dato principal arriba;
- metadatos debajo en posiciones estables;
- labels compactos conservan contexto;
- valores importantes mantienen alineación;
- acciones táctiles permanecen agrupadas;
- el scroll principal sigue siendo vertical.

## Alcance V1

La composición se aplica a:

- Incidencias;
- Facturas;
- Clientes;
- Usuarios.

Desktop y tablet conservan las tablas canónicas de cada vista. El cambio visual sólo entra a `<= 680px`.

## Arquitectura

### `src/features/mobile-datalist/index.js`

Es una mejora progresiva. No renderiza datos ni conoce negocio.

Lee las tablas ya generadas por cada template, obtiene los nombres de columna desde `<thead>` y añade únicamente:

- `.ui-datalist`;
- `.ui-datalist-row`;
- `.ui-datalist-cell`;
- `data-mobile-datalist-layout`;
- `data-mobile-slot`;
- `data-mobile-label`.

Un `MutationObserver` limitado a `childList` reaplica la anotación cuando el Router reemplaza la vista. No observa atributos, por lo que sus propias anotaciones no generan bucles.

### `src/css/compositions/mobile-datalist.css`

Vive en `layer(compositions)`, después de `views` y antes de `guardrails`.

Esta posición de cascada permite recomponer las reglas de tabla de cada dominio sin `!important`, manteniendo a `guardrails` como última autoridad geométrica.

## Mapas de datos

### Incidencias

1. identidad / asunto / cliente;
2. estado;
3. importe;
4. creada;
5. última novedad;
6. adjuntos.

### Facturas

1. factura / cliente;
2. pago;
3. total;
4. emitida;
5. incidencia vinculada;
6. acciones en bloque 2×2.

### Clientes

1. identidad fiscal;
2. estado;
3. importe;
4. alta;
5. contacto.

### Usuarios

1. identidad / rol;
2. estado;
3. alta;
4. email;
5. ubicación;
6. actividad.

## Accesibilidad

El DOM sigue siendo `<table>`. La cabecera no se elimina con `display:none`; se oculta visualmente para conservar la semántica y relación de columnas en tecnologías de asistencia.

La composición no crea botones, rutas ni listeners de negocio. Las filas y acciones conservan exactamente los handlers existentes de cada vista.

## Reglas

1. No duplicar datos para crear una segunda tabla móvil.
2. No crear un renderer móvil por dominio si el patrón se puede expresar con slots.
3. No usar scroll horizontal como UX principal en teléfono.
4. No usar `!important` en la capa `compositions`.
5. No esconder información crítica sólo para que la card sea más pequeña.
6. Si aparece una nueva columna, su slot debe definirse explícitamente o caer en `meta` de forma segura.
