# Onion Support — UI System V14 Audit

## Cuenta: política multimedia canónica

Cuenta deja de mantener una segunda política de URLs de avatar y consume `sanitizeRuntimeImageUrl()` desde `src/core/media.js`.

- Helpers locales retirados: **4** (`isAzureBlobHost`, `isSensitiveQueryParam`, `isAzureSasParam`, `safeAvatarUrl`)
- `cuenta.api.js`: **38,668 → 37,153 bytes**
- Código retirado: **1,515 bytes**
- Autoridad runtime de imágenes: **1** (`core/media.js`)
- Se preservan URLs relativas, object URLs `blob:`, Onion API y Azure Blob; SAS sólo se acepta conforme a la política Core.

## Invariante

Repository Integrity bloquea reintroducir los cuatro helpers locales y exige el consumo de `core/media.js`.
