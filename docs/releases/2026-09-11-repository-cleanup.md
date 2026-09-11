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


---

## Continuación v3 · C02/C03, lote de confirmación de Usuario · 2026-09-11

**Estado: Implementado con validación local acotada; C02/C03 siguen En curso. No fusionado ni desplegado por este lote.** Este añadido no sustituye la reconciliación v2 de #581, que seguía abierta/en borrador con head `c0285ce857d2432340f3a1b125d3bd9335bcfafc`. La tabla inicial anterior es histórica: A01–A06 y los lotes #578–#580 no se reabren. No se crea otro registro canónico.

### Recuperación y bases

La ejecución interrumpida había creado `fix/c02-c03-confirmed-user-identity-20260911` en `46ca86254c770d5609e2b2d2b0a4c5767f7e3456`, sin código añadido. Al retomar, frontend main era `ad514a3a8f2cd2a369717589919eb100254b7996`, que añade #582 (SEO); backend main seguía `dc397d5e1666cd2f7dab49d7f7c9236f678aa6dd`. Se conserva #582 íntegra. El primer commit remoto `06b3f70d726718b82bf5a41129e22859cd6cedd3` guarda deliberadamente la regresión roja antes del arreglo.

Se recuperaron archivos completos del frontend `00c5a88c147d6773e71a2fb496b41fbaa4042d89`: 443 blobs/modos verificados, árbol `79d51427fdf6448c864b41cfeeac6f381b0dcc94`. El diff hasta main confirma que Core, Usuarios y el runner modificado no cambiaron en #579–#582. Las pruebas locales usan ese checkout más el candidato, **no** se presentan como pruebas del árbol completo de main actualizado. El commit local `f7d0740615f35e50c4e0247d5422b58e62b54e0a` identifica ese entorno y no es un commit de GitHub. El candidato remoto se construye sobre el árbol completo de `ad514a3a` y requiere sus propios gates exact-head.

### Defectos reproducidos y corrección real

1. `updateUsuarioRequest` publicaba `notifyDomainChanged("usuarios")` antes de incorporar la respuesta al store; el wrapper de comodidad lo hacía después. La prueba nueva, con PATCH sintético confirmado y API/store/evento/templates reales, observa **Ana Ruiz / AR** dentro del listener cuando debería observar **Beatriz Mora / BM**: exit 1 en la base; exit 0 tras corregir. No se dispara manualmente el evento para fingir una escritura.
2. Un GET anterior que fallaba podía devolver el snapshot capturado antes del PATCH. Una segunda regresión falló al esperar Beatriz y recibir Ana; el fallback ahora consulta el estado confirmado actual. Los 401/403 no se ocultan mediante caché.

La autoridad sigue en `src/views/usuarios/usuarios.api.js`: integra los campos definidos de la respuesta en el store existente, conserva los ausentes, invalida lecturas anteriores y sólo entonces notifica una vez. `updateUsuario` pasa a ser una referencia a `updateUsuarioRequest`; se retira su segundo commit de estado posterior al evento. No se añade otro bus, store ni normalizador de avatares.

El mismo dueño serializa escrituras del mismo ID, permite personas distintas en paralelo y no envía un sucesor si el resultado anterior falló o quedó incierto. No es un reintento automático. Rechaza DTO con ID ajeno y nombre canónico explícitamente inválido. El nombre propio sólo se aplica a Core si coincide ID y generación de sesión; no sustituye al administrador al editar otra persona.

Core añade una generación de sesión y avisa a los dueños del registro de módulos existente para liberar sus recursos. Usuarios registra su limpieza; no se cambian las políticas de Auth. El scope distingue sujeto/sesión/rol/permisos; con sessionId estable, rotar token no invalida trabajo vigente. El token nunca se persiste en el marcador de caché. Las respuestas de escrituras de una sesión anterior no se publican en otra y no se presentan como prueba de que el servidor no ejecutó el efecto.

Foto: ausencia/undefined conserva la imagen; false explícito, null o URL vacía confirmada limpia sus aliases; una URL nueva los sustituye. El modelo no rescata una foto antigua cuando `hasAvatar=false`. No se modifica el contrato de escritura de imagen ni se afirma haber probado sus callbacks DOM.

### Pruebas y coste del lote

Node local **22.23.2**, dependencias del lock verificado; npm local **10.9.2**, distinto del 10.9.8 exigido por CI. El navegador local devolvió `net::ERR_BLOCKED_BY_ADMINISTRATOR`; no se eludió esa restricción.

| Comprobación local | Resultado y límite |
| --- | --- |
| `confirmed-user-write-contract.mjs` | Base exit 1; candidato exit 0. PATCH real del dueño con Http sustituido, evento no manual, store y templates reales, reapertura desde caché, identidad/tono estable, homónimo/admin aislados, escritura fallida sin falsa confirmación y cero GET extra. No formulario/navegador. |
| `confirmed-user-lifetime-contract.mjs` | 11 escenarios, exit 0: foto parcial/borrado/reemplazo; GET tardío y fallido; 401/403; DTO ajeno; serialización; incertidumbre sin reenvío; logout/cambio de cuenta; permisos/relogin; rotación; invalidación de lista/detalle. |
| Runner `tools/private-domain-contracts.mjs` | Exit 0 con las dos suites nuevas y todas las anteriores conservadas, incluidos identidad, eventos, contadores y snapshots fiscales de Home. |
| Core runtime/snapshot, Auth selector/logout | Exit 0; sin relajar comprobaciones existentes. |
| Build y `check:dist` | Exit 0 sobre el candidato local registrado. El primer intento sin commit fue rechazado por la comparación de fuente con Git; se registró y reconstruyó, no se desactivó el guard. |
| `validate:source` completo | No completado: agotó el tiempo del comando. Los pases parciales no equivalen a exit 0 de la suite completa. |
| Navegador, CI remoto, preview y producción | No acreditados por estas pruebas locales; verificar por head/run. Ninguna fusión ni publicación se atribuye a este documento. |

Las nuevas suites se conectan al runner existente, no a un workflow adicional. Los blobs runtime probados son Core `3b42ffd24778584c23cabf6e43c42740333bc60a` y Usuarios `5b3961d0f02196bf60e04f22cf6d861e010c581c`.

Medición local declarada sobre `00c5a88c` más candidato: cierre estático app **156823 B**, Auth **63350 B**, unión bootstrap/Home **215797 B**; permanecen bajo 158000/64000/218000 y invoice-api sigue fuera. No son métricas productivas de #582 ni ahorro de latencia; los grupos se solapan y no se suman. Runtime fuente: 214 inserciones y 98 retiradas en dos archivos; crece para corregir contrato/concurrencia, no se vende como recorte. Las pruebas/runner se contabilizan aparte.

### Matriz de cobertura y continuación obligatoria

| Ámbito | Estado real |
| --- | --- |
| API de actualización → store → evento | Corregido y probado con respuesta sintética; dos entradas públicas usan el mismo commit. |
| Templates Usuarios, listado/detalle y reapertura desde caché | Probados como renderizadores reales; no como DOM montado de navegador. |
| Modelo de foto, ID, tono y homónimos | Probado; carga/error/versionado de imagen montada pendiente. |
| Usuarios/Cuenta: formulario de renombrado reportado | No localizado en los controladores/templates inspeccionados. Usuarios ofrece alta y detalle; Cuenta no expone allí edición de nombre. No se inventó un formulario ni se declaró reproducido el recorrido completo reportado. |
| Home, Clientes, Incidencias/autores/técnicos, Facturas/selectores, Cuenta, topbar/sidebar, Correo, WhatsApp y soporte público | Propagación viva de nombre/avatar pendiente de migración y matriz navegador. Un template actualizado al renderizar no acredita que un host ya montado se reconcilie. |
| Creación y estadísticas de Usuarios, otros stores/cachés, varias pestañas | No migrados a este protocolo por el lote. Cancelación independiente de consumidores deduplicados, permisos completos y revalidación externa siguen pendientes. |
| C01 / R08 / R10 / R11 | Motor modal y migración transversal pendientes: no modificados ni declarados terminados por pasar contratos antiguos. |
| R04 → R05 | Continuación obligatoria tras el ciclo funcional C01–C03; cuatro defectos sintéticos de finalización y cadena de API aún sin corregir por este lote. |

Siguiente trabajo exacto: acreditar el origen del renombrado disponible en el producto sin usar datos reales; conectar la presentación mutable a AvatarSystem y a consumidores con vínculo explícito de ID/scope, con escritura confirmada, hosts montados y remount probados. Después completar apertura/lifecycle/shell único y coordinación transversal; no sustituir ese alcance por la prueba de API aquí entregada. Conservar R07, resto de R09–R16 y R17/Auth al final; prioridades Rxx/Axx y entregas previas no se renumeran ni cierran.

Reversión: revertir de forma revisada este lote de código y pruebas juntos, nunca restaurar usuarios/facturas ni repetir comandos, pagos o mensajes. No se modificaron datos reales, backend, proveedores, permisos, workflows, secretos ni seguridad para obtener resultados.
