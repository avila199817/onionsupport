# Barrido · superficie exportada de Correo, WhatsApp, sidebar y topbar · 2026-09-16

## Problema

Cuatro directorios más con exportaciones sin consumidor fuera de su módulo: Correo 17, WhatsApp 6 + 1 muerta, sidebar 13, topbar 8.

## Causa raíz

La misma que en las unidades anteriores: `export` por costumbre y un alias de nombre que sobrevivió a su consumidor.

## Cambio

- **Correo** (A ×17): `CORREO_API_VERSION`, `MICROSOFT_ENDPOINT` y las trece operaciones de la API (`getMicrosoftStatus`, `beginMicrosoftConnect`, `disconnectMicrosoft`, `getMicrosoftProfile`, `listMailFolders`, `listMessages`, `getMessage`, `sendMessage`, `replyMessage`, `replyAllMessage`, `forwardMessage`, `listAttachments`), que la vista consume por el objeto de la API; `formatMessageTime` y `formatLongDate` de la plantilla; `CORREO_VIEW_VERSION`.
- **WhatsApp** (A ×6, B ×1): `WHATSAPP_VIEW_VERSION`, `WHATSAPP_CANONICAL_PATH`, `WHATSAPP_ENDPOINTS`, `WHATSAPP_REQUEST_TIMEOUT_MS`, `WHATSAPP_CONVERSATION_LIMIT`, `WHATSAPP_MESSAGE_LIMIT`; fuera `WHATSAPP_VIEW_NAME`. `WhatsAppView` (la ruta) intacta.
- **sidebar** (A ×12) y **topbar** (A ×8): las versiones y los constructores de fragmento (`createSidebarIcon`, `createSidebarNav`, `createTopbarTitle`, `createTopbarSearch`…), que ya se consumen por `SidebarTemplate` / `TopbarTemplate` y por el objeto público de cada módulo.
- `export-surface-contract`: `SWEPT_DIRECTORIES` pasa a seis directorios (`src/ui/sidebar`, `src/ui/topbar`, `src/views/correo`, `src/views/cuenta`, `src/views/server`, `src/views/whatsapp`), 230 exportaciones vigiladas.

## Lección: el acceso dinámico cuenta como consumidor

`createSidebarFooter` parecía de clase A, pero `.github/scripts/avatar_runtime_dom_contract.mjs` importa el módulo dentro de una página real (`await import("/src/ui/sidebar/template.js")`) y llama al nombre como propiedad del espacio de nombres. La primera pasada del verificador no lo vio por un fallo propio (excluía por ruta todo el árbol de trabajo al estar bajo el directorio de trabajo temporal), y la batería lo detectó antes de fusionar. Se mantiene exportado, documentado como API pública deliberada del fixture (clase C), y el verificador ya recorre `tools`, `.github`, `docs` y los HTML de verdad.

## Corrección del contrato: comprobaciones parciales

El trabajo de comparación de la Home construye cada revisión en un directorio que sólo copia `src`, `tools` y la configuración de build. `export-surface-contract` recorría `.github` y `docs` sin comprobar que existieran y fallaba allí con `ENOENT`, rompiendo ese trabajo en cualquier PR desde que se añadió. Ahora, cuando falta alguna de esas raíces, el contrato dice que se salta (el corpus de referencia estaría incompleto y no podría demostrar que un nombre no se usa) y la comprobación completa sigue corriendo donde el repositorio está entero: `npm run validate`, el espejo con el tooling de `main` y la validación confiable de dist.

## Métricas

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones (4 directorios) | 95 | 52 |
| Nombres muertos retirados | | 1 (`WHATSAPP_VIEW_NAME`) |
| Líneas de `src` | | +45 / −46 |
| Chunks | `correo` 69384, `whatsapp` 31218, `sidebar` 33920, `topbar` 56635 | 69308 (−76), 31132 (−86), 33898 (−22), 56614 (−21) |
| Cierres `app` / `auth` / `bootstrapPublicHome` | 156124 / 62996 / 216281 | sin cambio |
| Comportamiento | | sin cambio (ningún consumidor existía) |

## Riesgo

Bajo: los objetos públicos (`CorreoView`, `WhatsAppView`, `SidebarTemplate`, `TopbarTemplate` y los `export default`) y las rutas no cambian.
