# Contrato de tamaño de imagen pública — 2026-09-12

Este cambio afecta únicamente a validación y documentación. Conserva el runtime de la base `8d9dab86`; debe integrarse antes de la mejora visual que adopta el nuevo tamaño del retrato.

El contrato admitía exclusivamente `calc(100vw - 90px)` hasta 720px. Ahora admite esa política publicada y una segunda fórmula exacta: `min(594px, calc(100vw - 106px))`. En ambas, la declaración del template debe existir una sola vez y coincidir exactamente con la del preload. Los tramos de escritorio siguen siendo 206px, 176px y 196px. Otras fórmulas fallan.

La nueva variante exige además la geometría móvil que la justifica: 20px de margen a cada lado, visual con máximo de 660px, padding del perfil de 14px, padding del hero de 16px, una columna y tres bordes de 1px por lado. De ahí salen los 106px que se restan al viewport y el máximo de 594px del retrato. Se comprueban también `border-box`, la anchura del retrato, el consumo del gutter y la ausencia de una segunda autoridad geométrica en `home-experience.css`.

La lectura de CSS conserva el ámbito de las reglas y descarta comentarios y cadenas. Los casos negativos cubren desajustes, fórmulas arbitrarias, declaraciones duplicadas, geometría ausente o distinta, ámbitos incorrectos y varias formas de sobrescritura. Este control estático acotado acompaña la comprobación del layout y las peticiones de imagen en navegador; no pretende implementar toda la cascada CSS.

Las mediciones de la propuesta visual a 320/360/390/412/540/640/700/720px dieron retratos de 214/254/284/306/434/534/594/594px respectivamente. Son evidencia de la propuesta y no una medición de este cambio de tooling ni de producción.

No cambian los candidatos WebP 224/480/640/960, sus dimensiones, los presupuestos de bytes, el arranque, la procedencia del tooling confiable ni los demás contratos. El core sigue leyendo el checkout candidato mediante `ONION_REPO_ROOT`; no importa ni ejecuta su código.

Comprobaciones dirigidas:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 .github/scripts/public_home_integrity.py
PYTHONDONTWRITEBYTECODE=1 python3 .github/scripts/public_home_image_sizes_regression.py
PYTHONDONTWRITEBYTECODE=1 python3 .github/scripts/public_site_policy_regression.py
```

La PR de tooling se valida con los controles de la base sin rebajarlos. Después de integrarla, la propuesta visual se actualiza sobre esa base para ser evaluada con la política ya confiable. La publicación y la verificación de la propuesta visual se acreditan por separado.
