# Onion Support Frontend

Frontend productivo de **Onion Support**, una SPA JavaScript modular desplegada en Azure Static Web Apps.

- Producción: `https://onionsupport.com`
- API canónica: `https://api.onionsupport.com`
- Idioma funcional: español
- Roles de producto: `admin` y `user`
- Runtime soportado: Node `>=22.23.2 <23`, npm `>=10.9.8 <11`

> Este repositorio contiene únicamente el frontend. La autorización, las ACL y las reglas de negocio sensibles pertenecen al backend.

## Estado y siguiente paso

Corte de implementación: **8 de septiembre de 2026, UTC**. La apertura de detalle de Home, listas y relaciones de Incidencias, Facturas, Clientes y Usuarios usa una única sesión `EntityOverlay`. El [registro de esta entrega](docs/releases/2026-09-08-single-modal-session.md) separa los contratos locales de las evidencias de integración, despliegue y comprobación de producción. Las referencias de publicación y verificación se mantienen en ese registro.

- Implementado: una entrada de apertura, cuatro controladores de dominio y un lifecycle compartido de teclado, foco y scroll. Se retiraron los puentes de Home y los detalles alternativos de lectura.
- Verificado localmente para esta entrega: contratos de fuente, compilación, distribución y navegador con controladores/templates reales y fronteras de API sintéticas. El alcance y los comandos figuran en el registro de release.
- Siguiente trabajo pendiente: recorrido real y controlado **acceso → incidencia → avatar → cierre de sesión**, coordinado con el backend. Las métricas y los avisos Lighthouse históricos permanecen identificados por revisión en `PROJECT_CONTEXT.md`.

Leer primero [estado, evidencias y límites](docs/PROJECT_CONTEXT.md), después [plan por fases y criterios de aceptación](docs/ROADMAP.md). El estado Azure estructural más reciente vive en [AZURE_CURRENT_STATE.md](docs/AZURE_CURRENT_STATE.md). El backend mantiene su [estado operativo](https://github.com/avila199817/oniontech/blob/main/docs/COMO_LO_TENEMOS_AHORA.md) y su [roadmap coordinado](https://github.com/avila199817/oniontech/blob/main/docs/ROADMAP.md).

## Puesta en marcha

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run validate:ci
```

Para servir localmente el build generado:

```bash
npm run build
npm run preview
```

`npm run validate:ci` es el gate local de referencia: valida contratos de fuente, build trusted, `dist`, reproducibilidad y comportamiento de navegador.

## Arquitectura

La regla central del proyecto es **una sola autoridad por responsabilidad**.

```text
index.html
  -> src/main.js
       -> src/app/enhancements.js
       -> src/app/index.js
            -> src/router/
            -> src/views/
```

Puntos principales:

- `src/main.js`: entry point JavaScript único.
- `src/app/`: boot y registry global de enhancements.
- `src/core/`: configuración, HTTP, media y estado transversal.
- `src/router/`: rutas, navegación y manifest CSS de ruta.
- `src/features/`: capacidades reutilizables y progresivas.
- `src/views/`: vistas de producto y sus contratos de dominio.
- `src/css/`: tokens, core, App Chrome, componentes, composiciones y CSS de vista.
- `src/features/avatar-system/`: autoridad única de identidad, estado y presentación de avatares.
- `src/features/entity-overlay/index.js`: única sesión y entrada de apertura de detalle para los cuatro dominios.
- `src/features/entity-overlay/modal-lifecycle.js`: teclado, pila, foco y scroll compartidos de todos los diálogos.
- `src/core/async-scope.js`: cancelación, vigencia de respuestas y limpieza de recursos.
- `src/core/public-site.js`: marca, servicios y política de metadatos públicos.
- `.github/`: contratos, verificadores y workflows de release.
- `tools/`: tooling de build reproducible, inventario y verificación del artefacto.

El contexto arquitectónico completo vive en [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md).

## Flujo de cambios y release

Los cambios relevantes deben partir del `main` actual y modificar la autoridad canónica, no crear overrides paralelos.

Flujo esperado:

1. rama desde `main`;
2. Pull Request;
3. Repository Integrity + contratos aplicables;
4. Trusted PR Integrity;
5. build candidato sin secretos;
6. rebuild con tooling confiable y prueba de provenance byte a byte;
7. preview aislado de Azure Static Web Apps;
8. merge únicamente con CI verde;
9. build productivo del SHA exacto fusionado;
10. deploy compilado y verificación de bytes, seguridad, routing y backend.

No deben quedar helpers, workflows ni archivos temporales de migración en `main`.

## Documentación de referencia

- [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md) — estado verificado, evidencias, límites y arquitectura canónica.
- [`docs/AZURE_CURRENT_STATE.md`](docs/AZURE_CURRENT_STATE.md) — estado Azure estructural vigente después de la limpieza y decommission legacy del 2026-09-07.
- [`docs/AZURE_INFRASTRUCTURE.md`](docs/AZURE_INFRASTRUCTURE.md) — inventario y auditoría Azure histórica de septiembre de 2026.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — prioridades, dependencias, alcance y cierre de las próximas entregas.
- [`docs/BUILD_FOUNDATION.md`](docs/BUILD_FOUNDATION.md) — foundation del build.
- [`docs/UI_FOUNDATION.md`](docs/UI_FOUNDATION.md) — foundation visual.
- [`docs/UI_CHROME.md`](docs/UI_CHROME.md) — autoridad de App Chrome.
- [`docs/UI_LOADING_SYSTEM.md`](docs/UI_LOADING_SYSTEM.md) — sistema de loading.
- [`docs/UI_MODAL_SYSTEM.md`](docs/UI_MODAL_SYSTEM.md) — entradas, controladores, callbacks, pila, foco, cierre y verificación de modales.
- [`docs/FRONTEND_SHARED_SYSTEMS.md`](docs/FRONTEND_SHARED_SYSTEMS.md) — autoridades, límites y verificaciones de la consolidación.
- [`docs/CONTINUOUS_SCROLL.md`](docs/CONTINUOUS_SCROLL.md) — contrato de colecciones progresivas.
- [`docs/PUBLIC_TICKET_INTAKE.md`](docs/PUBLIC_TICKET_INTAKE.md) — intake público de incidencias.

## Seguridad

No publiques secretos, tokens, SAS, credenciales ni datos privados en commits, issues o logs. Para reportar una vulnerabilidad, consulta [`SECURITY.md`](SECURITY.md).

## Licencia

Este repositorio es código propietario de Onion Support. Que el repositorio sea públicamente visible **no concede una licencia de uso, copia, modificación, redistribución o explotación** salvo autorización expresa del titular.
