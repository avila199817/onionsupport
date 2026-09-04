# Sistema compartido de modales

La interacción de los diálogos pertenece a `src/features/entity-overlay/modal-lifecycle.js`. EntityOverlay mantiene la navegación entre entidades y los controladores conservan sus formularios, peticiones, confirmaciones y templates.

## Responsabilidad única

El lifecycle compartido controla:

- una pila de diálogos por documento y un listener de teclado mientras exista algún diálogo activo;
- Escape exclusivamente para el diálogo superior, respetando la política de cierre del controlador;
- Tab y Shift+Tab entre controles visibles y habilitados;
- bloqueo de scroll con propietarios, conservación de clases previas y restauración exacta de estilos inline;
- devolución segura de foco, sin moverlo fuera de otro diálogo abierto;
- limpieza de registros y bloqueo cuando se desmonta una vista.

La resolución de un botón de retorno que se ha vuelto a renderizar, el scroll del visor de adjuntos y la selección de texto del formulario siguen siendo responsabilidades del propietario. No son motores de modal alternativos.

## Integraciones

| Superficie | Propietario del contenido y las acciones |
| --- | --- |
| Preferencias de consentimiento Google | `analytics/google-tag.js` |
| Entidades transversales | `features/entity-overlay/index.js` |
| Incidencias: alta, detalle y confirmaciones internas | `views/incidencias/index.impl.js` |
| Facturas: alta, detalle y confirmación de reenvío | `views/facturas/index.js` |
| Confirmación de cobro | `features/facturas-paid-confirm/index.js` |
| Clientes: alta y detalle | `views/clientes/clientes.index.legacy.js`, `clientes.template.modal.js` |
| Usuarios: alta y detalle | `views/usuarios/usuarios.template.create.js`, `usuarios.template.modal.js` |
| Correo: redacción, firma y confirmaciones | `views/correo/index.js` |
| Perfil del técnico | `features/incidencias-technician-profile/index.js` |
| Visor de adjuntos | `features/incidencias-video-preview/core.js` |

Los menús desplegables, comboboxes y la navegación móvil mantienen sus interacciones semánticas. El listener compartido permite que un combobox consuma Escape antes de cerrar su diálogo.

## Uso

```js
const lifecycle = createModalLifecycle({
  getPanel: () => host.querySelector('[role="dialog"]'),
  onEscape: () => { if (!submitting) closeDialog(); },
  bodyClasses: ['feature-dialog-open'],
});

// Después de insertar el panel conectado al documento.
lifecycle.activate({ opener: document.activeElement });

// Al cerrar o destruir; no modifica el contenido del formulario.
lifecycle.deactivate();
```

`getPanel` se evalúa de forma diferida para soportar un rerender síncrono del mismo diálogo. Activar un panel inexistente o desconectado no bloquea la página. Repetir `activate` actualiza las clases sin crear entradas duplicadas. `onDetached` permite resolver una confirmación pendiente si el propietario desaparece; un error de esa limpieza no impide liberar otros registros.

El propietario debe insertar el diálogo antes de activarlo y liberar su lifecycle durante su teardown normal. El observer compartido es una protección final ante DOM retirado externamente.

## Verificación

`.github/scripts/modal_lifecycle_contract.mjs` ejecuta en Chromium escenarios de anidamiento, cierre en orden inverso, guardas de operación pendiente, foco visible, diálogos vacíos, combobox, rerender, desmontaje y eliminación de listeners. También abre los módulos reales de Usuarios, Clientes y confirmación de reenvío de Facturas. Comprueba además consentimiento Google denegado antes de configurar etiquetas, exclusión de rutas privadas, saneamiento de URLs y foco/teclado del diálogo real de preferencias. Las solicitudes Google se interceptan localmente. No realiza mutaciones de dominio ni envía correos.
