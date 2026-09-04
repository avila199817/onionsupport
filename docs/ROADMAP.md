# Onion Support · plan de evolución gradual

> Documento único de planificación del frontend. Actualizado el 2026-09-04 (UTC).
> El estado implementado se contrasta con [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) y
> el código de `main`; este archivo describe el siguiente trabajo, no funcionalidades
> ya entregadas.

## Cómo vamos a trabajar

La regla es **una autoridad por responsabilidad**, con módulos pequeños y límites
explícitos. Centralizar no significa convertir la SPA en una función gigante: el Router,
el cliente HTTP, los sistemas visuales y los ciclos asíncronos son compartidos; cada
vista conserva sus reglas de dominio y su ciclo de vida.

Cada entrega debe:

1. partir del `main` verificado más reciente;
2. resolver una sola responsabilidad o una sola migración de consumidores;
3. retirar la duplicación que deja de tener dueño, si no hay consumidores legítimos;
4. incluir contratos y una evidencia que indique qué se probó y qué no;
5. pasar `npm run validate:ci`, el preview de Azure Static Web Apps y la verificación
   de producción del SHA exacto;
6. actualizar este roadmap y [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) en el mismo
   cambio documental o en el PR de runtime correspondiente.

No se abrirán tareas para “unificarlo todo” sin un límite comprobable. Una fase se cierra
cuando cumple sus criterios de aceptación; las siguientes pueden esperar sin bloquear
la estabilidad de lo ya publicado.

## Estado del corte

La versión funcional desplegada y verificada es
[5d82b0d0](https://github.com/avila199817/onionsupport/commit/5d82b0d0f5757868b52be156cbf8d38a28a7e276).

| Área | Estado | Fuente de verdad |
|---|---|---|
| Entry point y boot | Implementado y verificado | `src/main.js`, `src/app/enhancements.js` |
| Router y vistas | Router/host único implementado | `src/router/index.js`, `src/views/` |
| Avatares | `AvatarSystem` centralizado; adaptadores contextuales conservados | `src/features/avatar-system/` |
| Modales | Lifecycle compartido de foco, pila, Escape y scroll | `src/features/entity-overlay/modal-lifecycle.js` |
| Carreras asíncronas y DOM | `AsyncScope` para cancelación, vigencia y desmontaje | `src/core/async-scope.js` |
| Loading | Pintura y animaciones compartidas; geometría queda en cada vista | `src/css/components/skeleton.css` |
| CSS | Tokens/core globales y manifest único de estilos por ruta | `src/css/app.css`, `src/router/styles.js` |
| Marca y SEO público | Catálogo nacional, templates y metadatos centralizados | `src/core/public-site.js`, `src/router/page-metadata.js` |
| Validación | Contracts, build reproducible, navegador y release | `npm run validate:ci` y workflows |

El cierre de la consolidación se publicó mediante [PR #487](https://github.com/avila199817/onionsupport/pull/487)
y la corrección del consentimiento mediante [PR #490](https://github.com/avila199817/onionsupport/pull/490).
La [PR #482](https://github.com/avila199817/onionsupport/pull/482) se cerró como superada:
no debe reabrirse para recuperar una segunda autoridad de avatar.

## Fases

### F1 · Recorrido vertical de identidad y soporte

**Estado:** siguiente entrega. **Responsables:** frontend y backend.
**Dependencia:** cuentas de prueba, fixtures controlados y un entorno donde puedan
revisarse request IDs sin exponer datos privados.

Probar de forma trazable:

`acceso → refresh silencioso → /me → avatar → crear incidencia → adjunto controlado → leer/cerrar → logout`.

El frontend debe comprobar transición de rutas, expiración, cancelación al cambiar de
vista, identidad del avatar y errores visibles. El backend debe comprobar sesión, ACL,
idempotencia, propiedad del adjunto y revocación. La prueba de correo real queda fuera
hasta contar con una autorización específica.

**Cierre:** una matriz de casos con cuenta/fixture, endpoint, revisión desplegada,
resultado, request ID y limpieza posterior; CI verde; ningún token, SAS o dato de
cliente en la evidencia. Un health check por sí solo no cierra esta fase.

### F2 · Persistencia privada y cambio de cuenta

**Estado:** pendiente de revisión de código y comportamiento. **Dependencia:** F1.

Inventariar y clasificar cada uso de `localStorage` y memoria en Clientes, Usuarios,
Correo, Cuenta, consentimiento y tema. Confirmar propietario, campos, TTL, borrado,
cambio de cuenta y comportamiento con dos usuarios de prueba. El objetivo es que sólo
sobrevivan preferencias justificadas; tokens, contraseñas, SAS, URLs temporales y
snapshots de seguridad no se persisten.

**Cierre:** tabla de campos permitidos, prueba de aislamiento entre cuentas, limpieza
al cerrar sesión y contratos que impidan reintroducir datos privados. No borrar cachés
por intuición sin demostrar primero su contrato.

### F3 · Contrato HTTP y normalización de dominio

**Estado:** progresiva. **Dependencia:** F1 y F2.

Mantener `src/core/http.js` como cliente de API protegido. Auditar consumidores que
usen adaptadores legacy, normalizadores o `fetch` local. Migrar un dominio por PR
(primero Incidencias, después Facturas/Clientes/Usuarios/Correo) sólo cuando el
contrato de respuesta, errores, refresh y cancelación esté documentado.

`fetch` para leer un `blob:` local o descargar un PDF desde una URL validada no es por
sí mismo un segundo cliente de API; cada caso debe conservar su política de origen y
credenciales.

**Cierre:** un contrato de dominio, una fuente de normalización, pruebas de error y
cancelación, y retirada del adaptador sin consumidores. No añadir aliases “por si
acaso” ni cambiar endpoints del backend desde la vista.

### F4 · Rendimiento móvil medido

**Estado:** pendiente con señales concretas. **Dependencia:** F1; no depende de
reescribir CSS.

Repetir la medición en CI con el mismo SHA y condiciones antes de optimizar. El corte
actual dejó portada Lighthouse en **87 móvil / 100 escritorio**, CLS móvil **0,000**,
TBT móvil **404 ms frente a 300 ms** y LCP del acceso **2.573 ms frente a 2.500 ms**.
Son muestras sintéticas, no telemetría de usuarios.

**Cierre:** reproducción estable de la regresión o explicación respaldada por perfiles,
presupuesto acordado sin relajar gates, mejora medible y ausencia de regresión en
accesibilidad, SEO, reduced motion y forced colors. No atribuir el TBT a AvatarSystem
sin un perfil que lo demuestre.

### F5 · CSS y componentes por módulo

**Estado:** base centralizada implementada; limpieza adicional pendiente.
**Dependencia:** F4 para no confundir limpieza con una optimización no medida.

Medir de nuevo el inventario por ruta y artefacto. Después migrar una vista cada vez a
tokens, componentes y composiciones compartidos, retirando reglas sustituidas. `app.css`
seguirá siendo la entrada global y `router/styles.js` el manifest de ruta. No se crearán
paletas, loaders, `!important` o archivos `patch/hotfix` paralelos.

**Cierre:** inventario antes/después, bytes y cobertura de ruta, contratos visuales
verdes en dark/light, móvil, reduced motion, forced colors e impresión cuando aplique.

### F6 · SEO nacional y observación del índice

**Estado:** política técnica implementada; observación externa pendiente.
**Dependencia:** F1 para no mezclar rutas privadas con la navegación pública.

Conservar **Onion Support** como marca de portada, descripción nacional, catálogo de
servicios bajo el mismo dominio, canonicals propios, sitemap público y `/login` con
`noindex, follow`. Mantener enlaces HTML claros y datos estructurados desde el catálogo
central. Google decide los sitelinks y puede reescribir títulos; no se puede prometer
una presentación idéntica a otra marca.

**Cierre:** revisar la portada, servicios, robots, sitemap y cabeceras después de cada
release; registrar una inspección autorizada de Search Console cuando esté disponible.
IndexNow y un build verde no prueban por sí solos el rastreo de Google.

### F7 · Certificación y mantenimiento

**Estado:** continuo.

Cada PR de runtime debe enlazar su contrato, revisión y evidencia. Cada PR documental
debe indicar el SHA de runtime que describe. Dependabot y los workflows mantienen sus
propios gates; no se desactivan para ocultar avisos.

**Cierre de una entrega:** diff pequeño, CI verde, preview cuando corresponda, release
del SHA exacto, verificación de producción y documentación actualizada. Si una fase
descubre un riesgo nuevo, se abre una fase concreta con una condición de cierre, no una
macro-tarea indefinida.

## Coordinación con el backend

| Paso | Frontend | Backend |
|---|---|---|
| F1 | recorrido de rutas, refresh, avatar y errores | sesión, ACL, tickets, adjuntos e idempotencia |
| F2 | storage, cambio de cuenta y cachés | límites de propiedad y datos devueltos |
| F3 | HTTP, DTOs, errores y cancelación | contratos v2, códigos y compatibilidad |
| F4 | perfiles y budgets | latencia de consultas y readiness sólo como gate |
| F5 | tokens, componentes y hojas por ruta | no aplica salvo cambios de payload |
| F6 | canonical, sitemap y páginas públicas | no publicar lógica de negocio en el frontend |

La continuidad operativa y el roadmap del backend están en
[oniontech/docs/COMO_LO_TENEMOS_AHORA.md](https://github.com/avila199817/oniontech/blob/main/docs/COMO_LO_TENEMOS_AHORA.md)
y [oniontech/docs/ROADMAP.md](https://github.com/avila199817/oniontech/blob/main/docs/ROADMAP.md).

## Fuera del alcance de este roadmap

No se autoriza aquí una macroreescritura, un nuevo framework, una segunda SPA, un
segundo cliente HTTP, una migración masiva sin fixtures o una modificación de Azure
sin su preflight. Las features se aceptan cuando reducen una duplicación real y dejan
una evidencia reproducible.
