# Colecciones continuas y referencia visual

## Invariante de producto

Las colecciones largas del panel se amplían automáticamente al desplazarse. No
se permite un botón, enlace, acordeón o acción oculta equivalente a «Mostrar
más», «Ver más» o «Cargar más».

La carga continua no significa descargar el dataset completo. Cada vista
conserva el mecanismo paginado de su API y sólo incorpora el siguiente lote
cuando el sentinel se aproxima al final de `.main-content`.

## Página padre visual

La referencia visual de facto es la vista privada `/incidencias`.

| Responsabilidad | Autoridad |
| --- | --- |
| Ruta y carga del módulo | `src/router/routes.js` (`viewKey: "incidencias"`) |
| Controlador y lifecycle | `src/views/incidencias/index.js` (`IncidenciasView`) |
| Listado y estados | `src/views/incidencias/incidencias.template.js` |
| Composición principal | `src/css/views/incidencias/index.css` |
| Creación, detalle y media | `src/views/incidencias/incidencias.template.create.js`, `incidencias.template.modal.js` y sus hojas de vista |
| Manifest de estilos | `src/router/styles.js` (`incidencias`) |
| Tokens dark/light | `src/css/tokens/variables.css` y `src/css/tokens/light.css` |
| Scroll vertical | `.main-content`, definido por Foundation/layout |
| Mobile DataList | `src/features/mobile-datalist/index.js` y `src/css/compositions/mobile-datalist.css` |

Patrones que las vistas secundarias deben conservar:

- hero en grid, título `clamp(30px, 3vw, 44px)`, subtítulo y acciones;
- espaciado mediante `--space-*`, sin escalas privadas;
- cards y tabla con tokens `--card-*`, `--table-*`, `--border-*` y
  `--shadow-*`;
- botones, inputs, pills y foco mediante tokens compartidos, incluido
  `--focus-ring`;
- radios mediante `--radius-*` y `--btn-radius`;
- jerarquía hero → métricas → historial → estados de continuación;
- hover/focus/active explícitos y disabled sin interacción;
- skeleton inicial, overlay de refresh, vacío, error inicial, error incremental
  y final real;
- responsive propio a 1120, 820 y 560 px, más la composición DataList común a
  680 px;
- reduced motion, forced colors e impresión;
- `.main-content` como único viewport vertical del panel.

La página padre no se duplica como un segundo design system. Clientes,
Facturas y Usuarios reutilizan sus tokens, ritmo, cards, controles, tabla y
estados, manteniendo el negocio de cada dominio.

## Contrato de ejecución

Cada feed continuo cumple estas reglas:

1. Página inicial acotada y continuación del backend.
2. `IntersectionObserver` en un sentinel pasivo, con root `.main-content`.
3. Prefetch antes del final mediante `rootMargin`.
4. Un único request incremental activo.
5. Teardown con `disconnect()` y `takeRecords()`; callbacks antiguos se
   rechazan por identidad del observer.
6. Unión por ID estable y orden del backend.
7. Cursores repetidos/cíclicos o páginas no terminales sin IDs nuevos detienen
   la carga automática.
8. Un error de página conserva filas y continuación. `Reintentar` sólo aparece
   después de un fallo y nunca actúa como paginación manual.
9. El sentinel no se renderiza durante loading, error incremental o final.
10. Filtros, búsqueda y orden invalidan su contexto anterior antes de aceptar
    una respuesta.
11. El foco, caret y posición de scroll se preservan cuando el DOM incremental
    se reemplaza; el retry usa un destino de foco estable.
12. Una región viva pequeña anuncia carga y final sin convertir toda la tabla
    en `aria-live`; los errores usan una alerta atómica y un destino de foco
    estable, sin anuncio duplicado.
13. La búsqueda espera al final de una composición IME antes de invalidar o
    solicitar la consulta definitiva.

## Implementación por vista

| Vista | Paginación | Estado remoto | Protección de consulta |
| --- | --- | --- | --- |
| Incidencias | cursor opaco | `nextCursor` | filtros/búsqueda server-side, historial de cursores y sort local bloqueado hasta completar |
| Clientes | cursor opaco | `nextCursor` + `hasMore` | `queryVersion`, abort, reconciliación por el cursor fresco y poda sólo en final confirmado |
| Usuarios | continuation token | `continuationToken` + `hasMore` | `queryEpoch`, task identity y preservación de páginas en revalidación |
| Facturas | página acotada | `nextPage` + `hasMore` | clave canónica de query/contexto y caché stale aislada |

El estado incremental de una vista nunca se reutiliza tras cambiar filtro,
búsqueda u orden. Clientes conserva temporalmente la colección visible durante
una revalidación y recorre desde el nuevo cursor de P1; así, una inserción que
desplaza la frontera no oculta ni pierde filas. Sólo poda registros ausentes
cuando el backend confirma el final de esa cadena fresca.

Facturas sólo puede usar un fallback stale para la petición exacta que lo creó;
no puede cruzar consultas. Como su continuación usa offset, sólo conserva
páginas acumuladas cuando P1 mantiene exactamente sus IDs y ambos totales
exactos prueban que el tamaño no cambió. Un alta optimista sólo se inserta en un
historial parcial si el orden es descendente; en ascendente se espera a la
revalidación para no intercalarla antes de páginas aún no cargadas. Los
envelopes `data[]` mantienen los metadatos de paginación de `meta`.

### Virtualización

Los lotes remotos actuales son acotados (Incidencias 48, Clientes y Usuarios
50, Facturas 100). No se añade windowing en este cambio porque alteraría la
semántica de tabla, el foco y la composición Mobile DataList sin existir un
umbral de volumen documentado que lo justifique. Si telemetría o totales reales
muestran historiales de miles de filas por sesión, la siguiente evolución debe
ser virtualización accesible conservando IDs estables, foco y restauración de
scroll; no una descarga completa ni un recorte silencioso de filas.

## Gates de CI

`Repository Integrity` ejecuta:

- `.github/scripts/incidencias_scale_contract.py`;
- `.github/scripts/clientes_scale_contract.py`;
- `.github/scripts/facturas_continuous_scroll_contract.py`;
- `.github/scripts/usuarios_scale_contract.py`;
- `.github/scripts/continuous_scroll_smoke.mjs`.

El smoke renderiza estados normal/error, rechaza controles manuales, comprueba
sentinels pasivos, anuncios no duplicados, filas preservadas, reconciliación de
fronteras, envelopes API, bloqueo de orden y aislamiento de contexto. Los
contratos complementan ese render con guards de carrera, foco, composición IME,
deduplicación y progreso.

## Despliegue y rollback

El frontend se publica como artefacto estático sin build en Azure Static Web
Apps. El flujo seguro es branch → pull request → checks → preview → merge a
`main` → verificación de bytes y producción.

No existe rollback automático. La recuperación es un revert del commit/PR
desplegado, seguido por el mismo workflow y sus verificaciones.
