# A01 · transición confiable de toolchain

Capacidad de base para adoptar una versión nueva de la herramienta de build sin
debilitar la validación confiable. Este documento es el modelo de amenaza y el
procedimiento; el código vive en `tools/toolchain-transition.mjs` y su contrato
en `tools/toolchain-transition-contract.mjs`.

Estado: **Vite 8.3.0 adoptado y transición cerrada.** No hay declaración activa
en `main`; el modo estricto vuelve a ser el comportamiento normal.

---

## 1 · Qué protege la validación confiable

El job «Validate dist with trusted base tooling» reconstruye el candidato así:

| procedencia | qué aporta |
|---|---|
| **base inmutable** | `package.json`, `package-lock.json`, `vite.config.js`, `tools/` |
| **candidato** | `src/`, HTML y estáticos declarados en `stage-trusted-build.mjs` |

y después exige que el `dist` y el `build-metadata` que publicó el candidato
sean **byte a byte idénticos** a esa reconstrucción.

La propiedad que afirma es: *los bytes publicados se derivan del tooling
confiable aplicado a datos del candidato*. Lo único que aporta el candidato son
datos.

**Qué ataque evita.** Una PR que trajera su propia maquinaria de build
--un `vite.config.js` con un plugin añadido, un lockfile que resuelve un tarball
distinto con el mismo nombre, un `scripts.build` que ejecuta otra cosa-- podría
emitir un artefacto con código que no está en `src/`, y avalarlo con sus propios
contratos, que también vendrían del candidato. Al reconstruir con el tooling de
la base, esa maquinaria nunca llega a ejecutarse: si los bytes publicados no
salen del tooling confiable, la comparación los rechaza.

**Por qué una actualización legítima de Vite la viola.** «Igual» significa aquí
«reproducible con el tooling viejo». Un compilador nuevo emite bytes distintos
--en el caso de 8.3.0, 22 bytes en el helper `__vitePreload`--, así que la
propiedad que se afirma es exactamente la que la actualización tiene que romper.
Las PR #595, #653 y #688 no eran PR malas: eran PR imposibles.

---

## 2 · Qué NO es esta capacidad

No existe ninguna bandera que el candidato pueda activar. En concreto, y por
contrato ejecutable:

- no se lee ninguna declaración del candidato --su copia no se abre jamás;
- no se aceptan cambios arbitrarios de `package.json` ni de `package-lock.json`;
- no se desactiva la igualdad de bytes: sigue exigiéndose, contra la
  reconstrucción con el toolchain autorizado;
- `vite.config.js` y `tools/` siguen viniendo **siempre** de la base, con
  transición autorizada o sin ella;
- no hay lógica de «el toolchain cambió, salta la comparación».

La autorización **ya está fusionada en la base** antes de que el candidato
exista. El candidato no se autoriza: coincide, o falla.

---

## 3 · La declaración

`tools/toolchain-transition.json`, en la base. Ausente = modo estricto.

```json
{
  "schema": "onionsupport.toolchain-transition.v1",
  "package": "vite",
  "from": "8.2.2",
  "to": "8.3.0",
  "packageJsonSha256": "<sha256 del package.json exacto que se autoriza>",
  "packageLockSha256": "<sha256 del package-lock.json exacto que se autoriza>"
}
```

**Por qué los dos digests.** Una cadena de versión no ata contenido: con sólo
`"vite": "8.3.0"` un candidato podría traer un lockfile con otro `resolved` u
otro `integrity`. El digest del lock cierra eso, porque ata cada versión, cada
URL y cada integridad del árbol entero.

Y el digest de `package.json` no es redundante: si el lock sale del candidato,
`package.json` tiene que salir con él --`npm ci` exige que concuerden-- y
`package.json` contiene `scripts`, que la reconstrucción **ejecuta**
(`npm run build`). Sin atarlo, una transición autorizada le daría al candidato
ejecución arbitraria dentro del build confiable.

**Por qué además el nombre del paquete.** Los digests son la autoridad real, así
que sin más comprobaciones autorizarían *cualquier cosa* que hubiera dentro de
esos dos archivos, incluido un segundo salto no mencionado. La puerta exige que
la diferencia de dependencias entre la base y el par autorizado sea
**exactamente** la transición declarada: una entrada, la nombrada, y nada más.
Así el texto que el revisor lee al fusionar describe lo que de verdad autoriza.

**Por qué no hay caducidad por tiempo.** Un reloj dentro de un build reproducible
es nondeterminismo. La caducidad es por contenido: en cuanto la base declara la
versión de destino --es decir, en cuanto la activación se fusiona-- el `from` de
la declaración deja de coincidir con la base y la autorización se invalida sola.
Una declaración olvidada no autoriza nada.

---

## 4 · Ciclo de vida · AUTORIZAR → ACTIVAR → CERRAR

### T1 · capacidad (esta PR)

Añade `tools/toolchain-transition.mjs`, su contrato y este documento, y enseña a
`tools/stage-trusted-build.mjs` a consultarlo. **No añade ninguna declaración y
no actualiza nada.** Al fusionarse, `main` se comporta exactamente igual que
antes: sin declaración, el resolutor devuelve `base` sin leer nada más.

No toca `.github/workflows/`: el job ya invoca `stage-trusted-build.mjs` desde
el checkout de la base, así que la capacidad entra por donde ya se decidía la
procedencia.

### T2 · autorizar

Quien vaya a hacer la actualización prepara el árbol candidato --sube la versión
y regenera el lock con el Node/npm declarados-- y genera la declaración **desde
ese árbol ya actualizado**, sin escribir ningún digest a mano:

```
node tools/toolchain-transition.mjs --authorize vite 8.2.2 8.3.0 /ruta/al/candidato
```

El resultado se fusiona en `main` en su propia PR. **Ese merge es el acto de
autorización**, y es humano y revisable. La PR no actualiza nada todavía.

> La declaración ata los bytes exactos de `package.json`. Si `main` mueve ese
> archivo entre la autorización y la activación --en este repositorio casi toda
> PR da de alta un contrato en `scripts`--, la declaración queda obsoleta y hay
> que regenerarla. El rechazo lo dice nombrando los dos digests, el observado y
> el autorizado. Es fallo cerrado a propósito: una autorización que ya no
> describe el árbol que autoriza no debe seguir valiendo.

### T3 · activar

La PR de activación cambia **sólo** `package.json` y `package-lock.json`, y
exactamente a los bytes autorizados. La puerta comprueba, en este orden:

1. la base sigue en `from` (si no, la declaración está caduca);
2. los dos digests del candidato coinciden con los autorizados;
3. la diferencia de dependencias es exactamente la transición declarada;
4. el par autorizado declara y resuelve de verdad la versión `to`.

Sólo entonces la reconstrucción confiable instala el toolchain autorizado. El
resto no se mueve: `vite.config.js` y `tools/` siguen saliendo de la base, y la
igualdad de bytes se sigue exigiendo contra esa reconstrucción.

### T4 · cerrar

Una PR retira `tools/toolchain-transition.json`. Vuelve el modo estricto.

La retirada es higiene, no seguridad: en cuanto T3 se fusiona, la base declara
`to` y la declaración ya no autoriza nada. El resolutor vuelve a modo estricto,
lo que permite que la propia PR T4 se valide con normalidad; después se retira
la declaración para que el estado del repositorio diga la verdad.

---

## 5 · Modos de fallo

Todos verificados en `tools/toolchain-transition-contract.mjs`, 24 bloques, y
probados por mutación: se rompe la implementación a propósito y cada contrato
caza su regresión.

| situación | resultado |
|---|---|
| sin declaración | modo estricto, no se lee nada más |
| declaración malformada, con claves de más, con rango semver o con `from == to` | rechazo |
| declaración que es un enlace simbólico, o mayor de 1024 bytes | rechazo |
| el candidato escribe su propia declaración | se ignora: no se lee jamás |
| el candidato salta a otra versión | rechazo |
| un byte distinto en el lock | rechazo |
| dependencia añadida, o segunda actualización de polizón | rechazo |
| coincide `package.json` pero no el lock, o al revés | rechazo |
| la declaración nombra un paquete y los archivos mueven otro | rechazo |
| el par autorizado no declara o no resuelve la versión `to` | rechazo |
| declaración aún presente tras la activación | modo estricto: ya no autoriza nada |
| el candidato cambia `vite.config.js` o `tools/` | se ignoran: vienen de la base |
| PR normal que sólo da de alta un contrato en `scripts` | modo estricto, sigue funcionando |
| cualquier rechazo | no deja el destino a medio construir |

---

## 6 · Relación con A01 del registro de limpieza

`docs/releases/2026-09-11-repository-cleanup.md` §«A01 · condición de integración
identificada» dejó escrito que hacía falta «una actualización compatible de
tooling y después su activación, manteniendo la misma frontera de confianza», y
señaló que la configuración ya documentaba ese patrón para `private.css`.

Esto es ese mecanismo, con la misma forma que `tools/invoice-api-split.mjs`:
**la capacidad vive en la base, el interruptor es un dato**. La diferencia es de
dónde sale el dato. En el split de facturas el interruptor es un archivo del
candidato, porque sólo reordena chunks. Aquí decide qué compilador se ejecuta
dentro de la reconstrucción confiable, así que el interruptor tiene que estar en
la base: por eso la declaración es un archivo de `tools/`, con digests, y no una
bandera.
