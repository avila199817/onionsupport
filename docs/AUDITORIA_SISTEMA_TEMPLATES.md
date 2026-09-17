# Sistema de templates — arquitectura final

Última revisión: 2026-09-17

Este documento describe el estado **final** del sistema, no el camino. Su
propósito es que nadie vuelva a montar en una vista algo que ya tiene
autoridad. Lo que se midió y se resolvió está en los mensajes de commit; aquí
está lo que hay que saber para trabajar sin volver a divergir.

---

## 1 · Autoridades

Una por concepto. Si estás a punto de escribir una de estas cosas dentro de una
vista, **no lo hagas**: pídesela a su autoridad.

| concepto | autoridad | qué resuelve |
|---|---|---|
| tono de un estado | `src/core/status-tone.js` | de un valor de dominio al tono con el que se pinta |
| pintura del estado | `src/css/components/status-system.css` | del tono a los colores, en los dos temas |
| indicador de foco | `src/css/components/focus-system.css` | el anillo de teclado, en la última capa |
| clave de dominio | `src/core/slug-key.js` | normaliza un valor («Cancelada» → `cancelada`) |
| etiquetas de estado | el fichero de opciones de cada dominio | el texto que lee el cliente |

### Cómo se reparten las tres preguntas de un estado

Un estado se responde por tres sitios distintos, y confundirlos fue el origen
de seis divergencias:

```
A · estado semántico   el valor del backend, tal cual («cancelada»)
B · tono de pintura    src/core/status-tone.js  ->  open|pending|success|danger|neutral
C · clave de filtrado  el statusKey() de cada vista  ->  ciclo de vida
```

`statusKey()` de Incidencias pliega `cancelled|archived` sobre `closed` **a
propósito**: `isClosed()` filtra con él. Por eso el tono NO puede salir de ahí:
con el pliegue hecho, «resuelta» y «cancelada» ya son el mismo valor.

---

## 2 · Cómo se añade un estado nuevo

1. Añade el valor a `TONE_BY_STATE` en `src/core/status-tone.js`, dentro de la
   familia que le corresponde. Es una lista por tono, no pares sueltos.
2. Nada más. La hoja ya sabe pintar los cinco tonos.

El chip lo emite la vista así:

```js
`<span class="mi-chip mi-chip--${clave}" data-status-tone="${statusTone(valorCrudo)}">`
```

**El valor que se le pasa tiene que seguir llevando el estado.** Si tu vista lo
normaliza con un mapa que pliega valores distintos sobre uno, pásale el crudo.

Lo que NO hay que hacer:

- no declares colores de estado en la hoja de tu vista: los pinta StatusSystem
  desde la última capa, y tu copia no se verá nunca
  (`tools/status-tone-contract.mjs` lo comprueba);
- no inventes un sexto tono: son exactamente las cinco familias de tokens que
  declara la hoja;
- no tomes prestado el nombre de otro dominio para heredar su color. El modal
  de Usuarios emitía `status-closed` para un usuario inactivo y salía VERDE.

---

## 3 · Cómo se implementa el foco

**No se implementa.** El anillo lo pone `focus-system.css` en `@layer
guardrails`, la última, sobre todo lo enfocable:

```css
outline: var(--focus-ring-width) solid var(--focus-ring-color);
outline-offset: 2px;
```

Es un `outline` y no una `box-shadow` por una razón concreta: dos `box-shadow`
sobre el mismo elemento no se suman, se sustituyen. Cuando el anillo era una
sombra, o lo borraba la sombra del componente o el anillo borraba la del
componente. Con un contorno conviven.

De ahí salen tres reglas:

- **no escribas `box-shadow: var(--focus-ring)`** en ninguna hoja. Se verían
  dos anillos, uno de sombra y otro de contorno
  (`tools/focus-ring-authority-contract.mjs` lo rechaza);
- **no escribas `outline: none`** en una regla de foco. Hoy no rompe nada
  porque las capas anteriores pierden contra `guardrails`, pero es la mitad de
  un modismo que ya no existe;
- si tu elemento **no** es enfocable por teclado --una sección con
  `tabindex="-1"`, un contenedor que pinta el anillo de lo que contiene-- la
  autoridad no lo alcanza: declara tú el `outline` con los mismos tokens.

Excepción declarada: `compositions/home-onboarding-pilot.css` usa
`--focus-ring-strong` para ILUMINAR la tarjeta que la guía señala. No es un
indicador de foco y por eso sigue siendo una sombra.

---

## 4 · Excepciones intencionadas

Nombradas para que nadie las «arregle»:

- **`facturas-detail-stat--accent`** es ÉNFASIS, no estado: lo lleva sólo la
  tarjeta del Total, para que la cifra principal destaque entre sus hermanas,
  que van sin tono. Un importe no tiene estado y ninguno de los cinco tonos
  significa «ésta es la cifra que se busca».
- **`views/public/home-critical.css` sin capa** es deliberado: su comentario
  explica que debe ganar a `@layer auth` de la vista.
- **`seo/public-service.css` sin capa**: sólo la sirve el sitio estático.
- **Los tokens `--ui-detail-modal-*` redefinidos por dominio** son contrato
  documentado (`docs/UI_MODAL_SYSTEM.md`).
- **Siete tokens que son hooks de tema** (`--border-subtle`,
  `--btn-primary-border-hover`, `--focus-ring-color`, `--shadow-color`,
  `--sidebar-danger`, `--solid-bg-hover`, `--text-default`) se consumen sin
  estar declarados, siempre con `var(--hook, var(--token-real))`. Es un punto
  de extensión, no un olvido.

---

## 5 · Presupuesto de arranque

`tools/invoice-api-split-dist-contract.mjs` mide el cierre estático de la Home
pública contra un techo de 218.750 bytes. Sobre el main de hoy el cierre son
**214.920 bytes: 3.830 de margen (1,75 %)**, por encima de la holgura del
1,20 % que declaró R03.

Si tu cambio lo roza, mídelo fichero a fichero antes de tocar el número. Subir
el techo es la última opción, no la primera; la nota R08 del contrato deja
escrito el método y los dos callejones sin salida que ya se recorrieron.

Y uno de ellos conviene saberlo antes de intentarlo: **`vite.config.js` es un
fichero de confianza** (`TRUSTED_FILES` en `tools/stage-trusted-build.mjs`). La
referencia con la que CI compara tu dist se construye con el `vite.config.js`
del base, no con el tuyo. Cambiarlo hace que los dos artefactos diverjan
enteros y la puerta trusted se pone en rojo. No lo toques para afinar bytes.

---

## 6 · Deuda verificada que queda

- **1.026 colores literales fuera de `tokens/`**, 318 valores únicos. El 37 %
  de las ocurrencias coincide EXACTO con un token existente, pero 219 de ellas
  son `#ffffff`, que responde a tres tokens distintos (`--white`,
  `--solid-text`, `--solid-icon`): una migración mecánica hex→token elegiría
  mal. Es trabajo semántico, hoja por hoja, no un barrido.
- **`facturas-detail-stat--neutral`** es alcanzable y la hoja no lo declara: la
  tarjeta de Pago de una factura cancelada sale sin tinte. Ya pasaba antes.
- **`views/correo/index.css`** concentra 302 literales, la mayor paleta local
  que queda.
