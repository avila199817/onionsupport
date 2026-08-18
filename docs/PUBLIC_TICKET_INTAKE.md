# Public ticket intake — contrato frontend/backend

## Objetivo

La home pública envía una única solicitud. El navegador **no** crea por separado un usuario y después un ticket.

Endpoint propuesto:

`POST /api/tickets/public`

El backend orquesta:

1. Validación y normalización de identidad/contacto.
2. Creación o reutilización segura de la cuenta.
3. Creación de la incidencia vinculada a la identidad correcta.
4. Emisión del email de activación cuando corresponda.

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

### Alcance geográfico inicial

La primera versión del alta pública acepta únicamente teléfonos de España.

- El formulario parte de `+34` por defecto.
- El frontend normaliza el teléfono a `+34 XXX XXX XXX`.
- Deben existir exactamente 9 dígitos nacionales después del prefijo de España.
- El backend debe volver a validar y normalizar el teléfono; nunca debe confiar sólo en la validación del navegador.
- Si en el futuro se habilitan otros países, esta restricción debe convertirse en una política explícita compartida entre frontend y backend.

## Reglas de identidad

### Sesión autenticada

Si existe una sesión válida, la identidad de seguridad sale de la sesión. El backend no debe permitir que un correo escrito en el formulario cambie el propietario del ticket.

Los datos de contacto pueden usarse como información del caso, pero cualquier actualización de perfil debe seguir las reglas normales de cuenta.

La home pública no precarga automáticamente el nombre completo del usuario autenticado en el formulario; el cliente lo introduce explícitamente. El acceso al panel sí puede mostrar la identidad de la sesión según el comportamiento normal de la cabecera.

### Correo nuevo

Crear una cuenta pendiente/inactiva con rol `user`, crear la incidencia y generar un token de activación de un solo uso.

El enlace del email debe apuntar al flujo ya existente:

`https://www.onionsupport.com/activate-account?token=<token>`

El token en claro sólo viaja en el email. En persistencia se guarda únicamente su hash, junto con caducidad, propósito y estado de uso.

### Correo existente pero todavía no activado

Reutilizar la misma cuenta. No crear duplicados. Puede rotarse/reemitirse un token de activación según la política del backend.

### Correo perteneciente a una cuenta activa sin sesión

No modificar el perfil ni vincular silenciosamente una incidencia a una cuenta activa sólo porque alguien conozca su email.

La respuesta pública no debe revelar si esa cuenta existe. El backend debe exigir verificación de propiedad del correo antes de asociar definitivamente el caso, o aplicar un flujo equivalente de confirmación.

## Ticket

Contrato recomendado:

- `subject`: asunto normalizado.
- `description`: cuerpo normalizado.
- `status`: `open`.
- `priority`: `medium` salvo regla del backend.
- `category`: `general` salvo clasificación posterior.
- `source`: `public-home`.
- `channel`: `web`.
- `requesterSnapshot`: snapshot seguro del solicitante.
- `userId` / `clienteId`: sólo asignados por el servidor después de resolver la identidad.

## Respuesta pública

Ejemplo:

```json
{
  "ok": true,
  "ticketId": "TCK-...",
  "activationRequired": true
}
```

No devolver tokens, hashes, información interna de Cosmos, datos de otras cuentas ni detalles que permitan enumerar usuarios.

## Seguridad obligatoria

- Rate limit por IP y por email.
- Límites de longitud y normalización server-side.
- Validación de email/teléfono/dirección además de la validación del navegador.
- Teléfono normalizado y validado de nuevo en backend según el alcance geográfico activo.
- Anti-spam/abuso en el endpoint y en el envío de correo.
- No confiar en `source`, `channel` ni ningún identificador enviado por el cliente para autorización.
- Nunca sobrescribir una cuenta activa desde una petición pública no autenticada.
- Token de activación aleatorio, de un solo uso, con expiración y hash en base de datos.
- Redacción de tokens y PII sensible en logs.
- La creación del ticket y el estado de activación deben ser idempotentes ante reintentos razonables.

## Consistencia

Como usuarios y tickets viven en contenedores/particiones diferentes, tratar el flujo como una **transacción lógica**: persistir estados recuperables y permitir reintento de email sin duplicar usuario ni incidencia. El correo debe enviarse después de que el estado necesario para activar la cuenta esté persistido.
