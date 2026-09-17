# El contador de Home dice en qué estado está · 2026-09-17

## El defecto

El contador de Incidencias de Home se quedaba en una raya, sin valor y sin
recuperarse.

## Medido en el navegador, no deducido

Basta **un** fallo del dominio de incidencias. Reproducido sobre el build real:

```
1 · Home en frío, incidencias en error: valor «—», texto «No disponible»
2 · tras salir y volver con el backend sano: valor «—»
3 · segunda vuelta: valor «—»
   llamadas a la lista de incidencias en toda la sesión: 1
```

Dos causas, no una:

1. **La pregunta dejaba de hacerse.** Cuando un dominio no contesta,
   `fetchDashboard` compone el panel con los demás y lo marca `partial`
   (`home.api.js`), pero `commitCache` lo guardaba igual e `isCacheFresh` sólo
   miraba el TTL y la clave. Un panel al que le falta una cuenta se servía como
   **fresco** durante 60 s, así que volver a Home no volvía a preguntar.
2. **El estado no se distinguía.** `statCard` sólo conocía «hay número» y «no
   hay número»: cualquier ausencia pintaba `—` y «No disponible», que es el
   texto de un dato que legítimamente no existe. No había nada que pulsar.

El cero **no** era el problema: `value >= 0` ya lo admite y se pinta como `0`.

## La corrección, en sus dos autoridades

- `home.api.js` · `isCacheFresh` devuelve `false` cuando el panel guardado es
  `partial`. El dato anterior se conserva y se sigue hidratando la vista con
  él; lo que cambia es que la siguiente entrada vuelve a preguntar **una** vez,
  igual que cualquier montaje. No hay sondeo ni reintento infinito: medido, una
  vez completo el dato deja de preguntarse.
- `home.template.viewmodel.js` cruza los avisos del panel con cada cuenta —en
  un solo sitio— y publica `counts.failed` por dominio. Los avisos con sufijo
  (`facturas_stats`) cuentan para su dominio.
- `home.template.stats.js` declara cuatro estados en `data-home-stat-state`:
  `value` (el cero incluido), `updating` (conserva el número y señala el
  refresco), `error` (el dominio no contestó) y `unavailable` (no existe).
- `home.template.js` saca el aviso de recuperación —el mismo `errorBanner` con
  su «Reintentar», que el controlador ya trata como refresco— también cuando
  falla **una** cuenta, no sólo el panel entero.

El significado del contador no cambia: sigue siendo el total que el backend
declara para el ámbito del usuario. No se ha tocado ningún filtro de permisos
ni se ha sustituido una cuenta parcial por un total global.

## El contrato

`tools/home-counter-states-contract.mjs`, en `test:browser:ui`. Comprueba los
estados **por su marca**, no por su texto:

1. Con incidencias: `value` y el número del mundo sintético.
2. Sin ninguna incidencia: `value` y **`0`**, no una raya.
3. Dominio caído: `error`, «No se pudo cargar» y un control de reintento.
4. «Reintentar» recupera sin salir de Home y vuelve a preguntar de verdad.
5. Salir y volver también recupera; y con el dato completo **deja** de
   preguntar (se cuentan las llamadas: no hay sondeo).
6. Carga lenta y cambio de ruta durante la carga: se resuelve, sin raya
   congelada y con un solo documento.

## Negativas verificadas, una por causa

| Mutación | Lo que dice el contrato |
| --- | --- |
| Retirar la guarda de panel parcial en `isCacheFresh` | «Al volver a Home la tarjeta sigue en “error”» |
| Retirar la distinción de estados en `statCard` | «Con el dominio caído la tarjeta declara “unavailable”» |

Son independientes: sin la primera el dato no vuelve; sin la segunda el fallo
no se distingue de una ausencia legítima.

## Lo que hizo falta en el arnés

`/api/users/stats` caía en la regla de «usuario por identificador» y contestaba
404, así que la tarjeta de Usuarios aparecía como un fallo que no existe. El
endpoint sí existe en el backend (`router/users/index.js:576`). Ahora el mundo
sintético lo contesta, igual que `/api/clientes/stats`, con un total real.

## Límites

- La caché sigue siendo por identidad y ámbito: no se ha tocado su clave.
- No se ha añadido ningún reintento automático ni temporizador.
