# Onion Support — UI System V4 Audit

Barrida transversal generada sobre el repositorio productivo.

## Resultado estructural

- `chrome.css` es la única autoridad geométrica de Topbar/Sidebar/Main.
- No existe `mobile-shell.css` ni bridge JS `features/mobile-shell`.
- Correo deja de cargar una `fullheight.css` global y la integra en su viewport de ruta.
- El icono de Correo vive en `sidebar.css`; no existe mini-hoja paralela.
- RouteStyles mantiene el CSS privado por ruta; `app.css` sólo carga infraestructura global.

## Inventario CSS

- Archivos CSS: **35**
- Peso fuente CSS: **1,054,124 bytes**
- Declaraciones `!important`: **346**
- Bloques `@media`: **215**
- Literales hex detectados: **889**

## Hojas más grandes

| CSS | bytes | !important | @media | hex |
|---|---:|---:|---:|---:|
| `src/css/components/ui.css` | 62,270 | 18 | 6 | 0 |
| `src/css/views/public/index.css` | 61,251 | 1 | 8 | 43 |
| `src/css/tokens/variables.css` | 56,023 | 0 | 8 | 67 |
| `src/css/views/incidencias/detail.css` | 55,824 | 0 | 6 | 2 |
| `src/css/views/correo/viewport.css` | 50,852 | 170 | 13 | 256 |
| `src/css/auth/login.css` | 46,041 | 1 | 10 | 55 |
| `src/css/layout/topbar.css` | 41,074 | 27 | 10 | 38 |
| `src/css/views/correo/index.css` | 40,375 | 6 | 5 | 94 |
| `src/css/core/core.css` | 36,595 | 45 | 7 | 6 |
| `src/css/tokens/light.css` | 35,353 | 0 | 2 | 178 |
| `src/css/views/incidencias/index.css` | 35,141 | 0 | 3 | 3 |
| `src/css/core/layout.css` | 34,394 | 31 | 11 | 6 |
| `src/css/views/servidor/index.css` | 33,290 | 1 | 6 | 0 |
| `src/css/views/usuarios/index.css` | 32,324 | 12 | 7 | 0 |
| `src/css/views/clientes/index.css` | 31,119 | 0 | 7 | 0 |

## Deuda prioritaria siguiente

1. Reducir gradualmente `!important` históricos de Correo ahora que ya no compiten tres autoridades CSS.
2. Extraer el contrato modal compartido que Usuarios reutiliza actualmente desde `incidencias/detail.css`.
3. Converger create/detail hacia componentes y tokens comunes sin duplicar lógica de dominio.
4. Mantener DataList como composición móvil transversal.

> Una necesidad transversal se convierte en sistema; una necesidad de dominio vive en su vista; un parche no se convierte en arquitectura.
