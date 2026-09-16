# Barrido · superficie exportada de la vista de Cuenta · 2026-09-16

## Problema

`src/views/cuenta` exportaba 85 nombres; 32 no tenían consumidor fuera de su módulo: 29 se usaban sólo dentro (endpoints y tiempos de espera de la API, el objeto `CuentaApi` que el módulo ya expone como `export default`, los renderizadores de tarjeta de la plantilla, las constantes de versión y origen, y las acciones de la vista con sus alias, todas alcanzables por el objeto público `CuentaView`) y 3 no se usaban en ningún sitio (`CuentaIndex`, `refreshCuenta`, `clearCuentaViewCache`).

## Causa raíz

La misma que en Servidor: exportar por costumbre y conservar alias cuando su consumidor desapareció.

## Cambio

- Clase A (el `export` sobra, el símbolo sigue): `CUENTA_RESOURCE`, `CUENTA_ENDPOINTS`, `CUENTA_ENDPOINT`, `CUENTA_TIMEOUT`, `CUENTA_UPLOAD_TIMEOUT`, `CuentaApi` (API); `CUENTA_TEMPLATE_CAPABILITIES`, `renderAvatarCard`, `renderSecurityCard`, `renderPaymentCard`, `renderDeactivateCard`, `renderPanel`, `getCuentaTemplateSnapshot` (plantilla); `CUENTA_INDEX_VERSION`, `CUENTA_VIEW_VERSION`, `CUENTA_INDEX_SOURCE`, `updateTheme`, `updateCuentaTheme`, `setCuentaTheme`, `updateLanguage`, `updateCuentaLanguage`, `setLanguage`, `setCuentaLanguage`, `updatePassword`, `savePassword`, `uploadAvatar`, `deleteAvatar`, `deactivateAccount`, `getCuenta` (vista). El `export default` de cada módulo no cambia.
- Clase B (muerta): `CuentaIndex` (alias de `CuentaView`), `refreshCuenta` (alias de `refresh`) y `clearCuentaViewCache`.
- Verificación por nombre antes de tocar: ninguna referencia estática ni por cadena en `src`, `tools`, `.github`, `docs`, los HTML, `vite.config.js` ni `package.json`. El guard `cuenta_integrity.py` (que fija el contrato visible de la cuenta y la ruta `CuentaView`) sigue verde.
- `export-surface-contract`: `SWEPT_DIRECTORIES` pasa a `["src/views/cuenta", "src/views/server"]`.

## Métricas

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/views/cuenta` | 85 | 53 |
| Funciones en `src/views/cuenta` | 118 | 117 (`clearCuentaViewCache` fuera) |
| Alias sin consumidor retirados | | 2 (`CuentaIndex`, `refreshCuenta`) |
| Líneas de `src` | | +30 / −42 |
| Ficheros borrados | | 0 |
| Chunk `cuenta` | 49849 B | 49224 B (−625 B) |
| Cierres `app` / `auth` / `bootstrapPublicHome` | 156124 / 62996 / 216281 | sin cambio |
| Comportamiento | | sin cambio (ningún consumidor existía) |
| Contratos añadidos | | 0 (crece la cota de `export-surface-contract`) |

## Riesgo

Bajo: sólo desaparecen nombres sin referencias. `CuentaView`, `CuentaApi` como `export default` y el contrato de integridad de la cuenta quedan intactos.
