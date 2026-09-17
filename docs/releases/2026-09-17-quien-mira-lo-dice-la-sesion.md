# Agenda · quién mira lo dice la sesión, no quien monta la vista · 2026-09-17

## Qué se veía

Con una sesión de administrador real en `https://onionsupport.com`, abrir una cita **Programada** pintaba el detalle correcto —Cita, fecha, asunto, día, hora, lugar, nota, estado Programada— y **ninguna acción**. Ni «Editar», ni «Eliminar cita», ni pie. El modal terminaba justo después de `ESTADO → Programada`.

El «+» de crear citas, en cambio, seguía apareciendo.

## Dónde se perdía

No se perdía en el build, ni en la plantilla, ni en el CSS. **Nunca se emitía.**

El pie del detalle se compone así (`src/views/agenda/agenda.template.detail.js`):

```js
const activa = Boolean(cita && cita.estado !== "cancelada");
const puedeGestionar = vm.admin && activa;
…
: puedeGestionar ? `…Eliminar cita / Editar…` : "";
```

Con `vm.admin === false` el pie entero es la cadena vacía. Y `vm.admin` venía de `state.admin`, que la Agenda derivaba —en su único punto— del objeto que le pasa quien la monta:

```js
admin: context?.isAdmin === true || context?.role === "admin",
```

El Router monta **todas** las vistas por un solo camino (`src/router/index.js`, `await route.render(nextHost, { … })`) y el contexto que entrega es siempre el mismo: `AppCore`, `Auth`, `Router`, `route`, `canonicalPath`, `publicPath`, `routeParams`, `source`, `signal` e `isCurrentRender`. `routes.js` le añade `viewKey` y `routeViewKey`. **Ahí no viaja `role`, ni `isAdmin`, ni `userId`, y no ha viajado nunca.**

Por tanto `state.admin` era `false` para todo el mundo, siempre, en producción.

Eso explica la captura entera, no sólo el pie: las filas «Usuario» y «Comunicación» del detalle están tras la misma puerta (`vm.admin`) y también faltaban. Y explica por qué el «+» sí funcionaba: su permiso no sale de ahí, sale del backend, en la propia respuesta del listado (`meta.puedeCrear`, `src/views/agenda/index.js`). Dos autoridades para «quién puede gestionar citas», y la de la vista fija en falso.

## Por qué CI no lo vio

El recorrido en navegador de la Agenda montaba la vista llamando a

```js
AgendaView(document.getElementById("view"), { role: "admin" })
```

Esa llamada no existe en la aplicación. El recorrido demostraba «dado un contexto que dice `role: admin`, las acciones aparecen», que es cierto y no es la pregunta. Nunca comprobó que producción entregue semejante contexto. Verde perfecto sobre un camino que el producto no recorre.

## La corrección

La Agenda pregunta a la **misma autoridad de sesión** que el resto de las vistas privadas —la que ya usan Facturas, Clientes, Usuarios y Empleados—, y la pregunta **en cada pintado**, porque la sesión puede terminar de hidratarse después de que el Router haya montado la vista:

```js
function sessionRole() {
  try { return cleanText(AppCore.getCurrentRole?.(), ""); } catch { return ""; }
}
…
get admin() { return sessionRole() === "admin"; },
```

No se ha añadido una segunda interpretación local del rol: `AppCore.getCurrentRole()` devuelve el rol ya normalizado por el kernel (`src/core/index.js`), que es de donde lo toman las demás vistas. El contexto de montaje deja de consultarse para esto.

La misma corrección alcanza a la identidad. `setAgendaIdentity(context?.userId || context?.user?.userId)` recibía siempre `""`, así que la clave que separa las cachés de intervalos por persona era inerte. Ahora sale de `AppCore.getCurrentUser()`. No tenía consecuencia observable —`destroy()` limpia la caché al desmontar la vista, y cambiar de ruta la desmonta—, pero una guarda que nunca distingue nada no es una guarda.

**No se ha tocado el backend**: el backend ya decidía bien, y sigue decidiendo él. Ocultar o mostrar un botón no autoriza nada. **No se ha tocado el CSS**, y no hay ningún `!important` nuevo: el pie no estaba oculto, no estaba.

## Lo que ahora impide que vuelva

**`tools/agenda-detalle-acciones-contract.mjs`** (nuevo, en `test:browser:ui`). No fabrica ningún contexto: arranca la aplicación **construida**, entra por su ruta real, deja que el front resuelva la sesión con `/api/auth/me` y que el Router monte la Agenda como la monta en producción. Ocho comprobaciones:

| | |
|---|---|
| A | un administrador ve EDITAR y ELIMINAR CITA en una cita programada |
| B | el mismo permiso trae la fila del usuario destinatario |
| C | el estado de la cita abierta es el contractual `programada` |
| D | pulsar EDITAR abre el modo edición con «Guardar cambios» |
| E | pulsar ELIMINAR CITA abre la confirmación compartida |
| F | el recorrido no ha escrito ni una sola cita |
| G | un usuario no administrador abre su cita y no ve ninguna de las dos acciones |
| H | una cita cancelada no ofrece acciones, pero sigue siendo la vista del administrador |

«Está en el DOM» no basta: A y G miden `display`, `visibility`, `opacity`, la caja real y **qué recibiría el clic** en el centro del botón. Un botón tapado no cuenta como visible.

**`tools/agenda-citas-contract.mjs`, bloque 14** (estático, en `validate:source`, es decir en la puerta de la PR). Comprueba que el contexto que el Router entrega sigue sin declarar `role`, `isAdmin` ni `userId`; que la Agenda no vuelve a leerlos de ahí; que pregunta a `AppCore.getCurrentRole()` / `AppCore.getCurrentUser()` con `admin` resuelto en cada lectura; que Facturas y Clientes comparten esa autoridad; y que el recorrido en navegador **no puede** volver a montar con un rol inventado.

**`tools/agenda-citas-browser-contract.mjs`**: sus 23 escenarios establecen ahora una sesión real (`AppCore.applySession`) y montan con el contexto **vacío** del Router. Pasan los 23.

## Comprobación por mutación

Devolviendo `admin: context?.isAdmin === true || context?.role === "admin"`:

- el bloque 14 cae con «la Agenda vuelve a derivar quién mira del contexto de montaje»;
- el recorrido nuevo cae con «Editar: no está en el DOM».

Antes de corregir nada, el recorrido nuevo se ejecutó contra el build de `main` (`1c837ef0`) y falló exactamente así: el defecto de producción, reproducido.
