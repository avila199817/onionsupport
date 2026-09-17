/* =========================================================
   Onion Support · Tono canónico de un estado de dominio
   Archivo: /src/core/status-tone.js

   POR QUÉ EXISTE

   `css/components/status-system.css` ya declara en su cabecera el contrato
   visual del SPA, y una de sus líneas es literal:

       «Cancelado => neutral, nunca falso éxito.»

   La hoja cumple su parte: traduce tono a color. Lo que no tenía autoridad era
   el paso ANTERIOR --quién decide el tono-- y cada vista lo resolvía por su
   cuenta. Medido antes de este módulo, el MISMO estado de negocio se pintaba
   de colores distintos según la pantalla:

     cancelada    Incidencias verde · Agenda rojo · Facturas neutro · Home rojo
     archivada    Incidencias verde
     en curso     lista de Incidencias neutro · su propio detalle azul
     nueva        Incidencias y Clientes ámbar · Home azul
     inactivo     lista de Usuarios rojo · su propio detalle VERDE
     bloqueado    lista de Usuarios rojo · su propio detalle neutro
     cancelada    dentro del MISMO modal de Facturas: el chip de pago sin tono
                  («muted») y el chip de estado en rojo

   El verde de «Cancelada» en Incidencias venía de que su `statusKey()` pliega
   `cancelled|canceled|cancelada|cancelado|archived` a `"closed"`, y `closed`
   --cerrada por resolución-- sí es éxito. El pliegue no es un error: `isClosed()`
   filtra con él y tiene que seguir haciéndolo. El error era usar la misma
   función para dos preguntas distintas.

   TRES PREGUNTAS, TRES RESPUESTAS

     A · estado semántico   el valor del backend, tal cual («cancelada»)
     B · tono de pintura    ESTE módulo: uno de cinco tonos
     C · clave de filtrado  `statusKey()` de cada vista; no se toca

   Este módulo sólo responde B. No traduce etiquetas (eso es de cada dominio),
   no decide ciclo de vida y no conoce colores: nombra tonos, y la hoja los
   pinta.

   FUERA DE ALCANCE

   Prioridad (`high|urgent|critical`) y salud de infraestructura
   (`healthy|warning|critical`) son vocabularios distintos que comparten
   paleta, no estados de dominio. Siguen pintándose por clase en la hoja.
========================================================= */

import { slugKey } from "./slug-key.js";

/* Los cinco tonos son exactamente las cinco familias de tokens que declara
   `status-system.css` (`--ui-status-<tono>-fg|bg|border|dot`). */
export const STATUS_TONES = Object.freeze([
  "open",
  "pending",
  "success",
  "danger",
  "neutral",
]);

/* El atributo con el que cada chip declara su tono. La hoja lo lee en la
   última capa, así que gana a cualquier clase por vista. */
export const STATUS_TONE_ATTRIBUTE = "data-status-tone";

/* Un valor por estado alcanzable, recogido de los mapas que ya existían:
   `STATUS_MAP` de Incidencias, `getEstadoPagoKey` de Facturas, `statusKey` de
   Home, `STATE_LABEL` de Agenda y los cubos de Clientes y Usuarios. No se
   inventan estados que nadie emite. */
const TONE_BY_STATE = Object.freeze({
  /* EN CURSO · azul operativo */
  open: "open", opened: "open", abierta: "open", abierto: "open",
  in_progress: "open", inprogress: "open", progress: "open",
  proceso: "open", en_proceso: "open", processing: "open",
  working: "open", assigned: "open", asignada: "open", asignado: "open",
  issued: "open", emitida: "open", emitido: "open",

  /* A LA ESPERA · ámbar de atención */
  pending: "pending", pendiente: "pending",
  new: "pending", nueva: "pending", nuevo: "pending",
  invited: "pending", invitada: "pending", invitado: "pending",
  unpaid: "pending", sin_pagar: "pending", pending_payment: "pending",
  partial: "pending", parcial: "pending", pago_parcial: "pending",
  draft: "pending", borrador: "pending",

  /* TERMINADO BIEN · verde de éxito */
  resolved: "success", resuelta: "success", resuelto: "success", solved: "success",
  closed: "success", close: "success", cerrada: "success", cerrado: "success",
  finalizado: "success", finalizada: "success",
  terminado: "success", terminada: "success",
  completed: "success", done: "success", finished: "success",
  paid: "success", pagada: "success", pagado: "success",
  cobrada: "success", cobrado: "success", abonada: "success", abonado: "success",
  sent: "success", enviada: "success", enviado: "success",
  active: "success", activa: "success", activo: "success", vip: "success",
  programada: "success",

  /* EXCEPCIÓN · rojo de error */
  overdue: "danger", vencida: "danger", vencido: "danger",
  blocked: "danger", bloqueado: "danger", bloqueada: "danger",
  suspended: "danger", suspendido: "danger", suspendida: "danger",
  locked: "danger",
  inactive: "danger", inactivo: "danger", inactiva: "danger",
  disabled: "danger", desactivado: "danger", desactivada: "danger",

  /* TERMINADO SIN ÉXITO · neutro.
     La línea que este módulo existe para hacer cumplir en todo el SPA:
     cancelar o archivar cierra el asunto, pero no lo resuelve. Ni verde
     --sería un éxito falso-- ni rojo --no es un fallo del sistema--. */
  cancelled: "neutral", canceled: "neutral",
  cancelada: "neutral", cancelado: "neutral",
  anulada: "neutral", anulado: "neutral", void: "neutral",
  archived: "neutral", archivada: "neutral", archivado: "neutral",
});

/*
  Devuelve el tono de un estado de dominio.

  Recibe el valor que TODAVÍA lleva el estado: el crudo del backend, o una
  clave normalizada que no haya perdido información. No debe recibir el
  resultado de un `statusKey()` que pliegue «cancelada» sobre «cerrada»: ahí el
  estado ya no existe y la respuesta sería verde.

  Un valor desconocido o vacío devuelve `"neutral"`: sin lectura declarada no
  se le inventa un significado, que es lo que ya hacía la hoja al no encontrar
  la clase en ningún bloque.
*/
export function statusTone(value = "") {
  return TONE_BY_STATE[slugKey(value)] || "neutral";
}
