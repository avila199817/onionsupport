# El perfil del técnico enseña las valoraciones que ya existían

## El defecto

El flujo de Facturas mostraba una valoración privada de cinco estrellas y, al
mismo tiempo, el perfil del técnico decía «0,0 / 5», «0 opiniones» y prometía que
«la valoración se activará en una fase posterior». Las tres frases eran falsas: la
valoración existía, estaba persistida y tenía dueño.

## La causa medida

No faltaba la relación. `bindService` (backend) resuelve el técnico **en el
servidor** al crear el vínculo de la invitación --exige que los seis alias del
ticket coincidan y, si no, falla-- y lo congela en `binding.technicianId` antes de
enviar el correo. El navegador nunca la envía y una reasignación posterior del
ticket no mueve nada: el vínculo guarda el técnico de entonces.

Lo que faltaba era **leerla**. El perfil no preguntaba por ella: rellenaba la
tarjeta con una constante de marcador (`TECHNICIAN_RATING_INITIAL`, media 0 y
recuento 0) y la presentaba como si fuera el dato.

## La autoridad corregida

- **Backend** (`oniontech`, unidad C, ya desplegada): `GET
  /api/facturas/tecnicos/:technicianId/valoraciones` agrega lo que ya está
  escrito. La consulta proyecta **números**, no documentos: ni comentario, ni
  identidad del cliente, ni solicitud de contacto salen del contenedor. La media
  se calcula en un solo sitio y sin valoraciones no hay nota (`average` es
  `null`, no un cero).
- **Frontend** (esta entrega, unidad D): el perfil pregunta por la **misma
  identidad** que el vínculo congeló --el `assignedToUserId` del ticket, que es
  el `lookupUserId` con el que el modal ya pide el usuario-- y presenta lo que
  recibe. No suma, no promedia y no copia lo que Facturas tenga en pantalla.

## Regla de atribución

Se pregunta por el técnico asignado al servicio, resuelto en el servidor. Nunca
por el usuario conectado, el emisor de la factura, el receptor del correo, el
autor del comentario, quien pulsó un botón, alguien con el mismo nombre ni «el
único técnico presente». La respuesta declara a quién describe: **si el
`technicianId` recibido no es el preguntado, es un error, no un dato** --el perfil
de A no puede terminar enseñando el resumen de B.

## Estados explícitos

Los seis son distintos entre sí y ninguno se disfraza de otro:

| Estado | Qué significa | Qué se ve |
| --- | --- | --- |
| `loading` | se está preguntando | «Consultando valoraciones…», sin nota |
| `value` | dato confirmado, al menos una valoración | `4,0 / 5` y el recuento |
| `empty` | confirmado que no hay ninguna | «Sin valoraciones», **no un 0** |
| `restricted` | la sesión no está autorizada al agregado | «No disponible en tu sesión» |
| `unresolved` | no hay identidad con la que preguntar | «Técnico sin identificar» |
| `error` | falló la consulta | el motivo y **«Reintentar»**, sin recargar |

## Una sola fórmula

La nota se formatea **una vez**, dentro de la vista del resumen. La cabecera, la
tarjeta «Valoración», el recuento de «Opiniones» y el marcador de estrellas leen
ese mismo objeto; ninguno vuelve a componerla. El agregado de incidencias
resueltas deja de publicar `ratingAverage` / `ratingCount`: dos fuentes para un
mismo número era justo el defecto.

## Privacidad

El endpoint conserva la autorización que ya permitía leer esas respuestas
(`requireAdminLocal`). **Acceso a un perfil técnico no equivale a acceso al
agregado**, y no se amplía ninguna audiencia en silencio: una sesión sin permiso
recibe el estado `restricted`, que no es «sin valoraciones». No se envía ningún
dato privado al navegador para ocultarlo después.

Queda **pendiente de decisión del propietario** si un cliente debe ver el
agregado de su técnico. Mientras no exista esa política, la rama no-admin se
queda en `restricted`.

## Coste medido de arranque

El módulo que habla con la API de valoraciones pasa a compartirse entre dos
features perezosas, así que el empaquetador le da su propio trozo. El **único**
crecimiento es el manifiesto de precarga de `enhancements` nombrándolo: +48 bytes
en bruto (10081 → 10129; unión de arranque 218563 → 218611). No hay código nuevo
de arranque y no se precarga nada para la Home pública: esa entrada sólo es
alcanzable desde los ámbitos `facturas` e `incidencias`. El techo pasa a 218700.

## Lo que NO se ha tocado

Importes, impuestos, PDFs, documentos fiscales, reglas de cierre o reapertura,
permisos del directorio, políticas de privacidad ni datos de trayectoria. No se
ha migrado ni escrito nada histórico: esto es una lectura.
