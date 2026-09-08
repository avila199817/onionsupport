# Una apertura de detalle para toda la SPA

## Estado y trazabilidad

| Referencia | Evidencia |
| --- | --- |
| Implementación | Commit de refactorización [`6e402e8a`](https://github.com/avila199817/onionsupport/commit/6e402e8aeaa9abab343821424abc51015920c45f), rama `codex/spa-modal-single-lifecycle`. |
| Base de revisión | `5358d6c493c43c7f97618c5cc6cc52cd8a41cf2d`. |
| Publicación autorizada | El titular autorizó el 2026-09-08 la integración y publicación en producción, con documentación actualizada. |
| PR y candidato | [PR #552](https://github.com/avila199817/onionsupport/pull/552), head [`334983c34259bc1657ce92c3ebed149bac5f25d5`](https://github.com/avila199817/onionsupport/commit/334983c34259bc1657ce92c3ebed149bac5f25d5). Fusionada mediante squash en [`822784b34b4a35917e79cbc6c4977bf85c370f69`](https://github.com/avila199817/onionsupport/commit/822784b34b4a35917e79cbc6c4977bf85c370f69). |
| Repository Integrity | [Run 34224888823](https://github.com/avila199817/onionsupport/actions/runs/34224888823), correcto. |
| Validación confiable del candidato | [Trusted PR Integrity, job 102056585086](https://github.com/avila199817/onionsupport/actions/runs/34224888810/job/102056585086), build y suites completos, incluida matriz de 43 comprobaciones correctas, cero fallos y 21 escenarios globales. |
| Preview confiable | [Trusted PR Integrity, job 102057167667](https://github.com/avila199817/onionsupport/actions/runs/34224888810/job/102057167667), correcto: 179 archivos, 20 reescrituras SPA, 12 redirecciones canónicas y 37 rutas bloqueadas/no encontradas. |
| Comparación de Home público | [Run 34224888801](https://github.com/avila199817/onionsupport/actions/runs/34224888801), móvil y escritorio correctos, con los avisos móviles preexistentes descritos abajo. |
| Producción antes de fusionar | [Production Verification Gate, run 34224888803](https://github.com/avila199817/onionsupport/actions/runs/34224888803), correcto sobre la base vigente; no acredita el despliegue del candidato. |
| Despliegue de producción | [Azure Static Web Apps, run 34225392812](https://github.com/avila199817/onionsupport/actions/runs/34225392812), correcto desde el push de `main` en `822784b34b4a35917e79cbc6c4977bf85c370f69`. Publicado el 2026-09-08 a las 12:21:54 UTC. |
| Artefacto productivo y contrato posterior | [Job de despliegue 102058782799](https://github.com/avila199817/onionsupport/actions/runs/34225392812/job/102058782799): bytes canónicos correctos a las 12:22:03 UTC, 179 archivos, 20 reescrituras SPA, 12 redirecciones y 37 rutas bloqueadas/no encontradas. El workflow verificó también cabeceras, routing, backend y CORS. |
| Disponibilidad tras el despliegue | [Run 34225693489, job 102059183006](https://github.com/avila199817/onionsupport/actions/runs/34225693489/job/102059183006), correcto sobre `822784b3`: tres rondas de 16 comprobaciones cada una, cero fallos, estado `healthy` y ningún incidente abierto. |
| Lighthouse tras el despliegue | [Run 34225693580](https://github.com/avila199817/onionsupport/actions/runs/34225693580), correcto sobre `822784b3`: cinco muestras por URL y perfil, con un aviso de LCP en el acceso móvil detallado abajo. |
| Verificación productiva independiente | [Production Verification Gate, job 102059143934](https://github.com/avila199817/onionsupport/actions/runs/34225693523/job/102059143934), correcto: rebuild reproducible de 183 archivos idénticos, suites de navegador y comprobación del artefacto publicado. |

El SHA de runtime publicado es `822784b34b4a35917e79cbc6c4977bf85c370f69`. El manifiesto productivo validado tiene SHA-256 `86d05090a5a4a99817ef5bce38d6929c0ea67344b744e8e56a64b802ca6d37bb`. Una actualización documental posterior no cambia por sí misma esta revisión funcional. El despliegue y la verificación independiente han finalizado correctamente sobre ese SHA.

La revisión parte del árbol publicado en `5358d6c493c43c7f97618c5cc6cc52cd8a41cf2d`.

La verificación independiente comprobó el envelope de 180 archivos y el artefacto canónico de 179 archivos, 20 reescrituras SPA, 12 redirecciones y 37 rutas bloqueadas/no encontradas a las 12:24:15,900 UTC. Cabeceras, SEO, rutas, CORS y guardas de autenticación fueron correctos a las 12:24:21,950 UTC; los bytes productivos de Google Measurement y su contrato de consentimiento, a las 12:24:22,377 UTC. Los recuentos de 183 archivos del rebuild, 180 del envelope y 179 del conjunto canónico corresponden a inventarios de comprobación distintos de la misma revisión.

## Problemas corregidos

- Home y las listas elegían distintos caminos de apertura. Clientes y Usuarios usaban adaptadores de lectura separados de sus modales reales.
- Incidencias sustituía el panel al terminar una carga sin datos locales. Los módulos de estado, sincronización y avatares también solicitaban y proyectaban el detalle por su cuenta.
- La pila de adaptadores mantenía su propio historial y podía sobrevivir a cambios de vista o coexistir con otro detalle.
- La captura de clics confundía identificadores de comandos con aperturas: descargar, enviar o abrir una incidencia relacionada no deben abrir la factura contenedora.

La entrega elimina **3.158 líneas netas de `src/`** respecto a la base: se retiran puentes y adaptadores de detalle, conservando los controladores y acciones de cada dominio. Las pruebas y la documentación se contabilizan aparte.

## Comportamiento resultante

`EntityOverlay.open` es el punto de entrada para Home, filas, teclado, enlaces y APIs públicas de Facturas, Incidencias, Clientes y Usuarios. Una sesión posee el origen, la cancelación y exactamente un controller de detalle. Cada dominio conserva sus plantillas y acciones reales, sin montar un listado oculto.

El origen se comprueba contra la vista comprometida. Los modales no escriben historial ni navegan. El Router libera el detalle cuando confirma la sustitución de su vista; un montaje fallido no destruye el modal vigente. Los cierres respetan operaciones en curso y confirmaciones de borrador.

La carga, el error, el reintento y la actualización de Incidencias y Facturas conservan su panel. Las mejoras de Incidencias reciben el resultado del controller; el refresco por señales vuelve a ese mismo controller y comparte la petición en curso. Una respuesta posterior al cierre o a la sustitución no puede recuperar la sesión anterior.

Los listados aplazan sus renders mientras hay un detalle sobre su origen y aplican los cambios confirmados al cerrar. Se recupera el foco por identificador de fila si el nodo original se ha renovado. La captura global deja los eventos del panel a su controller y distingue abrir de ejecutar otro comando.

## Verificación

- Node `22.23.2`, npm `10.9.8`, dependencias del lockfile.
- Validación de fuentes, compilación y comprobación de distribución correctas; repetidas junto a las suites de navegador por la validación confiable del candidato enlazada arriba.
- Contrato de navegador: 21 escenarios, incluida una matriz ampliada de 43 comprobaciones correctas y cero fallos.
- Cuatro dominios desde Home y listados reales; doble clic; una petición inicial; identidad física del panel; cierre por botón, Escape y fondo; cancelación; respuesta tardía; error y reintento; relaciones; borradores; refresco concurrente; fallo de montaje de otra ruta y tamaño móvil.
- Contrato de avatares ejecutado en Chromium: identidad estable y cero lecturas de detalle adicionales.

Los contratos cargan controllers, templates y ciclo de vida reales. Sustituyen sesión y fronteras de API con datos sintéticos; no realizan operaciones contra producción. Los tests estáticos se han ajustado para exigir la única autoridad y rechazar el retorno de adaptadores, historial de modal o aperturas dependientes de la ruta.

Comandos de la entrega:

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm run validate:ci
```

Para repetir sólo la comprobación funcional de apertura durante una intervención:

```bash
node tools/private-domain-contracts.mjs --browser
node .github/scripts/modal_lifecycle_contract.mjs
node .github/scripts/incidencias_comment_avatar_runtime_contract.mjs
```

Los contratos de navegador requieren Chrome/Chromium, configurable mediante `CHROME_BIN`. La versión del lockfile y los umbrales de validación se mantienen como referencia. Los resultados locales de esta sección no sustituyen las evidencias de CI y publicación de la tabla superior.

## Comparación de rendimiento de Home público

El [run 34224888801](https://github.com/avila199817/onionsupport/actions/runs/34224888801) compara la base `5358d6c4` con el candidato `334983c3` mediante cinco muestras alternadas por revisión, en loopback, con el mismo runner y tooling de base. Son mediciones sintéticas del Home público; no miden producción ni el Home privado autenticado.

| Métrica (mediana) | Móvil base | Móvil candidato | Escritorio base | Escritorio candidato |
| --- | --- | --- | --- | --- |
| Rendimiento Lighthouse | 86 | 86 | 99 | 99 |
| FCP (ms) | 1.736,965 | 1.745,586 | 424,393 | 430,379 |
| LCP (ms) | 3.209,367 | 3.236,444 | 885,169 | 931,586 |
| TBT (ms) | 276,500 | 283,276 | 11,500 | 0,000 |
| CLS | 0 | 0 | 0 | 0 |

El CSS inicial se mantiene en 265.174 bytes y 45.002 bytes gzip. Ambas revisiones tienen avisos móviles de rendimiento y LCP; escritorio no presenta avisos Lighthouse y no hay errores bloqueantes. La comparación no acredita una mejora de rendimiento ni cierra el diagnóstico móvil del roadmap.

El manifiesto validado en el preview tiene SHA-256 `12f77ada13eddfd4566649fea17323a09988c4a9e78a169b2264bf2689156f29`. El enlace permanente del job conserva la evidencia de ese entorno efímero.

## Lighthouse de producción después del despliegue

El [run 34225693580](https://github.com/avila199817/onionsupport/actions/runs/34225693580) terminó correctamente sobre `822784b34b4a35917e79cbc6c4977bf85c370f69`. Se ejecutaron cinco muestras por URL y perfil, sin reintentos ni mediciones adicionales. Cada celda muestra la mediana y, entre paréntesis, la peor muestra.

| Perfil | Superficie | Rendimiento | LCP (ms) | TBT (ms) |
| --- | --- | --- | --- | --- |
| Escritorio | Portada | 99 (99) | 673 (884) | 16 (66) |
| Escritorio | `/login` | 99 (99) | 845 (852) | 16 (24) |
| Escritorio | `/reparacion-ordenadores` | 100 (100) | 242 (244) | 0 (0) |
| Móvil | Portada | 93 (91) | 2.369 (2.404) | 254 (309) |
| Móvil | `/login` | 96 (95) | 2.744 (2.747) | 22 (23) |
| Móvil | `/reparacion-ordenadores` | 99 (99) | 990 (1.000) | 111 (118) |

Las muestras se conservan en los jobs de [escritorio 102059204413](https://github.com/avila199817/onionsupport/actions/runs/34225693580/job/102059204413) y [móvil 102059204455](https://github.com/avila199817/onionsupport/actions/runs/34225693580/job/102059204455). CLS es 0 en todas las superficies; accesibilidad y buenas prácticas, 100. SEO es 100 en las páginas públicas y 66 en `/login` por su `noindex` intencional, validado en HTML y HTTP en las cinco muestras de cada perfil.

El único aviso Lighthouse de este run es el LCP mediano de `/login` móvil: **2.744 ms frente al presupuesto de 2.500 ms**. Es un aviso no bloqueante; los presupuestos se conservan. Estas muestras sintéticas de producción se registran separadas de la comparación alternada de candidato/base y no atribuyen por sí mismas una mejora a la refactorización. El diagnóstico de rendimiento del roadmap permanece abierto.

## Continuidad de mantenimiento

[UI_MODAL_SYSTEM.md](../UI_MODAL_SYSTEM.md) define las entradas públicas, factories, callbacks, origen, cierre, foco, peticiones y estabilidad del panel. [FRONTEND_SHARED_SYSTEMS.md](../FRONTEND_SHARED_SYSTEMS.md) sitúa esta autoridad junto al Router, AvatarSystem y AsyncScope. [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md), [ROADMAP.md](../ROADMAP.md) y el README apuntan a esta entrega para evitar varias afirmaciones incompatibles de versión vigente.

El recorrido autenticado completo frontend/backend sigue pendiente y conserva su alcance en F1 del roadmap. Esta refactorización no acredita escrituras reales, correo, pagos ni el modelo de permisos del backend.

## Publicación y reversión

La rama pasa por PR, integridad del repositorio y preview confiable antes de fusionarse a `main`. El workflow de Azure Static Web Apps compila y publica el SHA integrado; Production Verification Gate acredita por separado el artefacto publicado. Los cambios limitados a `docs/**` y `.github/**` están excluidos del disparador de SWA; un cambio en `README.md` sí puede iniciarlo. El cierre de evidencias se limita a `docs/**` y su SHA debe distinguirse del SHA funcional de esta tabla.

Si esta entrega necesita revertirse, revertir su PR mediante el mismo pipeline y verificar el nuevo SHA publicado. El modo de emergencia `legacy-root` de [BUILD_FOUNDATION.md](../BUILD_FOUNDATION.md) está fijado a una revisión mucho más antigua y no constituye una reversión específica de esta refactorización.
