# Onion Support · UI Loading System

Estado: **CANÓNICO · SINGLE SKELETON AUTHORITY · 2026-08-31**

Este documento define la única política válida de loading para toda la SPA de Onion Support. No es una guía opcional: el código y CI deben mantener este contrato.

## Principio

Un skeleton no es un loader genérico ni una decoración. Es una representación temporal y simplificada de la geometría del contenido que todavía no existe. El usuario nunca debe perder contenido válido únicamente porque una petición de revalidación esté en curso.

La autoridad visual única es `src/css/components/skeleton.css`, cargada en `layer(loading)` después de `views` y `compositions`. Las hojas de vista pueden conservar únicamente geometría propia del dominio, como anchos de columnas o distribución del contenido, pero no pueden definir otra paleta, shimmer, radio, altura semántica o animación de skeleton.

La primitiva canónica es `.ui-skeleton`. Las clases históricas (`incidencias-skeleton`, `facturas-skeleton`, `clientes-skeleton`, `usuarios-skeleton`, `cuenta-skeleton`, `home-skeleton` y los placeholders de Correo) son adaptadores de compatibilidad y reciben el mismo paint desde la autoridad global.

## Máquina de estados de producto

### COLD_LOADING

No existe contenido válido todavía. Se muestra skeleton estructural dentro de la superficie donde aparecerán los datos. No se bloquea toda la aplicación, no se crea un overlay global y no se reemplazan zonas estáticas como navegación, filtros o cabeceras que ya pueden renderizarse.

### READY

Los datos reales están disponibles. El skeleton desaparece por completo y no deja espacio reservado adicional.

### REFRESHING

Ya existen datos válidos y se está revalidando en background. Los datos actuales permanecen visibles y estables. No se sustituye el listado por skeleton ni se pinta un overlay de refresh. Si es necesario comunicar actividad a tecnología asistiva, se usa un estado accesible fuera del flujo visual.

### LOADING_MORE

El listado existente permanece visible. La carga incremental sólo puede añadir feedback localizado al final del feed; nunca debe reconstruir o esconder las filas ya cargadas. El scroll continuo no utiliza botones de “Mostrar más”.

### ACTION_PENDING

Una acción concreta —crear, guardar, enviar, descargar o eliminar— usa feedback localizado en el control afectado. La alternativa canónica es un spinner pequeño (`.ui-progress-spinner`) y `aria-busy="true"` en el control o región correspondiente. No se usa skeleton para una acción puntual.

### EMPTY

La petición terminó correctamente y no hay contenido. Se muestra el empty state real. Un skeleton no puede representar un estado vacío definitivo.

### ERROR

La petición terminó con error. Se muestra el estado de error real y, cuando proceda, una acción de retry. Un skeleton no puede quedar animándose indefinidamente para ocultar un error.

## Gramática visual

Todos los skeletons comparten los mismos tokens de base/highlight, una única animación `ui-skeleton-shimmer`, la misma duración y el mismo criterio de radios. Las diferencias permitidas son semánticas: texto, título, valor, avatar, chip, control o bloque/region.

Las vistas pueden variar el ancho del placeholder para aproximar el contenido final. Esa variación es layout, no paint. Por ejemplo, una línea de cliente puede ocupar 72% y un identificador 32%, pero ambos siguen siendo la misma primitiva visual.

Incidencias conserva una composición de identidad más rica (avatar + varias líneas + badge) porque ésa es la geometría real de su fila. El contenedor no se pinta como una cápsula: únicamente se pintan las piezas internas mediante el mismo shimmer global.

Correo conserva una densidad mayor por su naturaleza de cliente de correo, pero usa exactamente la misma paleta/animación global. Densidad distinta no significa sistema de skeleton distinto.

## Accesibilidad

Los placeholders visuales son decorativos y no deben convertirse en ruido para lectores de pantalla. La región de contenido puede usar `aria-busy="true"` mientras carga y un único `role="status"` con un mensaje conciso como “Cargando incidencias”.

Cuando el estado es únicamente informativo, `.ui-loading-status` mantiene ese texto accesible fuera del flujo visual.

`prefers-reduced-motion` desactiva shimmer y spinners animados. `forced-colors` utiliza una representación sólida compatible con alto contraste.

## Reglas anti-regresión

1. Ninguna nueva vista puede crear otro `@keyframes` de skeleton.
2. Ninguna vista CRUD puede definir `background`, `animation`, `border-radius`, altura semántica, color u opacidad de sus placeholders.
3. `layer(loading)` debe permanecer después de `views` y `compositions` y antes de `guardrails`.
4. La revalidación con datos visibles es silenciosa: REFRESHING no sustituye contenido real por placeholders.
5. El infinite scroll conserva contenido y añade sólo feedback incremental.
6. Los skeletons deben aproximar la geometría real y no dibujar contenedores gigantes que no existan en la interfaz final.
7. Light/Dark se resuelven sólo por tokens globales.

`.github/scripts/ui_loading_system_contract.py` y los contratos específicos de las vistas hacen estas reglas ejecutables en CI.