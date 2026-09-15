# Tipografía de título y subtítulo de las altas en la composición · 2026-09-15

## Qué cambia

- `src/css/compositions/private-create-modal.css`: la tipografía del título (`h2`) y del subtítulo (`p`) del header de las cuatro altas (Incidencias, Facturas, Clientes, Usuarios) se declara una sola vez sobre `:is(.inc-create-header-copy, .cli-create-header-copy, .fac-create-header-copy, .usr-create-header-copy)`, junto a la rejilla del bloque que ya era compartida, con su variante hasta 760 px (`clamp(22px, 7vw, 29px)`).
- `views/incidencias/create.css` 1038 → 1009, `views/facturas/create.css` 1015 → 987, `views/clientes/create.css` 747 → 720, `views/usuarios/create.css` 71 → 50 líneas: salen las cuatro copias (rejilla del bloque, `h2`, `p` y su regla responsive). Los valores eran idénticos salvo dos derivas de Facturas que se normalizan: el subtítulo pasa de `line-height` 1.42 a 1.4 y, hasta 640 px, título y subtítulo dejan de reducirse a 25 px y `--font-xs` para seguir la misma escala que las otras tres altas (a 390 px el título pasa de 25 a 27 px). `text-wrap: balance` del título, que ya tenían Clientes y Usuarios, se aplica a las cuatro.

## Contratos

- `private_create_modal_contract.py`: la composición debe declarar la tipografía de `h2` y `p` del bloque de título y ninguna hoja de alta puede volver a estilizarlos.
- Comportamiento verificado con `private_create_modal_contract`, `private_css_authority_contract`, `repo_integrity`, `modal-shell-contract`, `factura-create-browser-contract` 13, `modal_lifecycle_contract` 22, `ui_loading_browser_contract`. Geometría medida con los controladores reales de las altas de Clientes y Usuarios antes y después, a 1366 y 390 px: header, título (30,05 px / 27,3 px, `balance`) y subtítulo idénticos.

## Siguiente

Mapa canónico de la arquitectura de diálogos y cierre de la fase.
