# Un total desconocido no es un dato completo

## El camino

El listado de incidencias hace **dos** lecturas —las filas y el recuento— y
pueden fallar por separado:

```
fetchCountSafe falla → totalKnown false → la lista llega bien, con total nulo
  → Home lo trataba como panel completo → el contador se quedaba sin recuperación
```

Ese caso **no genera aviso de dominio**, así que el panel no era `partial`, la
guarda de caché añadida en la entrega anterior no saltaba, y la tarjeta se
quedaba en «No disponible» —indistinguible de un ámbito que no aplica a la
sesión— sin nada que pulsar.

## Qué cambia aquí (frontend)

El backend ya declara el estado (`oniontech`, PR aparte). Esta mitad lo
**interpreta**:

| | |
| --- | --- |
| `collectionFromResponse` / `loadAdminCount` | publican `totalKnown` junto al total |
| `loadDomain` | deja de descartarlo al recomponer el resultado |
| el panel | declara `unknownCounts` por dominio: contestó, pero sin recuento |
| `isCacheFresh` | un panel con cuentas sin confirmar **no** es fresco |
| `fetchDashboard` | si el panel anterior tenía cuentas sin confirmar, la siguiente lectura va **forzada** |
| la tarjeta | estado `unknown` con «Sin confirmar», ni cero ni página |
| el aviso de Home | su «Reintentar» de siempre también repara este caso |

### Por qué hacía falta forzar

Que la caché de Home deje de dar el panel por fresco no basta: **cada dominio
tiene además su propia caché por tiempo**, así que volver a Home se servía de
ella y no llegaba a la red —medido: una sola llamada a la lista en toda la
sesión—. Con una cuenta sin confirmar, la siguiente entrada pide forzado.

Es **una** relectura por montaje, la misma que hace cualquier entrada. Medido:
quieta en Home 2,5 s, las llamadas no se mueven. Ni sondeo, ni reintento
automático, ni tormenta.

## Sobre conservar un valor anterior

**No se conserva.** Cuando hay un dato previo y se está refrescando, ese caso ya
tiene su estado (`updating`, con el número anterior visible). Cuando no lo hay,
inventar uno exigiría casar identidad y ámbito para no enseñar el recuento de
otra sesión, y un número sin confirmar presentado como dato es justo lo que se
está corrigiendo. Se muestra «—» y «Sin confirmar», que es recuperable.

## Pruebas

`tools/home-counter-states-contract.mjs` — 11 escenarios sobre el build real:

| | |
| --- | --- |
| 1 | COUNT correcto con total positivo |
| 2 | COUNT correcto con total 0 (cero **confirmado**) |
| 3-4 | dominio caído, y reintento que recupera sin salir de Home |
| 5 | salir y volver: ya completo, deja de preguntar |
| 6 | carga lenta y cambio de ruta: la respuesta tardía no pisa el ámbito |
| **7** | total sin confirmar: `unknown`, «Sin confirmar», 1 reintento |
| **8** | salir y volver **vuelve a preguntar** (1 → 2): no se guardó como completo |
| **9** | «Reintentar» recupera el total sin recargar |
| **10** | sin sondeo: 3 llamadas antes y después de 2,5 s quieta |
| **11** | aislamiento: 4 para una identidad y 2 para otra, sin herencia |

`tools/home-domain-counts-contract.mjs` pasa a exigir `unknown` + «Sin
confirmar» donde antes fijaba «No disponible»: el contrato distingue ahora más,
no menos.

## Límite

`No disponible` se conserva **sólo** para un ámbito que no aplica a la sesión
(por ejemplo, las tarjetas de administración para quien no lo es). Ese caso no
es recuperable y no ofrece reintento, que es lo correcto.
