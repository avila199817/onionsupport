# La fotografía vigente es identidad; el identificador del backend no es una etiqueta · 2026-09-17

Tres unidades y un arnés. Ninguna reabre un alcance cerrado: no se toca Vite, ni el
barrido de exportaciones, ni el parcheador de Incidencias, ni el diseño de Clientes,
ni impuestos, ni la agrupación de estados, ni permisos, ni infraestructura.

## V1 · La fotografía vigente no es un dato del documento

### El pendiente que había que comprobar antes de aceptarlo

La limitación declarada era: *«no puedo actualizar el avatar de Facturas porque releer
la factura tocaría su instantánea fiscal»*. No era una imposibilidad arquitectónica.
Tres hechos medidos lo desmontan:

| Hecho | Medición |
| --- | --- |
| El DOM ya llevaba un índice de identidad | `src/features/avatar-system/index.js` escribía `data-avatar-identity="<huella>"` en **todos** los hosts gestionados… y **nadie lo consultaba nunca**. |
| La huella es estable aunque el nombre mostrado sea otro | `{userId:"u-cliente-1"}` y `{userId, email, name:"SOCIEDAD ANA SL"}` dan la **misma** huella `ljhl3h`. Sólo email → `j9grzm`; sólo nombre → `eajikn`. |
| La hoja de guardarraíles estiliza por atributo, no por pantalla | `components/avatar-system.css` opera sobre `[data-avatar-image]` y `[data-avatar-state]`. Repintar un host no depende de la superficie que lo contiene. |

Es decir: **se puede actualizar la presentación sin releer el documento**.

### Separación

| A · datos del documento | B · identidad visual vigente |
| --- | --- |
| identidad legal, nombre fiscal, dirección, conceptos, fechas, base, impuestos, total | la fotografía de la persona |
| instantánea histórica, inmutable | estado actual, cambia cuando su dueño la cambia |

Actualizar B no reescribe A. El recorrido lo comprueba sobre el build real: tras confirmar
la foto, la factura muestra la identidad vigente **y conserva razón social e importe**,
con **0 escrituras de dominio** y **1 sola carga de documento** en toda la sesión.

### Lo que se añadió, y lo que no

Una sola operación en la autoridad que ya existía: `applyConfirmedAvatar(identity, photo)`.
No hay otra caché por modal, ni otro bus global, ni otro cargador de perfiles, ni una
relectura del documento, ni sondeo, ni refresco global de vistas. No se añade `Date.now()`
a ningún render ni se alteran URLs firmadas. El baseline de superficie exportada de
`avatar-system` sube 48 → 49 en el mismo commit, a conciencia, como exige su contrato.

### Anti-intuición, por construcción

Una fotografía se registra **sólo** bajo alias de identificador: `user:`, `email:`,
`username:`. **Nunca bajo nombre.** Un host identificado únicamente por nombre tiene otra
huella y es inalcanzable por esta vía. Una factura sin vínculo inequívoco con un perfil
conserva su reserva: en el contrato, la identidad `nkdnj7` mantiene su inicial «C» mientras
otra identidad cambia de foto. **No se enlazan personas por parecido de nombre.**

### Lo que el cambio de foto no puede hacer

Marcar el formulario como modificado, borrar borradores, cambiar el scroll, reconstruir la
capa, retirar su aislamiento, duplicar escuchas o dejar vivas suscripciones de modales
cerrados. No abre ninguna suscripción nueva, así que no hay ninguna que fugarse;
`destroyAvatarSystem` vacía el registro.

**Límite declarado:** el único flujo real de cambio de fotografía que existe hoy es el del
propio usuario en `/cuenta` (`POST`/`DELETE /api/users/avatar`). **No existe** un camino por
el que un administrador cambie la foto de otra persona: no hay endpoint, `buildUpdateUsuarioBody`
no lleva campo de foto, `USUARIOS_ACTIONS` no tiene acción de edición y `updateUsuarioRequest`
no tiene llamador en la interfaz. Se retiró la cobertura que había escrito para ese camino
en lugar de declararla: **no se prueba un flujo que no existe.**

## V2 · Un identificador del backend no es una etiqueta en castellano

Capitalizar un token desconocido no es traducirlo. «Chimney Sweeping» y «Trivial» no son
etiquetas canónicas en castellano por el hecho de que un formateador sepa poner mayúsculas.

Cuatro cosas que estaban confundidas, ahora separadas: **valor técnico**, **normalización**,
**etiqueta de presentación** y **política de agrupación**. La lista agrupa; el dominio nombra.

| Caso | Resultado |
| --- | --- |
| Código conocido | Etiqueta canónica en castellano. |
| Código desconocido | Fallback nombrado del campo: «Estado no reconocido», «Prioridad no reconocida», «Tipo no reconocido». El valor técnico se conserva para diagnóstico. |
| Texto libre del usuario | Su propio texto, escapado. |

**Declarar una etiqueta no puede mover un valor.** `labelWith` lee las etiquetas declaradas;
`normalizeWith` sólo lee alias. Medidos los 52 valores agrupados antes y después: **7 cambios
visibles** (las familias `archived*` y `cancelled*`, que se presentaban en inglés), **45 sin
cambio**, y la normalización **byte a byte idéntica**. No cambian los valores enviados a la
API, ni los conteos, ni la pertenencia a grupos, ni la ordenación, ni los permisos, ni las
reglas de cierre y reapertura. Un estado «En proceso» sigue perteneciendo al grupo abierto
sin presentarse como «Abierta».

Durante la edición **no se guarda un fallback visual como nuevo valor** del dato original.

Home es una superficie multidominio y conserva su propia tabla: sólo se corrige su fuga de
identificador, distinguiendo código conocido, código desconocido (no se pinta) y texto libre
(se respeta).

## V3 · Negativas que se pueden romper

Una negativa sólo cuenta si se ha comprobado que **retirar** la corrección la hace fallar.

| Negativa | Tipo | Mutación y resultado medido |
| --- | --- | --- |
| N1 · un clic sin identidad no resuelve al primer registro | defecto | verificada en la fase anterior |
| N2 · cancelar un alta no deja bloqueada la siguiente | defecto | verificada en la fase anterior |
| N3 · una carga abortada no impide ni contamina la siguiente | **guarda** | ver abajo |
| N4 · la fotografía vigente no se ignora | defecto | retirar la actualización del consumidor deja la foto antigua en lista y detalle |
| N5 · ningún código del backend se lee como etiqueta | defecto | verificada: antes se pintaba «Chimney Sweeping» |
| N6 · el icono de una acción no desaparece | defecto | verificada en la fase anterior |
| N7 · no se pierden la posición de lectura ni el borrador | **guarda** | `canPatchDetail = false` → **«La lectura cambió de 432 a 0»** |

### N3 es una guarda, y se declara como tal

No encontré ningún camino en el que la aplicación reutilice hoy una lectura abortada. **No la
presento como reproducción de un defecto que no he encontrado.** Lo que sí hice fue encontrar
la mutación que la hace fallar, y medir por qué otras tres no.

Primero hubo que hacer que la prueba pudiera fallar. Dos causas medidas:

1. **El detalle se pinta con lo que ya traía la fila y se hidrata después**, así que una
   hidratación abortada era invisible. El arnés añade una marca que **sólo** viene en la
   respuesta del detalle, nunca en la lista.
2. **Los pasos de carrera reutilizaban incidencias ya abiertas**, servidas por la caché: la
   carrera no llegaba a existir. El mundo sintético reserva cuatro incidencias nuevas.

Y sobre todo: el paso reabría **otra** incidencia. El vuelo compartido de lecturas de detalle
está indexado por identificador, de modo que sólo puede envenenarse en la misma ficha que se
abortó. Ahora reabre `INC-SINT-5` tras abortarla y exige su propia lectura autoritativa.

**Mutación que la hace fallar** (las dos condiciones que lo impiden, retiradas a la vez):
que la hidratación del detalle lea siempre forzada (`incidencias.detail-integrity.js`) y que
el vuelo compartido se limpie también al rechazarse (`incidencias.api.js`). Resultado:
**«el detalle INC-SINT-5 no se pintó»**.

**Tres mutaciones inertes, con su razón medida** — se declaran porque una casilla de negativas
no se completa inventando un defecto:

| Mutación | Por qué no rompe nada |
| --- | --- |
| Un único `AbortController` para todas las lecturas | Cada apertura estrena **controlador de vista**: `EntityOverlay` monta un controlador `detailOnly` por apertura y lo destruye al cerrar. Medido con instancias etiquetadas: la primera apertura es la instancia 2, la siguiente la 3. Ninguna señal per-controlador cruza un cierre. |
| Compartir la tarea en vuelo del *implementation* aunque el llamador traiga señal | La lectura de la interfaz va **siempre forzada** (`force: true`), así que salta la caché de detalle y el mapa de vuelos del implementation. |
| Dejar de limpiar el vuelo rechazado del coordinador | Por lo mismo: con `force: true`, el coordinador devuelve la lectura sin registrar vuelo. |

## V4 · Un recorrido, no una lista de piezas

Dieciséis pasos, **una sola sesión, ninguna recarga de documento**, sobre el build real: router
real, montaje de features real, controladores reales, cascada CSS completa y en orden, assets
del build y API sintética. No hay una segunda lista manual de CSS.

Se ejecuta en **dos entornos** — escritorio 1440×900 y emulación móvil 390×844 — y además con
**dos entradas en frío por entorno** (`/facturas` y `/cuenta`) que **no pasan antes por
Incidencias**, para que ningún paso dependa de un orden afortunado.

Datos sintéticos. Ninguna persona real. **Ninguna escritura sobre usuarios, fotografías,
incidencias o facturas reales.**

## V5 · Contabilidad exacta

«164 contratos» no explica nada. Esto es lo que se ejecutó, dónde y con qué.

### Entorno declarado

| Dato | Valor medido |
| --- | --- |
| Máquina | contenedor de ejecución remota, Linux 6.18.44 |
| Node | v22.22.2 (CI fija v22.23.2 y npm 10.9.8) |
| Navegador | `/opt/pw-browsers/chromium` → `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` · **Chromium 141.0.7390.37** |
| Variable necesaria | `CHROME_BIN=/opt/pw-browsers/chromium`. Sin ella, `avatar_runtime_dom_contract` corta la cadena en el primer paso («set CHROME_BIN for the avatar DOM contract»). |
| `playwright-core` | 1.63.0; su navegador propio sería `chromium_headless_shell-1243`, que **no está instalado** (sólo `-1194`) |
| Anchuras | recorrido 1440×900 y 390×844; `spa-modal-regression` 1280×900 |

### Suites

| Script | Ejecutables | Resultado |
| --- | --- | --- |
| `validate:source` | 39 pasos (tres agrupan varios contratos cada uno) | 39/39 correctos |
| `test:trusted-build` | 4 | 4/4 |
| `build` | 1 | correcto |
| `check:dist` | 21 | 21/21 |
| `test:browser:dist` | 25 de primer nivel; `private-domain-contracts --browser` expande a 15 subcontratos | 24 correctos · **1 fallo** |

`npm run validate` termina con código 0.

### Escenarios, contados por las propias herramientas

Recorrido integrado 16 pasos × 2 entornos + 2 entradas en frío × 2 entornos ·
matriz de propietarios 51 · modal de propietario privado 21 · ciclo de vida modal 22 ·
alta de facturas 13 · confirmación de facturas 11 · pagadas 12 · consentimiento 13 ·
conteos de Home 28 · altas/cancelaciones privadas 9 · correo 8 · avatar vigente 8 ·
anfitrión compartido 6 · features por montaje 5 · carga visual 8 combinaciones × 53 primitivas.

### Aserciones

El tooling no lleva un contador global y **no me lo invento**. En los contratos de esta
fase: 57 llamadas a `assert` y 12 esperas de estado observable en el recorrido, 25 y 8
en el contrato de fotografía vigente, y 31 en el de etiquetas.

### Negativas

**Verificadas en esta fase, rompiéndolas a propósito:** cuatro.

| Negativa | Mutación | Resultado medido |
| --- | --- | --- |
| N3 · aborto y reapertura | lectura no forzada + vuelo compartido sin limpiar al rechazarse | «el detalle INC-SINT-5 no se pintó» |
| N7 · lectura y borrador | `canPatchDetail = false` | «La lectura cambió de 432 a 0» |
| N4 · fotografía vigente | retirar la actualización del consumidor | la foto antigua permanece en lista y detalle |
| confirmación obsoleta | retirar la comparación con la sesión | `private-profile-browser-contract` falla en Cuenta, barra lateral y Home |

**Declaradas de fases anteriores, no reverificadas hoy:** N1, N2, N5 y N6.

### Fallos, omisiones y pruebas no ejecutadas

- **Fallos: 1.** `SPA document-pdf` (ver abajo).
- **Omisiones: 0.** No se ha desactivado, saltado ni relajado ninguna prueba.
- **No ejecutadas: 0.** La cadena `&&` se detiene en el fallo, así que los 14 ejecutables posteriores se ejecutaron uno a uno: los 14 correctos.

### Atribución de los dos fallos de navegador

Método, para los dos: línea base inmutable **anterior** a la unidad — `9492edee`, el
padre del primer commit de esta fase — en un árbol de trabajo aparte, construida y
ejecutada en esta misma máquina, con el mismo `CHROME_BIN` y el mismo Node.

**1 · `factura-create-browser-contract` · RESUELTO, no absorbido.**
No era «el fallo conocido»: el contrato mantenía su propia lista de rutas de navegador
y no leía `CHROME_BIN`, así que caía en el navegador que Playwright espera tener
descargado y moría antes del primer escenario. Falla igual en `9492edee`, y el archivo
no se toca desde #613 (2026-09-15): la limitación no la introduce esta fase. Corregido
usando el localizador común. Pasa de 0 a **13 escenarios ejecutados y correctos**.

**2 · `SPA document-pdf` · NO RESUELTO, limitación del entorno, declarada.**
El escenario espera el visor de PDF nativo del navegador:
`chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/`. Esa extensión viaja con Google
Chrome, no con la compilación de Chromium de Playwright: `chromium-1194/chrome-linux/resources/`
contiene sólo `accessibility` e `inspector_overlay`, sin componente `pdf`. Sin la
extensión, el marco nunca navega y `waitForEvent("framenavigated")` agota sus 10 s.

Evidencia de que no lo introduce el cambio:

| Comprobación | Resultado |
| --- | --- |
| Falla en la línea base inmutable `9492edee`, misma máquina y configuración | sí, con el mismo mensaje |
| CI ejecuta realmente el escenario | sí: `trusted-pr-integrity.yml` corre `npm run test:browser:dist`, y `spa-modal-regression` está en la cadena sin condicionales ni saltos |
| CI lo pasa | sí: run 35158536665, paso «Build and self-check candidate artifact», 22:37:37→22:42:34 UTC, conclusión `success`, sobre el SHA `a052ed4f` |
| Por qué allí sí | el runner `ubuntu-24.04` tiene `/usr/bin/google-chrome`, que sí trae el visor de PDF |

**No se desactiva la prueba.** Queda como limitación del entorno local, con su causa
identificada, no como «fallo conocido» sin explicación.
