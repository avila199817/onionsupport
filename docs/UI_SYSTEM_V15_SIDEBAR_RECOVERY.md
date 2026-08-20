# Onion Support — UI System V15 Sidebar Recovery

## Incidencia

El shell privado reservaba el ancho del Sidebar, pero el DOM visual no llegaba a montarse. La causa era un `ReferenceError` en `src/ui/sidebar/template.js`: `normalizeRoleList()` conservaba `raw.map(normalizeRole)` después de que V12 eliminara `normalizeRole()` como supuesto código muerto.

Como `SidebarUI.init()` se ejecuta como UI no crítica durante el boot, ese error no detenía la SPA: Home y Topbar continuaban cargando mientras `chrome.css` conservaba el offset desktop del Sidebar. El resultado visual era un hueco vacío del ancho exacto del Sidebar.

## Reparación

- `sidebar/template.js` consume directamente `AppCore.normalizeRole()`.
- No se reintroduce ningún parser ni catálogo local de roles.
- El contrato sigue siendo `admin` / `user`.
- La versión del template pasa a `sidebar.template.unified.v6-core-role-authority`.
- Repository Integrity bloquea tanto el callback huérfano como la reaparición de un `function normalizeRole()` local.

## Tamaño

- Template antes: **42,786 bytes**
- Template después: **42,914 bytes**
- Cambio neto: **+128 bytes**

## Causa de regresión

La auditoría V12 contaba únicamente llamadas con forma `normalizeRole(...)`. Una referencia usada como callback (`map(normalizeRole)`) no fue detectada como consumidor y el helper fue clasificado erróneamente como dead-code. V15 corrige el runtime y añade una invariante explícita para este patrón.
