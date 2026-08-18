# Public ticket intake — contrato frontend/backend

## Objetivo

La home pública envía una única solicitud al backend. El navegador **no** crea por separado un usuario, un cliente y después un ticket.

Endpoint productivo:

`POST /api/tickets/public`

El backend orquesta:

1. Validación y normalización de identidad/contacto.
2. Rate limit por IP y email.
3. Resolución segura de identidad.
4. Creación o reutilización de usuario/cliente cuando corresponda.
5. Creación idempotente de la incidencia vinculada a la identidad correcta.
6. Emisión del email de activación cuando corresponda.

## Request

```json
{
  "fullName": "Nombre Apellidos",
  "email": "cliente@dominio.com",
  "phone": "+34 600 000 000",
  "address": "Calle, número, CP, localidad",
  "subject": "El portátil no arranca",
  "description": "Descripción detallada del problema",
  "source": "public-home",
  "channel": "web"
}
```

El frontend no envía roles, `userId`, `clienteId`, estado de cuenta, tokens, flags de activación ni IDs de ticket elegidos por el cliente.

Cada envío lleva además una cabecera `Idempotency-Key` con formato `YYYYMMDD:<nonce>`. La misma key se conserva si una petición falla y el usuario reintenta sin modificar el formulario; al editar cualquier campo se genera una key nueva. El backend mantiene además un fallback determinista de idempotencia.

### Alcance geográfico inicial

La primera versión del alta pública acepta únicamente teléfonos de España.

- El formulario parte de `+34` por defecto.
- El frontend normaliza el teléfono a `+34 XXX XXX XXX`.
- Deben existir exactamente 9 dígitos nacionales después del prefijo de España.
- Para este formulario de contacto se admite numeración española estándar cuyo primer dígito nacional sea `6`, `7`, `8` o `9`.
- El backend vuelve a validar y normalizar el teléfono; nunca confía sólo en la validación del navegador.
- Si en el futuro se habilitan otros países, esta restricción debe convertirse en una política explícita compartida entre frontend y backend.

### CTA y canal alternativo

Los CTA azules de la home (`Abrir incidencia`) son navegación interna hacia el formulario `#incidencia`; no representan WhatsApp ni deben usar su icono.

WhatsApp permanece como canal alternativo independiente mediante sus enlaces y el botón flotante verde.

## Reglas de identidad

### Sesión autenticada

El mismo endpoint admite autenticación opcional. Si la SPA tiene una sesión válida, el POST permite el `Authorization` normal del cliente HTTP y el backend toma la identidad de seguridad de la sesión. El correo escrito en el formulario nunca cambia el propietario del ticket.

Si no existe sesión, el mismo endpoint funciona de forma anónima y aplica el flujo de verificación por email.

La home pública no precarga automáticamente el nombre completo del usuario autenticado en el formulario; el cliente lo introduce explícitamente. El acceso al panel sí puede mostrar la identidad de sesión según el comportamiento normal de la cabecera.

### Correo nuevo

El backend crea una cuenta `user` pendiente, su cliente pendiente, la incidencia y una activación de un solo uso.

El enlace enviado por email apunta al flujo público de activación bajo:

`https://www.onionsupport.com/activate-account/<token>`

La vista frontend mantiene además compatibilidad con `?token=`. El token en claro sólo viaja en el correo y en memoria durante la orquestación; en Cosmos se persiste SHA-256 y el lookup `activate:<digest>`.

Al completar la contraseña se activan coordinadamente usuario y cliente.

### Correo existente pero todavía no activado

Se reutilizan el mismo `userId` y `clienteId`. No se crean duplicados. El backend puede reparar lookups legacy y rota la activación antes de reenviar el email.

Los datos canónicos ya existentes de una identidad pendiente no se sobrescriben simplemente con lo escrito en un formulario público posterior.

### Correo perteneciente a una cuenta activa sin sesión

No se modifica el perfil ni se vincula silenciosamente una incidencia a una cuenta activa sólo porque alguien conozca su email.

El backend no crea el ticket y envía un aviso seguro para iniciar sesión. La respuesta HTTP anónima sigue siendo neutra para impedir enumeración de usuarios.

### Cuenta desactivada o identidad inconsistente

No se realizan mutaciones desde el intake público y la respuesta exterior no revela el estado interno de la cuenta.

## Ticket

El ticket público reutiliza el builder canónico de las incidencias privadas.

- `subject`: asunto normalizado.
- `description`: cuerpo normalizado.
- `status`: `pending`.
- `priority`: `medium`.
- `category`: `general`.
- `source` canónico persistido: `public_home`.
- `channel`: `web`.
- `requesterSnapshot`: generado desde identidad canónica del servidor.
- `userId` / `clienteId`: asignados y verificados exclusivamente por backend.
- técnico/asignación: política canónica del backend.
- adjuntos en el intake inicial: ninguno.

La `Idempotency-Key` en claro no se persiste; el ticket conserva únicamente hashes necesarios para replay/consistencia.

## Respuesta pública

Para peticiones anónimas, la respuesta de éxito es deliberadamente indistinguible entre cuenta nueva, pendiente, activa, desactivada o determinados estados de consistencia. Ejemplo:

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

Por tanto, el frontend no debe afirmar que se creó una incidencia cuando recibe esta forma neutra; muestra simplemente que la solicitud fue recibida y que debe revisarse el correo.

En una sesión autenticada el backend puede devolver el identificador real del ticket y `activationRequired: false`, permitiendo indicar que la incidencia ya está disponible en el panel.

Nunca se devuelven tokens, hashes, información interna de Cosmos, datos de otras cuentas ni detalles que permitan enumerar usuarios.

## Seguridad obligatoria

- Rate limit específico por IP y por email, además del limiter global de API.
- Límites de longitud y normalización server-side.
- Validación de email/teléfono/dirección además de la validación del navegador.
- Teléfono normalizado y validado de nuevo en backend según el alcance geográfico activo.
- Honeypot y controles anti-spam/abuso.
- No confiar en `source`, `channel` ni ningún identificador enviado por el cliente para autorización.
- Nunca sobrescribir una cuenta activa desde una petición pública no autenticada.
- Token de activación aleatorio, de un solo uso, con expiración y SHA-256 en base de datos.
- Redacción de tokens y PII sensible en logs/respuestas.
- Idempotencia ante reintentos razonables.
- `Idempotency-Key` permitida explícitamente por la política CORS del backend.

## Consistencia

Usuarios, clientes, lookups y tickets viven en contenedores/particiones diferentes, por lo que el flujo es una **transacción lógica** con compensaciones y estados recuperables; no se simula una transacción Cosmos cross-container inexistente.

El correo de activación se envía después de persistir el estado necesario. Si falla ese correo en una creación `NEW/PENDING`, el orquestador elimina el ticket recién creado cuando puede hacerlo de forma segura y mantiene la identidad pendiente recuperable para un reintento posterior.
