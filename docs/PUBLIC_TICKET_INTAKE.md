# Public ticket intake — contrato frontend/backend

## Objetivo

La home pública envía una única solicitud al backend mediante:

`POST /api/tickets/public`

El navegador **no** crea por separado usuarios, clientes ni tickets. El backend es la única autoridad de identidad y de vinculación.

El endpoint mantiene **autenticación opcional**: usa la sesión cuando existe y aplica resolución anónima segura por datos de contacto cuando no existe sesión.

Contrato productivo final:

1. Valida y normaliza identidad/contacto.
2. Aplica rate limit por IP e identidad.
3. Resuelve la cuenta por sesión autenticada o, en modo anónimo, por **correo o teléfono**.
4. Si ya existe usuario, reutiliza ese mismo usuario **sin crear ni sobrescribir nada del perfil**.
5. Si no existe usuario por ninguno de los dos identificadores, crea únicamente un usuario `user` pendiente y su activación.
6. La home pública **nunca crea clientes**. La ficha de cliente la crea o gestiona posteriormente el personal de Onion Support cuando corresponda.
7. Crea la incidencia con el mismo generador canónico de IDs que el panel.
8. Mantiene idempotencia y la política de una incidencia en curso por cuenta.

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

- La interfaz muestra `+34` como prefijo visual externo al input.
- El input contiene únicamente los 9 dígitos nacionales, con formato visual `XXX XXX XXX`.
- El payload se normaliza a `+34 XXX XXX XXX`.
- Se admite numeración española cuyo primer dígito nacional sea `6`, `7`, `8` o `9`.
- El backend vuelve a validar y normalizar el teléfono y nunca confía únicamente en el navegador.

## CTA y canal alternativo

Los CTA azules de la home (`Abrir incidencia`) navegan internamente a `#incidencia`; no representan WhatsApp y no deben usar su icono.

WhatsApp permanece como canal alternativo independiente mediante sus enlaces y el botón flotante verde.

## Una incidencia en curso por cuenta

La política productiva es **una única incidencia en curso por cuenta**.

- El backend identifica la cuenta por `userId` canónico y es la autoridad definitiva.
- El frontend, después de una solicitud aceptada, bloquea durante la vista actual nuevos envíos si coincide **el mismo correo o el mismo teléfono**.
- Cambiar solo el correo manteniendo el mismo teléfono, o viceversa, no debe levantar el bloqueo local.
- Si el backend devuelve el conflicto canónico `PUBLIC_TICKET_ACTIVE_EXISTS`, una sesión autenticada puede mostrar el conflicto explícitamente y remitir al panel.
- En modo anónimo la respuesta permanece neutra para evitar enumeración de cuentas o incidencias.

## Reglas de identidad

### Sesión autenticada

Si existe sesión válida, el endpoint admite el `Authorization` normal del cliente HTTP y la identidad de seguridad de la sesión manda sobre los campos escritos en el formulario.

El correo o teléfono introducido en el formulario no cambia el propietario de una incidencia autenticada ni sobrescribe el perfil.

La home no precarga automáticamente el nombre completo del usuario autenticado. Puede precargar otros datos de contacto ya disponibles únicamente como ayuda de formulario; el backend sigue siendo la autoridad canónica.

### Visitante anónimo: resolución por correo O teléfono

El backend busca coincidencias canónicas por ambos identificadores.

- Si solo coincide el correo, reutiliza ese usuario.
- Si solo coincide el teléfono, reutiliza ese usuario.
- Si correo y teléfono coinciden con el mismo usuario, reutiliza ese usuario.
- Si el correo apunta a un usuario y el teléfono a otro distinto, la identidad es inconsistente: no se crea ticket, no se crea usuario y no se modifica ninguna cuenta.
- La respuesta exterior de un visitante anónimo no revela cuál de estos casos ocurrió.

### Usuario nuevo

Solo cuando **no existe ningún usuario por correo ni por teléfono**, el backend crea:

- un usuario `user` pendiente;
- los lookups técnicos necesarios;
- la incidencia;
- una activación de un solo uso.

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

Si correo y teléfono identifican cuentas distintas, no se realiza ninguna mutación. La respuesta anónima permanece neutra para no revelar qué identificador existe.

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
- `userId`: obligatorio y asignado por backend.
- `clienteId`: opcional; solo se reutiliza si ya existe una relación válida. La home no lo crea.
- técnico/asignación: política canónica del backend.
- adjuntos en el intake inicial: ninguno.

La `Idempotency-Key` en claro no se persiste como identificador visible del ticket; se conservan únicamente los hashes técnicos necesarios para replay/consistencia.

## Respuesta pública

Para peticiones anónimas, la respuesta exterior es deliberadamente neutra. No confirma si el usuario era nuevo, activo, pendiente, desactivado, si coincidió por correo o por teléfono, ni si se detectó una identidad inconsistente.

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

En una sesión autenticada el backend puede devolver el identificador real del ticket y `activationRequired: false`, permitiendo indicar que la incidencia ya está disponible en el panel.

Nunca se devuelven tokens, hashes, información interna de Cosmos, datos de otras cuentas ni detalles útiles para enumeración.

## Seguridad obligatoria

- Rate limit específico por IP e identidad, además del limiter global de API.
- Límites de longitud y normalización server-side.
- Validación de email, teléfono y dirección además de la validación del navegador.
- Teléfono normalizado y validado de nuevo en backend.
- Honeypot y controles anti-spam/abuso.
- No confiar en `source`, `channel` ni identificadores enviados por el cliente para autorización.
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
