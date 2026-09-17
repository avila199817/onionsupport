# Aceptación conjunta de los tres defectos · 2026-09-17

Los tres defectos se corrigieron en unidades separadas, cada una con su propio
contrato. Esta nota registra la comprobación **conjunta**: los tres, en una
sola sesión de la aplicación construida, sin recargar entre medias.

## Dónde vive

`tools/spa-session-contract.mjs` pasa de 16 a **20 pasos**. Los cuatro nuevos
no repiten los contratos dedicados: comprueban que las tres correcciones
conviven en continuidad, que es donde se rompieron.

| Paso | Qué recorre | Defecto |
| --- | --- | --- |
| 15 | «Valoraciones» sobre el detalle de una factura: prueba de impacto, la capa activa recibe sus clics y la retenida no | superposición |
| 17 | Usuarios por el router: el directorio carga, técnico y administrador quedan fuera, y no aparece texto del motor en pantalla | Usuarios |
| 18 | Buscar, dos filtros esperados **por identidad**, abrir el usuario pulsado, cerrar por teclado, salir y volver | Usuarios |
| 19 | `INC-SINT-1` abierta desde `home.activity`, con la hoja de Incidencias ya aparcada | estilos |
| 20 | `F-SINT-1` abierta desde `home.invoices`, con la de Facturas ya aparcada | estilos |

Los pasos 19 y 20 no comprueban que exista un `<link>`: comparan la **huella
completa** del panel —caja, color, fondo, radio, tipografía, peso, relleno,
borde, distribución y separación de cada nodo— contra la apertura de **la misma
ficha** desde su propia ruta, en esa misma sesión. La identidad de la ficha se
descubre en el disparador de Home, no se escribe a mano.

Un documento, escritorio y móvil emulado (390×844), cero errores de página,
cero llamadas fuera de origen y cero escrituras de dominio.

## Dos negativas nuevas

| Negativa | Mutación | Lo que dice el recorrido |
| --- | --- | --- |
| **N8** · Usuarios carga su directorio | retirar el `import { slugKey }` y volver a llamar a `directoryKey` | «Usuarios no pintó ninguna fila» (paso 17) |
| **N9** · un detalle conserva su CSS venga de donde venga | retirar la reclamación de hojas | «INC-SINT-1 desde home.activity: **171 de 212** nodos pierden su presentación» (paso 19) |

N6 —la capa de Valoraciones— ya estaba verificada por mutación en el paso 15.

## Lo que hizo falta en el arnés

El arnés compartido servía `/api/users` devolviendo siempre las cuatro
personas. Un endpoint que ignora lo que se le pregunta no prueba ni la búsqueda
ni el filtro, así que ahora responde a `search` y a `status`.

`/api/users/me/onboarding` y `/api/clientes/stats` se responden **vacíos a
propósito** y de forma declarada, en vez de quedar como llamadas que el arnés
no reproduce: así el recorrido comprueba que Home y Usuarios se sostienen sin
ese estado.

## Límites

- El recorrido usa las entradas de Home para los pasos 19 y 20. La entrada
  `facturas.lista → incidencia` la cubre `detail-styles-ownership-contract`,
  que recorre las cuatro entradas externas.
- **Incidencia → Factura no existe** como entrada y queda registrado como
  medición, no como pendiente.
