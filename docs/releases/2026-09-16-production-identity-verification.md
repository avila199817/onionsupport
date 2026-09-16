# Verificación de producción por identidad inmutable · 2026-09-16

## Problema

Dos PRs del mismo día (#671 y #672) se pusieron en rojo en «Verify production matches expected main» con una lista de `/assets/js/<nombre>-<hash>.js: HTTP 404, expected 200`. En ambos casos el diff de la PR no tenía nada que ver: `main` había avanzado varias veces mientras el job corría y producción seguía sirviendo un despliegue anterior. Un relanzamiento manual, una vez producción alcanzó, los puso en verde.

Que la única forma de resolverlo fuera relanzar a mano es el síntoma: **el veredicto era función del reloj, no del candidato.**

## Causa raíz

La puerta comparaba dos magnitudes que se mueven por separado y no ataba ninguna a la otra.

El lado «esperado» salía del payload del evento:

```yaml
TRUSTED_SHA: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha
  || github.event_name == 'pull_request' && github.event.pull_request.base.sha
  || github.sha }}
```

En una PR eso es `base.sha`: **la punta de `main` en el instante en que GitHub generó el evento**. El lado «real» era el contenido vivo de producción, que lo produce otra tubería con su propia cola y su propia latencia.

Y hay algo peor que una carrera transitoria. El despliegue declara:

```yaml
  push:
    branches: [main]
    paths-ignore:
      - ".github/**"
      - "docs/**"
```

Un commit en `main` que sólo toque esos caminos **no despliega nunca**. La punta de `main` puede ser, por construcción, una revisión que producción no va a servir jamás. Comparar contra ella no es una carrera que se resuelva esperando: es una expectativa equivocada de origen.

Los guardias de inmutabilidad que ya existían (regex de 40 hex, `git rev-parse HEAD` contrastado en los dos checkouts) son reales, pero ortogonales: prueban **cómo** se hizo el checkout de un SHA, nunca **cuál** era el SHA correcto que esperar.

## Cambio

### A · Pre-merge: la expectativa es un despliegue, no una rama

La base se captura **una vez, al arrancar el job**, preguntándole a la propia tubería de despliegue cuál fue el último despliegue productivo que terminó bien (`event=push`, `status=success`, `per_page=1`). A partir de ahí es inmutable: nunca se vuelve a leer un nombre de rama.

Tres estados, en `tools/production-baseline-policy.mjs`, módulo puro sin E/S:

- **`exact-match`** — producción coincide byte a byte con la base capturada.
- **`superseded-by-newer-verified-main`** — no coincide, y existe un despliegue correcto **estrictamente posterior**. Producción avanzó mientras corríamos.
- **`genuine-mismatch`** — todo lo demás, **incluido cualquier caso en que falte la evidencia para decidir**. Falla cerrado.

### Por qué «superseded» no esconde nada

Es el argumento que sostiene el diseño, así que está escrito en el propio módulo y no se da por supuesto.

Aplazar es seguro **sólo porque la revisión que supera no se cree bajo palabra**: todo despliegue correcto dispara esta misma puerta por `workflow_run`, en la pata que reconstruye ese head SHA exacto y compara producción entera contra él. Cuando una ejecución pre-merge informa `superseded`, la revisión a la que producción se movió **ya está cubierta por su propia verificación obligatoria y exacta**. Una discrepancia real sigue poniendo un run en rojo; simplemente se le atribuye a la revisión que la posee, en vez de a una PR que no tiene nada que ver.

Si esa pata post-deploy desapareciera, `superseded` dejaría de ser seguro. Por eso `production-dist-workflow-regression.mjs` afirma que existe.

### B · Post-merge: la cadena se cierra

En la pata del despliegue la identidad ya era exacta (`workflow_run.head_sha`), pero faltaba un eslabón: se probaba «un rebuild de este SHA coincide con producción», nunca «los bytes que se enviaron son los que este SHA reproduce».

Ahora se descarga el artefacto que el despliegue subió y validó antes de tocar el token de Azure, y se exige que el digest de su `release-manifest.json` sea idéntico al del rebuild. Ese digest se pasa además como `EXPECTED_MANIFEST_DIGEST` al verificador, que ya lo soportaba (`verify-deployed-dist.mjs:15`) pero al que **nadie se lo estaba pasando por este camino**.

La cadena queda: `head_sha` → build reproducible de esa identidad → digest del manifiesto → artefacto realmente desplegado → revisión servida → verificación byte a byte.

Un digest de manifiesto es estrictamente más fuerte que el SHA: contiene `{path, bytes, sha256}` de los 193 ficheros del `dist` más el propio `gitSha`, así que una sola comparación fija todos los bytes y la identidad a la vez.

### Dónde vive el clasificador

El job hace ahora dos checkouts con trabajos distintos, y la distinción es de confianza, no de comodidad:

| Checkout | Revisión | Contenido |
| --- | --- | --- |
| `verification-tooling/` | la ya desplegada (`steps.trust.outputs.sha`) | el código que **inspecciona** producción |
| `workflow-tooling/` | la del propio workflow (sin `ref:`) | el código que **interpreta** la contabilidad de esta ejecución |

El verificador se queda pinchado a la revisión confiable porque apuntarlo al candidato dejaría que una PR se calificase a sí misma. El clasificador es de la segunda clase: sólo lee dos ids de ejecución y un booleano, y no toca producción en ningún momento.

Importarlo desde la primera fue un error de arranque, no una decisión discutible, y así falló la primera ejecución: la revisión confiable es por construcción la ya desplegada, así que precede a cualquier módulo que introduzca este cambio, y el paso murió con `ERR_MODULE_NOT_FOUND`. `production-dist-workflow-regression.mjs` fija ahora las cuatro condiciones (de dónde se importa, de dónde no, que el checkout del workflow no lleve `ref:`, que el verificador sí lo lleve) y que la pata que clasifica sea la misma que hace ese checkout.

### Correcciones de paso

- **`concurrency`.** La clave era `production-verification-main` para todo `workflow_run`, con `cancel-in-progress: true`: **el despliegue siguiente cancelaba la verificación del anterior**, y un despliegue realmente malo podía quedar sin informar. Ahora la clave es el SHA desplegado, y sólo las PRs se superan entre sí.
- **`retention-days: 1` → `30`** en el artefacto de producción. Era el único registro inmutable de lo que se envió, y se evaporaba antes de poder usarse como evidencia.

## Pruebas

`tools/deployed-dist-verifier-regression.mjs` (ya en `test:trusted-build`) reproduce los seis escenarios como tabla pura, sin red ni reloj:

| # | Escenario | Estado |
| --- | --- | --- |
| 1 | `main` no se mueve | `exact-match` |
| 2 | `main` avanza durante la verificación | `superseded-by-newer-verified-main` |
| 3 | producción sirve A mientras `main` ya es B | `exact-match` (la base es lo desplegado, no la punta) |
| 4 | producción ya sirve B y el job capturó A | `superseded-by-newer-verified-main` |
| 5 | discrepancia real | `genuine-mismatch` |
| 6 | despliegue post-merge del SHA correcto | identidad exacta, sin clasificación |

Más dos tablas negativas que cambian **un solo hecho cada vez** y exigen `genuine-mismatch`: run anterior, mismo run, misma revisión, despliegue cancelado, despliegue fallido, tubería inalcanzable; y base inexistente, con SHA corto, con id no numérico o de un despliegue fallido.

Pruebas negativas verificadas a mano sobre el módulo: quitar la exigencia de «estrictamente posterior» dispara *«Unverified production accepted as superseded: an older run»*; devolver verde sin evidencia dispara *«… a cancelled deploy»*.

`tools/production-dist-workflow-regression.mjs` vigila ahora la forma del YAML: exige los pasos nuevos y **prohíbe** `pull_request.base.sha` y `TRUSTED_SHA: … github.sha`, con el orden capturar → confiar → comparar → clasificar, y que el paso de clasificación no lleve `continue-on-error` y contenga `exit 1`. Prueba negativa verificada: reponer `base.sha` dispara *«The production gate must never expect production to serve a pull request's base tip»*.

## Riesgo

El cambio es de CI y **no toca `src`**. El riesgo que importa es debilitar la garantía, y se ataca de frente: `superseded` exige cuatro hechos positivos simultáneos (existe candidato, con identidad bien formada, de un despliegue correcto, estrictamente posterior y de otra revisión); si falta cualquiera, es rojo. No hay ninguna rama que lleve de «no se pudo determinar» a verde, y `permissions` sólo gana `actions: read`, de lectura.

Queda documentado un hueco **preexistente** que este cambio no cierra ni disimula: la puerta de producción nunca verificó el código de la PR; eso lo cubre `trusted-pr-integrity.yml`, que compila el head del candidato, despliega una preview y la verifica con su propio `TRUSTED_MANIFEST_DIGEST`.

## Invariante nueva

**Los workflows de producción razonan sobre identidades inmutables, no sobre un `main` móvil.**
