# `/agenda` deja de resolverse implícitamente · 2026-09-16

## Problema

`/agenda` era la única ruta del registro que no declaraba por qué nombre se resuelve su vista. `pickView(module, names)` recorre los nombres declarados y, al no encontrar ninguno, cae a `module?.default || module`. Con 12 rutas declarando `names` y una sin declararlos, el mecanismo era el mismo pero el contrato no.

Al mirarlo de cerca no era una asimetría, eran **tres sobre la misma ruta**, y ninguna intencionada:

| Eje | Las otras 16 rutas | `/agenda` |
| --- | --- | --- |
| `name` | declarado (`ROUTE_NAMES.X`) | ausente → derivado de la ruta |
| `viewKey` | declarado | ausente → derivado del `name` |
| `names` (resolución de vista) | declarado | **ausente → `module.default`** |

Y `ROUTE_NAMES`, la autoridad de nombres de ruta, listaba las 16 menos agenda.

Que funcione no lo hace correcto: nada decía cuál es el punto de entrada de la vista, nada podía comprobar que ese export siguiera existiendo, y renombrar `AgendaView` habría roto la ruta sin que fallara ninguna prueba.

## Equivalencia, antes de tocar nada

`createRoute` deriva `finalName = cleanName(name || viewKey || finalPath)` y `finalViewKey = cleanName(viewKey || finalName)`. Ejecutando las funciones reales del router, no leyéndolas:

```
cleanName("/agenda") = "agenda"          → finalName  hoy
cleanName("agenda")  = "agenda"          → finalViewKey hoy
```

Declarar `name: ROUTE_NAMES.AGENDA` (`"agenda"`) y `viewKey: "agenda"` produce exactamente los mismos dos valores. La comparación se hizo evaluando ambas ramas y comparándolas: **equivalente**.

También se comprobó antes de declarar `names`:

- `src/router/routes.js:774` es el **único** importador de `views/agenda/index.js`, y es una importación dinámica.
- `AgendaView` aparecía tres veces en todo el repositorio, las tres dentro de su propio módulo: la constante muerta, la declaración y el `export default`.
- **Ningún consumidor depende deliberadamente del `default`**: se llegaba a él sólo por el fallback, precisamente porque no había `names`.
- Roles y navegación no salen de la resolución: `/agenda` no declara `adminOnly`, así que sigue visible para `admin` y `user` como está documentado en `PROJECT_CONTEXT.md`. El `loadModule` no se toca, así que la carga diferida es la misma.

## Cambio

- `ROUTE_NAMES` gana `AGENDA: "agenda"`, que era la única ruta ausente de esa autoridad. **No se crea ninguna registry nueva**: se usa la que ya existe.
- La entrada `agenda` del registro declara `names: ["AgendaView"]`, y su `createRoute` declara `name` y `viewKey`.
- `tools/route-view-resolution-contract.mjs`, en `check:dist`: toda ruta registrada declara los nombres por los que resuelve, y **cada nombre declarado lo exporta de verdad el módulo al que apunta**. El fallback de `pickView` sigue existiendo como red de seguridad en ejecución; deja de ser la forma de dar de alta una ruta.

## Doble autoridad `*_VIEW_NAME`

Inventario completo de las constantes equivalentes que quedaban:

| Constante | Clase | Decisión |
| --- | --- | --- |
| `AGENDA_VIEW_NAME = "AgendaView"` | B + C: cero consumidores en todo el repo, y `routes.js` pasa a declarar el mismo literal | **retirada** |
| `EMPLEADOS_VIEW_NAME = "EmpleadosView"` | B + C: cero consumidores, `routes.js` ya declaraba el literal | **retirada** |
| `USUARIOS_VIEW_NAME`, `USUARIOS_MODULE_NAME` | A: ya son privadas y **sí** tienen consumidor interno (arman `controller.name` y el descriptor `UsuariosModule`) | se conservan |
| `AGENDA_CANONICAL_PATH = "/agenda"` | B + C: cero consumidores, duplicaba `ROUTES.agenda` | **retirada** |
| `EMPLEADOS_CANONICAL_PATH` | A: un uso interno real (`route:` del descriptor) | privatizada, no borrada |

Las de Servidor (×4) y WhatsApp (×1) ya las había retirado el barrido en #663 y #664.

`routes.js` queda como la autoridad real y única de los nombres de vista. El criterio aplicado es el del propietario, literal: se elimina lo **duplicado y sin consumidor**; lo que tiene consumidor se queda, aunque se le parezca.

## Métricas

| Métrica | Antes | Después |
| --- | --- | --- |
| Rutas registradas con resolución implícita | 1 de 13 | **0 de 13** |
| Rutas ausentes de `ROUTE_NAMES` | 1 | **0** |
| Exports de `src/views/agenda` | 4 | **1** |
| Exports de `src/views/empleados` | 5 | **2** |
| Constantes muertas retiradas | — | 3 |
| Exports privatizados (clase A) | — | 3 |
| Cota vigilada | 956 en 14 directorios | **959 en 16** |
| Comportamiento modificado | — | **no** |

## Riesgo

Bajo y probado por equivalencia: los dos valores que antes se derivaban se declaran ahora con el mismo resultado exacto, y la vista se resuelve por el mismo `pickView` que sus hermanas, sólo que por la rama declarada en lugar de por el fallback. Pruebas negativas verificadas: quitarle `names` a agenda dispara *«a registered route resolves its view implicitly through module.default»*; declarar un nombre que el módulo no exporta dispara *«a route declares a view name its module does not export»*.
