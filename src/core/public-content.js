/* Public commercial content shared by the Home template and the static
   service-page generator (tools/sync-public-site.mjs). Data only: no DOM,
   no imports, no claims that are not verified with the owner. Icons are
   names resolved by each renderer. */

import { PUBLIC_SITE } from "./public-site.js";

/* Ventajas que se repiten en Home, servicios y acceso. */
export const PUBLIC_TRUST_ITEMS = Object.freeze([
  Object.freeze({ icon: "bolt", label: "Trato directo" }),
  Object.freeze({ icon: "shield", label: "Presupuesto previo" }),
  Object.freeze({ icon: "invoice", label: "Servicio con factura" }),
]);

/* Método en tres pasos: el mismo proceso en todas las páginas comerciales. */
export const PUBLIC_METHOD_STEPS = Object.freeze([
  Object.freeze({
    icon: "invoice",
    title: "Cuéntame qué ocurre",
    text: "Envía el modelo del equipo, los síntomas y desde cuándo falla. Revisaré tu solicitud y te contactaré para concretar el diagnóstico.",
  }),
  Object.freeze({
    icon: "shield",
    title: "Conoce tus opciones",
    text: "Te explico el problema, la solución propuesta y el presupuesto. Decides cómo continuar antes de la reparación.",
  }),
  Object.freeze({
    icon: "check",
    title: "Recibe la solución",
    text: "Realizo el trabajo acordado y compruebo el resultado. Con factura y una explicación clara de la intervención.",
  }),
]);

/* Preguntas frecuentes generales: valen para Home y para cada servicio. */
export const PUBLIC_FAQS = Object.freeze([
  Object.freeze({
    question: "¿Atendéis en toda España?",
    answer: `${PUBLIC_SITE.coverage} Cuéntame qué ocurre y dónde estás para valorar la modalidad de asistencia adecuada.`,
  }),
  Object.freeze({
    question: "¿Cómo solicito un diagnóstico?",
    answer: "Pulsa en Abrir incidencia y completa el formulario con tus datos y el problema del equipo. Revisaré tu solicitud y te contactaré para concretar el siguiente paso. También puedes escribirme por WhatsApp.",
  }),
  Object.freeze({
    question: "¿Hay presupuesto antes de reparar?",
    answer: "Sí. El coste depende de la avería, el trabajo y los componentes necesarios. Te explicaré las opciones y el presupuesto para que decidas antes de la reparación.",
  }),
  Object.freeze({
    question: "¿Emites factura?",
    answer: "Sí. Emitimos factura por los servicios prestados a particulares, autónomos y empresas.",
  }),
  Object.freeze({
    question: "¿Qué datos conviene enviar?",
    answer: "Modelo del equipo, qué ocurre, desde cuándo pasa, mensajes de error y nivel de urgencia.",
  }),
  Object.freeze({
    question: "¿Necesito crear una cuenta antes?",
    answer: "No necesitas iniciar sesión para enviar la solicitud. Si es tu primera vez, recibirás un enlace seguro por correo para activar tu acceso. Si ya tienes cuenta, podrás consultar tus incidencias desde tu panel.",
  }),
  Object.freeze({
    question: "¿Qué debo hacer antes de entregar el equipo?",
    answer: "Siempre que sea posible, prepara una copia de seguridad actualizada de tus archivos. Una avería de almacenamiento puede impedir recuperar los datos. No envíes contraseñas ni información sensible en el formulario.",
  }),
]);
