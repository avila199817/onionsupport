# Onion Support — UI System V5 Audit

## Correo: normalización de cascada

La consolidación V4 eliminó la tercera autoridad `fullheight.css`. V5 aprovecha esa arquitectura para retirar prioridad forzada que ya no necesita competir con hojas paralelas.

- `viewport.css` antes: **170** declaraciones `!important`.
- `viewport.css` después: **7** declaraciones `!important`.
- Prioridades forzadas retiradas: **163**.
- Las excepciones supervivientes quedan reservadas para `prefers-reduced-motion` y `print`.
- Repository Integrity bloquea volver a superar **16** `!important` en `viewport.css`.

## Inventario CSS posterior

- Hojas CSS: **35**
- Peso fuente CSS: **1,052,331 bytes**
- `!important` globales: **183**
- Bloques `@media`: **215**

## Resultado

Correo mantiene exactamente las mismas propiedades y selectores; V5 sólo retira `!important` no esenciales. Al estar `viewport.css` después de `index.css` dentro de la misma capa `views`, la cascada normal vuelve a decidir la composición.

## Siguiente deuda prioritaria

1. Extraer el shell modal compartido para que Usuarios deje de depender de `incidencias/detail.css`.
2. Separar primitives transversales de los estilos de dominio de Incidencias.
3. Converger create/detail de Incidencias, Facturas, Clientes y Usuarios sobre componentes compartidos donde el contrato sea realmente común.
