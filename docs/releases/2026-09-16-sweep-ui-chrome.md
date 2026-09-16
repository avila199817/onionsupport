# Barrido · superficie exportada de `src/ui/chrome` y `src/ui/toast` · 2026-09-16

## Problema

Cerrado el barrido de las vistas privadas, quedaban dos módulos de `src/ui` fuera de la cota: `chrome` (14 exportaciones, 10 sin consumidor fuera de su módulo) y `toast` (19 exportaciones, 1 sin consumidor). Ninguna función muerta: aquí todo son exportaciones de más.

## Por qué el chrome de la aplicación no se toca a la ligera

`src/ui/chrome` es la barra y la navegación privadas, y se carga **por importación dinámica**: `src/features/private-runtime-ui/index.js` hace `import("../../ui/chrome/index.js")` y se queda con

```js
AppChromeUI = chromeModule?.AppChromeUI || chromeModule?.default || null;
```

Es decir, el consumidor real entra por el **objeto congelado** `AppChromeUI` (o por el `export default`, que es el mismo objeto), no por los nombres sueltos. Los dos se conservan, así que el arranque privado ve exactamente lo mismo que antes. Lo que desaparecen son las once exportaciones por nombre que nadie importaba.

Además `.github/scripts/app_entrypoint_integrity.py` lee `src/ui/chrome/index.js` **como texto** y exige que contenga `scheduleSync` y que **no** contenga `mobileShell` ni `mobileNavigation`, y comprueba que `private-runtime-ui` haga exactamente una importación dinámica del chrome. Ninguna de esas condiciones depende de los nombres retirados, y las tres siguen cumpliéndose.

## Cambio

**Clase A** (sobra el `export`, el símbolo sigue vivo) — 11 nombres:

- `chrome/index.js` (8): `APP_CHROME_VERSION`, `syncAppChrome`, `openAppChromeNavigation`, `closeAppChromeNavigation`, `toggleAppChromeNavigation`, `initAppChrome`, `destroyAppChrome`, `getAppChromeSnapshot`. Todos siguen siendo propiedades de `AppChromeUI`.
- `chrome/template.js` (2): `APP_CHROME_TEMPLATE_VERSION`, `AppChromeTemplate`.
- `toast/index.js` (1): `TOAST_VERSION`.

**Clase B**: ninguna. No se borra ninguna función.

**Contrato**: `src/ui/chrome` entra en el `BASELINE` con 4 y `src/ui/toast` con 18. El contrato vigila ahora 956 exportaciones en 14 directorios.

El chrome queda con **cuatro** exportaciones públicas: el objeto, su `default` y lo que el resto del código importa de verdad. Es la reducción proporcionalmente mayor del barrido (14 → 4).

## Métricas de la unidad

| Métrica | Antes | Después |
| --- | --- | --- |
| Exportaciones en `src/ui/chrome` | 14 | 4 |
| Exportaciones en `src/ui/toast` | 19 | 18 |
| Exportaciones privatizadas (A) | | 11 |
| Funciones muertas eliminadas (B) | | 0 |
| Ficheros borrados | | 0 |
| Comportamiento modificado | | no |
| `dist` y cierres | | en la PR |

## Riesgo

Bajo. El consumidor del chrome entra por el objeto congelado y por el `export default`, y los dos quedan intactos; el contrato de integridad del punto de entrada sigue verde. No se borra código.
