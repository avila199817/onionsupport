# Identidad del cliente, iniciales, título del avatar y selección en la Agenda · 2026-09-19

## Problema

- **Una sola inicial en clientes nuevos.** No era un problema de datos: la regla de iniciales copiaba a Fluent Persona, que con cuatro o más tokens conserva sólo la primera letra. «Mohamed Yakhlef el Allali» → «M», «Nicolas del Castillo Luque» → «N», mientras «Jesús Ávila Granados» (tres tokens) → «JG». Los registros antiguos parecían correctos porque casi todos tienen dos o tres tokens.
- **Nombre antiguo en la Agenda.** La cita guarda `destinatarioNombre` al crearse y el backend proyectaba esa copia en listado y detalle; el frontend la pintaba como identidad actual. Renombrar al cliente no tocaba la copia.
- **Un día con citas no se seleccionaba desde la rejilla principal.** La lista de citas (`.agenda-day-events`) ocupa el resto de la casilla y recibía los clics de su zona vacía; como no es una acción, nada respondía. La superficie de selección quedaba debajo.
- **Avatares sin nombre completo.** Sólo una plantilla escribía `title`; el resto de avatares (iniciales o foto) no exponía el nombre canónico.

## Cambio

### Una regla de iniciales

`avatarInitials` (`src/features/avatar-system/identity.js`, `avatar-identity.v6-first-last-initials`): primera inicial + inicial del **último** token del nombre limpio; un solo token conserva una letra; entrada vacía o no representable conserva el respaldo del producto («ON»). La limpieza previa sigue quitando paréntesis, puntuación, guiones y apóstrofos, así que «PAVI RIF, S.L.» → «PS» y «Jean-Luc O'Brien» → «JO».

Los consumidores que preferían un campo `initials` precalculado por otro sistema (barra lateral, viewmodel de Home) derivan ahora de la autoridad. El backend alinea sus dos ayudantes (sesión y factura) a la misma regla; la copia guardada en una factura sigue mandando porque es un documento histórico.

### Nombre canónico e identidad vigente

- El nombre se resuelve en `userNameFromIdentity` (`name` → alias históricos → nombre + apellidos) y lo consume el avatar. No se añaden respaldos locales.
- El backend (`oniontech`, `router/citas/index.js`) relee el nombre vigente de cada destinatario distinto en las proyecciones administrativas de citas (listado, detalle y respuestas de mutación): una lectura por usuario, no por cita, en lotes de ocho, con la copia guardada como respaldo si el usuario no existe. La copia (`destinatarioNombre` en el documento) no se reescribe: es el saludo del correo de aquel momento.
- El frontend de la Agenda no guarda ninguna copia propia entre montajes: al volver a la Agenda tras renombrar, chip, inspector y detalle muestran el nombre vigente.

### Contrato global de título

El runtime compartido (`src/features/avatar-system/index.js`) escribe `title="<nombre completo canónico>"` en cada host de avatar que gestiona, con iniciales o con foto, y lo actualiza al cambiar el nombre. Respeta un `title` explícito de la plantilla (marca los suyos con `data-avatar-title="identity"`) y nunca expone un alias técnico (correo) como título.

### Agenda

- `.agenda-day-events { pointer-events: none }` y `pointer-events: auto` en sus botones: la zona vacía de un día con citas llega a la superficie de selección.
- Un clic dentro de una casilla que no sea una acción selecciona ese día (`onViewClick`).
- Mini calendario y rejilla principal ya compartían `state.selected`; ahora ambos caminos son alcanzables con ratón y teclado.

## Contratos

- `.github/scripts/avatar_identity_authority_contract.mjs`: tabla canónica de iniciales (dos, tres y cuatro o más tokens, empresa con puntuación, Unicode, espacios, guiones, apóstrofos, un token, entradas vacías, registro partido en nombre y apellidos).
- `.github/scripts/avatar_runtime_dom_contract.mjs`: título en avatar de iniciales y de foto, actualización tras renombrar, título explícito respetado, alias de correo nunca expuesto, barra lateral «MO».
- `tools/agenda-citas-browser-contract.mjs` (24–26): día con citas seleccionable con un clic real en la zona de citas, mini y principal con una sola fecha, la cita sigue abriéndose, «+N más», teclado, y cliente renombrado sin rastro del nombre antiguo.
- `oniontech/tools/cita-http-contracts.mjs` (8): nombre vigente en listado, detalle y mutación; copia guardada intacta; usuario desaparecido conserva la copia; proyección de usuario sin nombres.

## Orden de despliegue

Backend primero (`oniontech` proyecta el nombre vigente); el frontend es compatible con ambos backends porque sigue leyendo `destinatarioNombre`.
