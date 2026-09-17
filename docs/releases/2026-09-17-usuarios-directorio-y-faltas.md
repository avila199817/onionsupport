# Usuarios vuelve a cargar su directorio · 2026-09-17

## El defecto

La vista Usuarios no mostraba ningún usuario y escribía en pantalla
**«directoryKey is not defined»**.

## La causa, con su commit

`src/views/usuarios/usuarios.cursor.js` llamaba a `directoryKey` en dos sitios
(`isInternalEmployeeUsuario`, sobre los marcadores de rol y de audiencia) sin
definirlo ni importarlo.

El commit `9551fdb2` — *«key authorities by semantics: codeKey, recordKey,
labelKey; no ambiguous normalizeKey» (#646)* — retiró la función local. Su
propio mensaje lo dice: *«two were slugKey exactly: **directoryKey in the
Usuarios cursor (dead copy, removed)** and key in the Incidencias options (1
call, imports slugKey)»*. La de Incidencias recibió su import; **ésta no**, y no
estaba muerta: tenía dos llamadas vivas en el mismo fichero.

El cuerpo retirado era `slugKey` letra por letra.

## Por qué nadie se enteró

`fetchUsuariosCursorPage` se llama en cada carga de página, así que el
`ReferenceError` salía siempre. Pero el `catch` del controlador lo convertía en
un estado de error de la vista, de modo que **`pageerror` quedaba vacío**:
medido en el build real, `pageErrors: []`, `GET /api/users: 1`, `filas: 0`.
Una prueba que sólo mirase `pageerror` no habría visto nada.

## La corrección

El consumidor importa la autoridad y la llama por su nombre:

```js
import { slugKey } from "../../core/slug-key.js";
...
  .map(slugKey)
```

Sin alias local —un alias vuelve a parecer una copia—, sin global, sin `typeof`,
sin `catch` que devuelva una lista vacía y sin stub de prueba.

## Que no baste con «desaparece el error»

Esa clave decide el límite entre el directorio funcional de Usuarios y las
identidades internas de Empleados. Cualquier corrección que devolviera algo
--identidad, cadena vacía-- también haría desaparecer el mensaje, y además
metería a los empleados en la lista.

El contrato `tools/usuarios-directory-contract.mjs` sirve un endpoint
controlado con **tres** personas del directorio y **cinco** identidades
internas, cada una marcada por un campo distinto y escrita con mayúsculas,
espacios, guiones o acentos, y comprueba **quiénes** aparecen, no cuántos.

Medido antes de escribir esos datos: `normalizeUsuariosCollection`
**canonicaliza `role`** contra el conjunto conocido, así que «Super Admin»
llega al filtro como `admin` y un valor que el producto no conoce, como
«team-member», se convierte en `user` —y esa persona pertenece de verdad al
directorio—. `roles[]`, `personType`, `accountType` e `isStaff` sí llegan tal
cual: son los campos que ejercitan la clave.

Ocho escenarios: arranque en frío, búsqueda, tres filtros de estado, orden,
apertura del usuario pulsado, salida y regreso por el router con un solo
documento, lista vacía legítima (que **no** ofrece «Reintentar») frente a fallo
de carga (que sí), y reintento tras un error controlado.

## Sólo habla quien puede responder

Aparte de la corrección funcional: la vista enseñaba el texto del motor porque
`errorMessage` lo toma de `error.message`. Esa función **extrae**; presentar es
de la vista. Usuarios declara ahora su política en `humanErrorText`: un error
que trae estado HTTP o código —lo que distingue una respuesta del backend de una
falta de programación— habla con su propio texto; sin ninguno de los dos manda
el texto por defecto que declara cada llamada. Las seis presentaciones del
módulo pasan por ella.

Se decide por los hechos que la autoridad ya calcula, **no por el nombre de la
clase del error**: el producto asigna nombres propios (`CuentaApiError`,
`WhatsAppApiError`, `AuthLogoutError`) a errores que sí llevan texto para el
usuario, y una regla por nombre los habría dejado mudos.

**Dónde NO va la regla, y por qué.** La escribí primero en `core/errors.js`. El
contrato de grafo de arranque la rechazó: `bootstrapPublicHome` mide 218567 con
un techo de 218600 —**33 bytes de margen**— y la regla, ya compactada a una
expresión regular y un ternario, costaba **91**. No subí la cota: una política de
presentación de vistas privadas no la paga cada visitante de la web pública. En
el dominio cuesta **0**: el cierre vuelve a medir 218567 exactos.

Comprobado que no silencia al backend: en el escenario 8 del contrato, «El
servidor no está disponible.» se sigue mostrando.

## Negativas verificadas

| Mutación | Resultado medido |
| --- | --- |
| Volver a `.map(directoryKey)` | el contrato falla: «Usuarios no pintó ninguna fila en frío» |
| Volver a `.map(directoryKey)` **con** la política puesta | la pantalla dice «No se pudieron cargar los usuarios.», no el texto del motor |
| Retirar `humanErrorText` | el contrato de extracción falla: «Usuarios declara su política de presentación» |

La segunda fila es la prueba directa de la política sobre el camino real: no se
puede provocar una falta de programación desde el arnés sin tocar el producto
—se comprobó con JSON roto y con elementos no-objeto, y las capas resisten—, así
que el inyector honesto es el propio defecto.

## Alcance

Sólo se tocan `usuarios.cursor.js` (un import y dos llamadas), `core/errors.js`
(la regla) y sus contratos. No cambian importes, impuestos, documentos,
permisos, códigos enviados a la API, reglas de agrupación ni la semántica de
cierre y reapertura.
