# Onion Support — UI System V9 Audit

## Correo: boundary API / browser UI

V9 corrige una mezcla de responsabilidades que seguía viva desde la activación por defecto de notificaciones. `correo.api.js` ya no lee ni escribe `localStorage` ni inspecciona APIs de notificación del navegador. La preferencia booleana permanece exactamente igual, pero su lifecycle vive en el controlador de vista que ya era quien la leía, modificaba y aplicaba.

- `correo.api.js`: **14,882 → 14,061 bytes**
- `correo/index.js`: **47,361 → 47,732 bytes**
- Keys de preferencia persistente: **1** (`onion.correo.notifications.v1`)
- Cliente HTTP de Correo: **1** (`core/http.js`)
- Tokens Microsoft persistidos en browser: **0** por contrato

## Autoridades

- `correo.api.js`: endpoints, DTOs, FormData y descarga a través de `core/http.js`.
- `correo/index.js`: Notification API, permiso del navegador, polling y preferencia booleana local.
- Repository Integrity bloquea volver a introducir `localStorage`/Notification en la capa API.
