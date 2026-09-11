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
