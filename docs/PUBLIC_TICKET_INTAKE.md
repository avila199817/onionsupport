# Public ticket intake — contrato frontend/backend

## Objetivo

La home pública envía una única solicitud al backend mediante:

`POST /api/tickets/public`

El navegador **no** crea por separado usuarios, clientes ni tickets. El backend es la única autoridad de identidad y de vinculación.

El endpoint mantiene **autenticación opcional**, pero la sesión no decide por sí sola el propietario de la incidencia. El backend resuelve siempre los datos de contacto enviados —**correo y teléfono**— y sólo considera el flujo autenticado cuando esa identidad resuelta coincide exactamente con el actor de la sesión.

Contrato productivo final:

1. Valida y normaliza identidad/contacto.
2. Aplica rate limit por IP e identidad.
3. Resuelve siempre la cuenta por **correo y teléfono enviados**, exista o no una sesión iniciada.
4. Si ya existe usuario por esos identificadores, reutiliza ese mismo usuario **sin crear ni sobrescribir nada del perfil**.
5. Si no existe usuario por ninguno de los dos identificadores, crea únicamente un usuario `user` pendiente y su activación, incluso si el navegador mantiene abierta la sesión de otra cuenta.
6. Si correo y teléfono apuntan a cuentas distintas, falla de forma cerrada: no crea ticket, no crea usuario y no modifica ninguna cuenta.
7. La sesión sólo habilita el tratamiento autenticado cuando la cuenta resuelta por contacto es el mismo usuario autenticado.
8. La home pública **nunca crea clientes**. La ficha de cliente la crea o gestiona posteriormente el personal de Onion Support cuando corresponda.
9. Crea la incidencia con el mismo generador canónico de IDs que el panel.
10. Mantiene idempotencia y la política de una incidencia en curso por cuenta.

## Request

```json
{
  "fullName": "Nombre Apellidos",
  "email": "usuario@dominio.com",
  "phone": "+34 600 000 000",
  "address": "Calle y número",
  "addressLine2": "Piso, puerta o escalera",
  "postalCode": "08001",
  "city": "Barcelona",
  "province": "Barcelona",
  "country": "España",
  "subject": "El portátil no arranca",
  "description": "Descripción detallada del problema",
  "source": "public-home",
  "channel": "web"
}
```

La dirección de un alta nueva viaja estructurada: `address` es calle/número y se complementa con `addressLine2`, `postalCode`, `city`, `province` y `country`. `addressLine2` es opcional; CP, ciudad, provincia y país se validan de nuevo en backend. Para usuarios existentes estos campos nunca sobrescriben el perfil canónico.

El frontend no envía roles, `userId`, `clienteId`, estado de cuenta, tokens, flags de activación ni IDs de ticket elegidos por el visitante.

Cada envío lleva una cabecera `Idempotency-Key` con formato `YYYYMMDD:<nonce>`. La misma key se conserva al reintentar la misma solicitud sin modificar el formulario; al editar cualquier campo se genera una nueva. La idempotencia no participa en el formato del ID visible de la incidencia.

## Alcance telefónico

La versión actual acepta únicamente teléfonos de España.

- La interfaz muestra el contexto español y el input contiene los 9 dígitos nacionales con formato visual `XXX XXX XXX`.
- El payload se normaliza a `+34 XXX XXX XXX`.
- Se admite numeración española cuyo primer dígito nacional sea `6`, `7`, `8` o `9`.
- El backend vuelve a validar y normalizar el teléfono y nunca confía únicamente en el navegador.

## CTA y canal alternativo

Los CTA azules de la home (`Abrir incidencia`) navegan internamente a `#incidencia`; no representan WhatsApp y no deben usar su icono.

WhatsApp permanece como canal alternativo independiente mediante sus enlaces y el botón flotante verde.

## Una incidencia en curso por cuenta

La política productiva es **una única incidencia en curso por cuenta**.

- El backend identifica la cuenta por el `userId` canónico obtenido después de resolver correo y teléfono enviados.
- El frontend, después de una solicitud aceptada, bloquea durante la vista actual nuevos envíos si coincide **el mismo correo o el mismo teléfono**.
- Cambiar solo el correo manteniendo el mismo teléfono, o viceversa, no debe levantar el bloqueo local.
- Si el backend devuelve `PUBLIC_TICKET_ACTIVE_EXISTS`, sólo una sesión que sea realmente la propietaria de la identidad resuelta puede recibir el conflicto explícito y la referencia al panel.
- Cuando el contacto enviado pertenece a otra cuenta o el flujo no puede tratarse como autenticado, la respuesta permanece neutra para evitar enumeración de cuentas o incidencias.

## Reglas de identidad

### Autoridad de correo + teléfono

Los campos enviados son la autoridad de vinculación del intake público. La existencia de una cookie o token válido **no sustituye** esta resolución.

El backend busca coincidencias canónicas por ambos identificadores en todos los casos:

- Si solo coincide el correo, reutiliza ese usuario.
- Si solo coincide el teléfono, reutiliza ese usuario.
- Si correo y teléfono coinciden con el mismo usuario, reutiliza ese usuario.
- Si el correo apunta a un usuario y el teléfono a otro distinto, la identidad es inconsistente: no se crea ticket, no se crea usuario y no se modifica ninguna cuenta.
- Si ninguno coincide, la identidad es nueva y se provisiona un usuario pendiente.

La respuesta exterior no debe revelar a un tercero cuál de estos casos ocurrió.

### Sesión autenticada

El frontend puede enviar el `Authorization` normal del cliente HTTP cuando existe sesión, pero el backend usa esa sesión únicamente como contexto adicional.

La sesión se clasifica como `AUTHENTICATED` **sólo** cuando el usuario encontrado mediante el correo/teléfono enviados es exactamente el mismo `userId` que el actor autenticado.

Por tanto:

- sesión A + correo/teléfono de A → incidencia de A y respuesta autenticada;
- sesión A + correo/teléfono de una cuenta B existente → incidencia vinculada a B, sin sobrescribir B y sin atribuirla a A;
- sesión A + correo/teléfono que no pertenecen a ninguna cuenta → alta pendiente nueva + incidencia de esa nueva identidad;
- sesión A + correo de B y teléfono de C → identidad inconsistente, sin mutaciones.

La home no precarga automáticamente el nombre completo del usuario autenticado. Puede precargar otros datos de contacto ya disponibles únicamente como ayuda de formulario; el visitante puede editarlos y el backend vuelve a resolver la identidad desde los valores finalmente enviados.

### Usuario nuevo

Solo cuando **no existe ningún usuario por correo ni por teléfono**, el backend crea:

- un usuario `user` pendiente;
- los lookups técnicos necesarios;
- la incidencia;
- una activación de un solo uso.

Esta regla se mantiene aunque el navegador tenga iniciada la sesión de otra cuenta: una sesión ajena no puede secuestrar la propiedad del intake.

El usuario nuevo nace con `clienteId: null`. No se crea documento de cliente desde la home.

El enlace enviado por email apunta al flujo público:

`https://onionsupport.com/activate-account/<token>`

La vista mantiene compatibilidad con `?token=`. El token en claro solo viaja en el email y en memoria durante la orquestación; en Cosmos se persiste su representación segura según el contrato backend.

Al definir la contraseña se activa el **usuario**. La creación o gestión posterior de la ficha de cliente corresponde al personal de Onion Support y queda fuera del intake público.

### Usuario ya existente, esté activo o pendiente

La regla es estricta: **reutilizar sin overwrite**.

El intake público no cambia nombre, correo, teléfono, dirección, username, estado, contraseña, roles ni `clienteId` del usuario existente. Tampoco crea un usuario duplicado.

La solicitud se vincula a ese mismo `userId`. Si el usuario ya posee una relación de cliente válida, el backend puede reutilizarla en la incidencia; si no existe, la incidencia funciona con `userId` y `clienteId: null`.

El intake público no crea ni reemplaza el cliente y no rota ni emite una activación nueva para un usuario que ya existe.

### Cuenta desactivada

Una cuenta existente sigue resolviéndose como la misma identidad y no se sobrescribe desde el formulario. Cualquier política adicional sobre acceso o tratamiento interno pertenece al backend/personal de Onion Support, no al navegador.

### Identidad inconsistente

Si correo y teléfono identifican cuentas distintas, no se realiza ninguna mutación. La respuesta exterior permanece neutra para no revelar qué identificador existe.

## Ticket

El ticket público reutiliza el contrato canónico de incidencias del panel.

- ID visible: `INC-YYYYMMDD-XXXXXX`.
- El sufijo tiene exactamente 6 caracteres hexadecimales, igual que en el panel.
- La idempotencia se gestiona por separado y nunca amplía, sustituye ni reserva IDs visibles.
- `subject`: asunto normalizado.
- `description`: cuerpo normalizado.
- `status`: `pending`.
- `priority`: `medium`.
- `category`: `general`.
- `source` persistido: `public_home`.
- `channel`: `web`.
- `requesterSnapshot`: generado desde identidad canónica del servidor.
- `userId`: obligatorio y asignado por backend después de resolver el contacto.
- `clienteId`: opcional; solo se reutiliza si ya existe una relación válida. La home no lo crea.
- técnico/asignación: política canónica del backend.
- adjuntos en el intake inicial: ninguno.

La `Idempotency-Key` en claro no se persiste como identificador visible del ticket; se conservan únicamente los hashes técnicos necesarios para replay/consistencia.

## Respuesta pública

Cuando el backend no puede demostrar que la identidad resuelta pertenece al actor autenticado, la respuesta exterior es deliberadamente neutra. No confirma si el usuario era nuevo, activo, pendiente, desactivado, si coincidió por correo o por teléfono, ni si se detectó una identidad inconsistente.

Forma canónica:

```json
{
  "ok": true,
  "success": true,
  "accepted": true,
  "ticketId": null,
  "incidenciaId": null,
  "activationRequired": null,
  "message": "Solicitud recibida. Revisa tu correo para continuar."
}
```

Por tanto, el frontend **no afirma que se creó una incidencia** cuando recibe esta forma neutra. Comunica de manera genérica que:

- si los datos identifican una cuenta existente, se reutiliza sin sobrescribir el perfil;
- si no existe usuario, se crea el usuario pendiente y se envía la activación;
- no se crean fichas de cliente desde la home;
- si ya existe una incidencia en curso, no se abre otra.

Sólo cuando la identidad resuelta por contacto es exactamente la cuenta de la sesión el backend puede devolver el identificador real del ticket y `activationRequired: false`, permitiendo indicar que la incidencia ya está disponible en el panel.

Nunca se devuelven tokens, hashes, información interna de Cosmos, datos de otras cuentas ni detalles útiles para enumeración.

## Feedback de interfaz y reintentos

La home distingue visual y semánticamente cuatro estados: `info`, `success`, `warning` y `error`.

- Los errores de validación son `error` y deben conservar mensajes de campo.
- Rate limit, indisponibilidad temporal y fallos de red son `warning`: no se presentan como una confirmación ni se borran los datos escritos.
- En un fallo transitorio, el CTA pasa a `Reintentar incidencia`.
- Mientras el formulario no cambie, se conserva la misma `Idempotency-Key`, por lo que el reintento reutiliza el mismo intento lógico para reducir el riesgo de duplicados.
- `warning` y `error` usan semántica accesible de alerta; `info` y `success` permanecen como estados informativos.

La UI también muestra una nota estática, no enumerativa, que explica que la cuenta se decide por correo y móvil aunque exista otra sesión iniciada.

## Seguridad obligatoria

- Rate limit específico por IP e identidad, además del limiter global de API.
- Límites de longitud y normalización server-side.
- Validación de email, teléfono y dirección además de la validación del navegador.
- Teléfono normalizado y validado de nuevo en backend.
- Honeypot y controles anti-spam/abuso.
- No confiar en `source`, `channel` ni identificadores enviados por el cliente para autorización.
- Nunca permitir que una sesión ajena sustituya la identidad obtenida del correo/teléfono enviados.
- Nunca sobrescribir una cuenta existente desde una petición pública.
- Nunca crear un cliente desde el intake público.
- Token de activación aleatorio, de un solo uso y con expiración únicamente para altas nuevas.
- Redacción de tokens y PII sensible en logs/respuestas.
- Idempotencia ante reintentos razonables.
- `Idempotency-Key` permitida explícitamente por la política CORS del backend.

## Consistencia y compensaciones

Usuarios, lookups y tickets viven en contenedores/particiones diferentes, por lo que el flujo es una **transacción lógica** con compensaciones; no se simula una transacción Cosmos cross-container inexistente.

El contenedor de clientes es de solo lectura/reutilización para este flujo: puede consultarse una relación ya existente, pero la home no crea ni modifica clientes.

Para una identidad `NEW`, el correo de activación es crítico porque contiene el token raw. Si ese correo falla después de crear el ticket, el backend intenta revertir de forma segura el ticket y la identidad recién provisionada. Los correos informativos de creación de incidencia son fail-soft y no cambian la autoridad de los datos persistidos.
