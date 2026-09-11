# R01–R17 / A00–A17 · registro canónico de recorte y unificación

## Corte vigente · ejecución del prompt v2 · 2026-09-11 UTC

Este bloque sustituye como estado vigente a la tabla inicial que se conserva al final, identificada como historia. No sustituye el [roadmap](../ROADMAP.md) ni declara terminado todo el encargo. Responsable de los lotes: **@avila199817**. Las prioridades P0–P3 son prioridades de trabajo, no severidades de vulnerabilidad.

La fuente de alcance es el prompt del propietario «Recorte avanzado, unificación y simplificación», versión 2.0, del 11 de septiembre de 2026. F1/F2, la auditoría y su paquete histórico, no se recuperaron de la biblioteca: sus cifras se contrastan con código/artefactos cuando se usan. El diagnóstico nuevo de R04 falla con exit 1; no se reutiliza un diagnóstico histórico que pueda devolver éxito aunque encuentre defectos.

| Revisión | Frontend | Backend |
| --- | --- | --- |
| Corte auditado y main al empezar v2 | `b8e4ed28e7286d638528a36e36a0a9b1059c4430` | `dc397d5e1666cd2f7dab49d7f7c9236f678aa6dd` |
| Último runtime integrado de este registro | `46ca86254c770d5609e2b2d2b0a4c5767f7e3456` | Sin cambio de runtime en estos tres lotes |

El enlace coordinado del backend ya existe en [oniontech/docs/REPOSITORY_CLEANUP.md](https://github.com/avila199817/oniontech/blob/main/docs/REPOSITORY_CLEANUP.md). El frontend enlaza este registro desde [BUILD_FOUNDATION.md](../BUILD_FOUNDATION.md). No se duplica otra tabla canónica ni se publica código privado del backend aquí.

### Estado vigente por hallazgo

| Rxx / Axx | Prioridad | Estado del alcance | Decisión, evidencia y pendiente |
| --- | --- | --- | --- |
| R01 / A00 | P0 | En curso | Registro único reconciliado; corte inicial preservado. A00 no queda cerrado: faltan ámbitos de inventario, medición y contratos de ambos repositorios. |
| R02 / A00 | P0 | Bloqueado en lectura adicional / decisión de gobierno | Ambos main devolvieron `protected:false`; frontend rulesets vacío; backend rulesets 403. No se infiere ausencia de reglas del 403 ni se cambian permisos, plan o visibilidad. Desarrollo aislado permitido continúa. |
| R03 / A00–A01 | P1 | Desplegado y verificado | #578: techos post-A01 basados en artefacto comparable; exclusión estática de invoice-api conservada. |
| R04 / A07 | P1 | En curso | Cuatro diagnósticos sintéticos reproducidos con assertions fallidas; corrección del contrato/consumidores aún no integrada. Ver continuación. |
| R05 / A08 | P1 | Pendiente | Cinco capas activas de API de facturas no retiradas; empezar por contrato R04, luego transporte/adaptación/documentos/caché. |
| R06 / A14 | P1 | Desplegado y verificado | #578 prepara tooling sin cambiar bytes; #579 activa geometría WhatsApp en CSS privado. Composición conservada, matriz real de navegador y artefacto comprobados. |
| R07 / A14 | P2 | Pendiente | Copias crudas candidatas no retiradas. Resolver consumidores/URLs y modos fuente/build antes de excluirlas. |
| R08 / A09 | P2 | Pendiente | Patrones modales/cascada sin unificación nueva en estos lotes; mantener temas, foco y precedencia AvatarSystem. |
| R09 / A09 | P2 | En curso | #580 completa sólo cleanText/escapeHtml de Home y pending-view: 4 implementaciones → 2, copias locales retiradas. Resto de familias/fallbacks pendiente. |
| R10 / A10 | P2 | Pendiente | Controladores de dominio y lifecycle no extraídos en esta ejecución. |
| R11 / A11 | P2 | Pendiente | Navegación/overlays y grafo completo del ámbito por consolidar, sin segundo bus. |
| R12 / A12 | P2 | Pendiente | Cálculo/repositorio/CLI de estadísticas no separados aquí; dry-run previo no se presenta como novedad. |
| R13 / A13 | P2 | Pendiente | Configuración pura/adaptadores/ensamblaje y cierre de recursos por trabajar. |
| R14 / A15 | P2 | En curso, alcance parcial | Se amplían contratos ejecutables de CSS y presentación; no se cierra el registro global de suites ni la migración de pruebas textuales. |
| R15 / A06–A00 | P2 | Pendiente | Medición comprimida por digest/capas y ventana de recuperación pendientes; no convertir fuente excluida en ahorro RAM/Azure. |
| R16 / A16 | P3 | Pendiente | Publicación/URLs legales no resueltas ni política legal reescrita. |
| R17 / A17 | P3 | Pendiente | Auth queda al final, tras configuración/cobertura; sin relajación de políticas. |

**Trazabilidad Axx:** A01–A04 siguen integradas en el corte frontend; la separación de invoice-api y las retiradas de A02–A04 siguen protegidas por contratos. A05 se confirmó fusionada en backend [#527](https://github.com/avila199817/oniontech/pull/527), merge `9f11bd262c245b91f27cad70f6a25c7f990cbd7b`. A06 se confirmó fusionada en [#528](https://github.com/avila199817/oniontech/pull/528), merge `dc397d5e1666cd2f7dab49d7f7c9236f678aa6dd`; conserva la excepción runtime de pausa de escrituras. Su publicación pertenece al corte auditado; esta ejecución no certifica otra imagen backend. A00 sigue parcial; A07–A17 mantienen alcance pendiente o parcial como indica Rxx. Una subtarea de R03, R06 o R09 no cierra A00, A09 o A14 completos.

### Lotes de código y publicación

| Lote / dueño | Base → candidato → fusión | Archivos y consumidores | Pruebas, artefacto y publicación | Reversión / pendiente |
| --- | --- | --- | --- | --- |
| R03 + preparación R06, [#578](https://github.com/avila199817/onionsupport/pull/578). Dueños: Vite privado y contrato de grafo existentes. | `b8e4ed28` → `c3a8331f9ce9b34ad5cd1f20b10f162177c47eb0` → `00c5a88c147d6773e71a2fb496b41fbaa4042d89` | Vite, package.json, contratos CSS/grafo y nueva regresión del plugin. Sin cambiar fuentes runtime ni loader. | Trusted PR [34613498846](https://github.com/avila199817/onionsupport/actions/runs/34613498846), integridad 34613501199, gate 34613501201, Home 34613501200: éxito. Artefacto 10269222139, 188 archivos idénticos a base. Producción [34614614704](https://github.com/avila199817/onionsupport/actions/runs/34614614704): éxito y bytes/rutas/security/backend verificados. | Revert revisado de tooling coherente, sin restaurar datos. Preparación no ahorra CSS por sí sola. |
| Activación R06, [#579](https://github.com/avila199817/onionsupport/pull/579). Dueño: entrada privada existente. | `00c5a88c` → `763c24c70dad5ed88f0678cf772a02556ebed2c9` → `9dc9febeddec6482a647d54c7a9dd6ec958089d0` | Un import en private.css; test real de WhatsApp y su ejecución en suite existente. app.css fuente, composición, Auth/loader, capa y AvatarSystem final conservados. | Caracterización previa 83db98ab/run 34616116890; candidato [34616937101](https://github.com/avila199817/onionsupport/actions/runs/34616937101), integridad 34616939581, gate 34616939692, Home 34616939663: éxito. Artefacto confiable 10271531145, 188 archivos. Producción [34617787249](https://github.com/avila199817/onionsupport/actions/runs/34617787249): éxito, SHA fusionado y bytes canónicos/rutas/security/backend verificados. | Revert revisado del import, conservando tooling preparatorio. R07 y resto de A14 no cerrados. |
| Familia R09, [#580](https://github.com/avila199817/onionsupport/pull/580). Dueño: src/core/presentation-text.js. | `9dc9feb` → `4f4007fc59608413ab5171b33e7e038aef5388ee` → `46ca86254c770d5609e2b2d2b0a4c5767f7e3456` | Dos antiguos dueños importan/reexportan funciones canónicas; cuatro implementaciones anteriores retiradas. Home conserva formato/IDs y pending-view conserva markup/redacción de errores. Nuevo contrato conectado a check:dist. | Caracterización previa/candidata y mutación rechazada. Trusted PR [34618137723](https://github.com/avila199817/onionsupport/actions/runs/34618137723), integridad 34618137799, gate 34618137745, Home 34618137718: éxito. Artefacto 10270894912, 189 archivos. Producción [34619345224](https://github.com/avila199817/onionsupport/actions/runs/34619345224): éxito, SHA fusionado y bytes canónicos/rutas/security/backend verificados. | Revert revisado del lote de funciones/consumidores, nunca efectos financieros. Variantes públicas semánticamente distintas y otras familias no se fusionan por nombre. |

### Mediciones comparables

Base de producción descargada: artefacto **10196534557**, run **34593129204**, fuente `b8e4ed28`. Se verificaron inventario exacto, tamaños y hashes de los **188 archivos**, no sólo el resumen del manifiesto. La preparación #578 conservó los 188 archivos completos byte a byte; después se verificó el artefacto de cada candidato y su identidad con el build local.

| Magnitud | Base | Tras R06 | Tras familia R09 |
| --- | ---: | ---: | ---: |
| CSS público main, bytes sin comprimir | 270690 | 265851 | 265851 |
| CSS privado, bytes sin comprimir | 163222 | 168061 | 168061 |
| CSS público main, gzip nivel 6 | 45823 | 45157 | 45157 |
| CSS privado, gzip nivel 6 | 23855 | 24544 | 24544 |
| Cierre estático app, bytes sin comprimir | 156433 | 156433 | 156529 |
| Cierre estático auth, bytes sin comprimir | 62960 | 62960 | 62960 |
| Unión bootstrap/Home, bytes sin comprimir | 215407 | 215407 | 215503 |

CSS comprimido comparado con **Node 22.23.2 / zlib 1.3.1-e00f703 / gzip nivel 6** en ambos lados. R06 retira de la carga pública **4839 B sin comprimir / 666 B gzip**, y los conserva en la privada. Suma de los dos CSS: bytes sin comprimir sin cambio; gzip **+23 B**, por compresión separada. La composición fuente de **7733 B** permanece idéntica. No es eliminación de geometría ni de copias crudas.

R09 reduce las fuentes runtime de los tres módulos de **12137 a 12049 B (−88)** y de **434 a 426 líneas físicas (−8)**; **4 implementaciones → 2**. Pruebas/tooling se contabilizan aparte. El JS compilado total pasa de **1799174 a 1799394 B (+220)** y de **66 a 67 chunks**. App/bootstrap aumentan **96 B** por el empaquetado compartido; se acepta explícitamente ese coste pequeño para eliminar implementaciones competidoras, no como aceleración. El helper no importa infraestructura ni dominios pesados.

R03 mantiene techos **158000 / 64000 / 218000 B**, frente a los valores base **156433 / 62960 / 215407**: margen de **1567 / 1040 / 2593 B** (aprox. 1,00 % / 1,65 % / 1,20 %). No se elevan después de R09. Los conjuntos estáticos se solapan: **no se suman** ni se convierten en latencia. La exclusión de invoice-api sigue activa.

SHA-256 de ZIPs verificados independientemente:

- Base: `724b4883d19ce407fea14afe542b5be14ed96f8e4787da49f37c299c00fafc54`.
- Preparación R06/R03: `105bf2b929434b1d90d3af43a55d66d54e458b78b508f64c8cb12b116c1d56b2`.
- Activación R06: `65d61ac903f58703bd518e942fd57f18835f55e931dbb35522340ef96e54519f`.
- Familia R09: `96ae7fa2a777f94fbd2e0c332daab7895c04c731ba082133d3fd556e72d09bb1`.

Los artefactos de PR tienen retención corta. Estos identificadores/hashes no prometen que sigan descargables tras caducar; no se reconstruirá uno caducado como si fuera el original. La política de retención no se cambia aquí.

### Pruebas ejecutadas y límites

En cada candidato final pasaron build, check:dist, reproducibilidad, navegador, reconstrucción con base confiable, comparación de procedencia y bytes del preview, además de los controles de integridad/producción/Home. La publicación se verificó sobre el SHA fusionado por el circuito habitual, no reutilizando verde de un head anterior.

La nueva matriz R06 usa la SPA compilada, Router, selector/guard de Auth, loader CSS, controlador y templates reales. Sólo sesión en memoria y respuestas HTTP son sintéticas; API interceptada y tráfico externo bloqueado, sin envíos reales. Se ejecutaron cuatro viewports (1440×1000, 1024×768, 390×844, 844×390) y 18 estados: Home anónimo sin CSS privado, WhatsApp directo autenticado con CSS fingerprinted sin fallback crudo, altura/flex/paneles, scroll interno de historial largo, composer contenido, borrador multilínea y foco/teclado, tema del sistema claro/oscuro, retorno de panel móvil y navegación real Cuenta/back/forward. Es cobertura automatizada de geometría/interacción en Chrome, **no** revisión visual manual de píxeles ni certificación de todos los navegadores/estados.

R09 añade 15 fixtures de escape y 13 de texto, null/undefined, valores por defecto, Unicode, comillas, HTML ya escapado, coerción de arrays/objetos/Symbol/Date, error de conversión, identidad de fallback, markup real y redacción de tokens. La supresión deliberada del escape de ampersand falla con exit 1; candidato restaurado pasa con exit 0. No se quitaron assertions ni suites previas para conseguir verde.

El clone por red falló por DNS. Se obtuvo después el árbol frontend completo de 443 archivos de `00c5a88c`, verificando todos sus blobs y árbol raíz; no había AGENTS.md en él. Los cambios posteriores también se comprobaron contra sus árboles íntegros. Las dependencias permanecen fijadas al lockfile. Build/contratos locales se ejecutaron con Node 22.23.2; npm local no se presenta como la versión de CI. CI sí usa Node 22.23.2 y npm 10.9.8. El navegador local está bloqueado por política del entorno, no se eludió: la evidencia de navegador procede de CI autorizado. No se afirma una nueva suite local completa de backend.

La preparación temporal de transporte de fuentes vive en ramas `refactor/source-workbench-20260911`, nunca en main ni en estas PR de runtime. No se publican repositorios/dependencias privados como parte del frontend ni se transfieren credenciales. Ese transporte no altera protecciones ni autoriza mantenimiento de datos.

### Continuación precisa de R04 → R05

En frontend `46ca8625` (payment-state sin cambios respecto a `9dc9feb`) y proyección backend `dc397d5e`, se reprodujeron con reloj/objetos sintéticos cuatro assertions defectuosas: `getFinalization(null)`, entrada null en delivery.results, discrepancia raw/proyectado ante sent con resultado sending y plazo de **3900000 ms** con heartbeat una hora futuro. Diagnóstico nuevo: **4/4 casos fallan, exit 1**. No son incidentes productivos demostrados, ni se presentan como corregidos.

Siguiente unidad: fixtures de intercambio y reconciliación POST/GET, política explícita para incertidumbre/versiones/reloj y consumidores de la confirmación. La política de reintento de la UI requiere revisarse junto al clasificador: no convertir una lectura peor, un reloj vencido o un resultado incierto en autorización para repetir efectos. Conservar resultado confirmado frente a GET peor y mostrar un fallo conocido posterior. La proyección privada sigue en backend; sólo contrato/fixtures públicos equivalentes se comparten. Después: dueños claros de transporte/adaptación/documentos/caché en R05, preservando aislamiento por cuenta, invalidación, cancelación y carga diferida.

No se han modificado datos reales, pagos, documentos históricos, mensajes, políticas de seguridad, visibilidad, planes ni proveedores. Revertir significa revertir código por una PR validada, no restaurar datos ni repetir pagos/correos. Este corte no cierra globalmente R01–R17.

---

## Corte inicial conservado · histórico, NO estado vigente

El contenido que sigue se conserva literalmente como evidencia del arranque del prompt v1. Sus frases «pendiente», revisiones, entorno y siguientes pasos **no** sustituyen las tablas vigentes anteriores.

# A00–A17 · registro de ejecución de limpieza

Corte inicial: 2026-09-11 UTC. Este registro documenta ejecución y evidencia; no sustituye las fases de `../ROADMAP.md` ni certifica una entrega completa.

## Fuente, revisiones y límites

El encargo es el «PROMPT MAESTRO — ONION SUPPORT», versión 1.0 del 2026-09-11, facilitado por el propietario. Se han leído sus 18 tareas. El informe `Onion-Support-Auditoria-Repositorios-2026-09-11.md`, el Excel homónimo y `Onion-Support-Auditoria-Evidencias-2026-09-11.zip` no están accesibles entre los archivos de esta sesión ni en la biblioteca consultada. Sus cifras son referencias históricas del prompt, no mediciones nuevas ni evidencia consultada directamente.

| Repositorio | main leído en GitHub | Árbol |
| --- | --- | --- |
| avila199817/onionsupport | `8be48c70223f7471139f063510fdd0065b22c01e` | `bf9bd2622a16bbaf0fe4785d37c1e8ef7a119bb7` |
| avila199817/oniontech | `f4c10c98049e2ec2f4ddc3b576f16e4760158a58` | `ea6e0cc1caa2ea01da2c6469c198fce6b687f81d` |

Ambas referencias coinciden con las revisiones históricas. No había PR abiertos en la consulta inicial. Estos SHA identifican fuente; la verificación productiva se registra separadamente. No se restaura ninguna versión previa al circuito de valoraciones.

La clonación local del frontend falló con exit code 128: `Could not resolve host: github.com`. No se obtuvo un checkout local completo. El entorno disponible tiene Node 22.16.0 y npm 10.9.2; el frontend exige Node >=22.23.2 <23 y npm >=10.9.8 <11. No se ha ejecutado una suite local nueva ni se ha presentado una lectura parcial como repositorio completo. Las lecturas y escrituras de esta unidad usan la API de GitHub sobre revisiones fijadas.

## A00.1 · responsabilidad y gobierno

La unidad inicial añade únicamente `.github/CODEOWNERS` y este registro. `avila199817` tiene permiso `admin` comprobado mediante la API del repositorio; no se añaden identidades supuestas. No existía CODEOWNERS en `.github/`, raíz ni `docs/` del árbol frontend leído. No hay AGENTS.md en la raíz ni en los directorios `.github/` y `docs/` inspeccionados.

El propietario revisa todos los contratos. La responsabilidad técnica que debe conservar cada frontera, según README y documentación vigentes, es:

| Frontera frontend | Responsabilidad a conservar | Responsable humano |
| --- | --- | --- |
| `src/main.js`, `src/app/` | ensamblaje, boot y lifecycle; no negocio financiero | @avila199817 |
| `src/core/`, `src/router/` | HTTP protegido, navegación, configuración y cancelación | @avila199817 |
| `src/views/` | reglas de presentación de cada dominio y compatibilidad de sus exports | @avila199817 |
| `src/features/avatar-system/`, `src/features/entity-overlay/` | identidad visual y sesión modal compartidas | @avila199817 |
| `src/css/`, HTML y recursos públicos | marca, temas, accesibilidad, móvil y contratos de URL | @avila199817 |
| `tools/`, `.github/` | pruebas, build reproducible, frontera confiable y publicación | @avila199817 |

Esto no demuestra que la arquitectura objetivo esté completamente aplicada. No cambia protecciones, permisos efectivos, aprobaciones, workflows, paquetes ni runtime.

Aceptación de esta unidad: diff exclusivamente de gobierno/documentación, contenido releído, controles del PR y del merge correctos. El workflow productivo existente excluye `.github/**` y `docs/**` en `push`; no se solicita despliegue manual para esta unidad. El preview del PR sigue su circuito normal.

A00 permanece **En curso**: faltan el inventario reproducible completo, los presupuestos medidos, la línea base ejecutada y el cierre del mapa de contratos de ambos repositorios.

## Registro por tarea

P0–P3 y dependencias se conservan del prompt. Los detalles de alcance y aceptación no se reinterpretan como trabajo ya realizado. «Pendiente» no significa «No aplicable».

| ID | Prioridad | Dependencias | Estado en este corte | Evidencia o siguiente condición |
| --- | --- | --- | --- | --- |
| A00 | P0 | — | En curso | A00.1: CODEOWNERS frontend y registro en este PR; demás criterios pendientes |
| A01 | P0 | A00 | En curso | Configuración Vite completa leída; cambio de agrupación aún no implementado |
| A02 | P1 | A00 | Pendiente | Comprobar todos los consumidores de incidencias-user-update-turn |
| A03 | P1 | A00 | Pendiente | Migrar cobertura a incidencias-detail-state antes de retirar la implementación inactiva |
| A04 | P1 | A00 | Pendiente | Comprobar consumidores del parche, scripts y procedimiento operativo |
| A05 | P1 | A00 | Pendiente | Fixtures comparables para las dos variantes de plantilla |
| A06 | P1 | A00 | Pendiente | Inventariar operación necesaria y validar imagen real |
| A07 | P1 | A00 | Pendiente | Contrato compartido y secuencias POST/GET de finalización |
| A08 | P1 | A07 | Pendiente | Transferir reglas de capas activas sólo tras A07 |
| A09 | P2 | A00 | Pendiente | Recuperar Familias/Copias y comprobar equivalencia contextual |
| A10 | P2 | A07; A09 | Pendiente | Extracciones acotadas con lifecycle y consumidores probados |
| A11 | P2 | A00; A10 | Pendiente | Grafo y navegación directa/cruzada con guardas conservadas |
| A12 | P2 | A00 | Pendiente | Separación de cálculo/repositorio/CLI; dry-run por defecto |
| A13 | P2 | A00 | Pendiente | Matriz de configuración, recursos y readiness sin secretos |
| A14 | P2 | A00; A01 | Pendiente | Consumidores y cobertura visual antes de retirar compatibilidad |
| A15 | P2 | A00; A07 | Pendiente | Registro de suites y misma cobertura real, sin desactivar checks |
| A16 | P3 | A00; A14 | Pendiente | Preservar contenido legal, URLs y eliminación de datos |
| A17 | P3 | A13; A15 | Pendiente | Autenticación al final, misma política y concurrencia |

## A01 · condición de integración identificada

`vite.config.js` sigue sin el grupo propuesto `invoice-api`. La lectura de `tools/stage-trusted-build.mjs` y `.github/workflows/trusted-pr-integrity.yml` confirma que la reconstrucción usa package.json, lockfile, Vite y tools de la base inmutable, mientras HTML/src/static del candidato son datos. Se exige igualdad de bytes antes del preview.

Por tanto, no se puede asumir que cambiar sólo el Vite del candidato y obtener un build correcto complete A01. Hay que preparar una actualización compatible de tooling y después su activación, manteniendo la misma frontera de confianza; la configuración ya documenta este patrón para private.css. No se modifican ni se omiten verificadores para obtener una comparación favorable.

La API oficial de Rolldown documenta `output.codeSplitting.groups` y `includeDependenciesRecursively`; advierte de cambios de orden de ejecución y de ciclos. Su compatibilidad se debe contrastar además con la versión exacta del lockfile y con pruebas del candidato. La mejora histórica del prompt no se da por reproducida.

## Evidencia exigida para cada continuación

Cada unidad debe añadir ID/subtarea, decisión, archivos/contratos, PR, SHA candidato y de fusión, comandos/entorno/exit code, artefacto/despliegue, mediciones comparables, reversión y bloqueo. El SHA exacto del candidato es el head inmutable comprobado en el PR; no se atribuyen a un head nuevo resultados de uno anterior.

Estados permitidos: Pendiente / En curso / Implementado / Validado / Fusionado / Desplegado y verificado / Bloqueado / No aplicable con evidencia.

En este corte no hay nueva suite, reducción de bundle, fusión ni despliegue certificados. Ninguna tarea completa se declara cerrada. El registro se actualiza con evidencia, no con expectativas.

## Reversión y continuidad

Para A00.1 basta un revert revisado del cambio de gobierno/documentación; no requiere restaurar datos ni desplegar runtime. Para cambios posteriores se conservará la referencia productiva comprobada y se revertirá sólo código mediante el circuito permitido. El modo de emergencia `legacy-root` documentado en BUILD_FOUNDATION no se elige automáticamente: una revisión antigua puede perder capacidades posteriores.

Siguiente operación: verificar este PR, completar la línea base reproducible de A00 y preparar A01 por el mecanismo de tooling/activación compatible. Antes de cada integración, releer main y los controles del candidato exacto. No hay trabajo en segundo plano programado.

Se mantienen prohibidos pagos de prueba reales, reenvíos históricos, cambios de datos, mensajes reales sin autorización específica y cualquier relajación de sesiones, ACL, idempotencia o procedencia del artefacto.
