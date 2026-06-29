/* =========================================================
   Onion Support - Public Home Template
   Archivo: /src/views/public/home/template.js

   Responsabilidad:
   - Construir el HTML de la landing pública de Onion Support.
   - Usar el layout común de /src/views/public/index.js.
   - Pintar navegación pública, hero, servicios, proceso, precios,
     contacto, formulario diagnóstico y footer.
   - Exponer contrato DOM data-public-home-* consumido por home/index.js.
   - Incluir acceso a /login.
   - Incluir CTA real a WhatsApp.
   - Sin Auth.
   - Sin Router lógico.
   - Sin HTTP.
   - Sin Store.
   - Sin Toast.
   - Sin eventos.
========================================================= */

import {
  PUBLIC_AUTH_LOGO,
  escapeAttr,
  escapeHtml,
  renderPublicShell,
  safeAssetSrc,
  safeInternalHref,
} from "../index.js";

export const PUBLIC_HOME_TEMPLATE_VERSION = "public.home.template.v1";

/* =========================================================
   BUSINESS CONSTANTS
========================================================= */

const APP_NAME = "Onion Support";

const BUSINESS = {
  name: "Onion Support",
  legalServiceName: "Servicio técnico informático",
  domain: "onionsupport.com",
  email: "hola@onionsupport.com",

  phoneDisplay: "629 946 615",
  phoneInternational: "34629946615",
  phoneTel: "+34629946615",

  locationShort: "Sant Vicenç de Castellet",
  locationFull: "Sant Vicenç de Castellet (Barcelona)",
  postal: "08295 Barcelona",

  loginPath: "/login",
};

const DEFAULT_WHATSAPP_MESSAGE =
  "Hola, vengo desde Onion Support. Quiero solicitar un diagnóstico/presupuesto.";

/* =========================================================
   BASICS
========================================================= */

function text(value = "", fallback = "") {
  const output = String(value ?? "")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return output || fallback;
}

function phoneDigits(value = "") {
  return text(value, "").replace(/[^\d]/g, "");
}

function whatsappHref(message = DEFAULT_WHATSAPP_MESSAGE) {
  const phone = phoneDigits(BUSINESS.phoneInternational);
  const cleanMessage = text(message, DEFAULT_WHATSAPP_MESSAGE);

  return `https://wa.me/${phone}?text=${encodeURIComponent(cleanMessage)}`;
}

function telHref() {
  return `tel:${BUSINESS.phoneTel}`;
}

function mailHref() {
  return `mailto:${BUSINESS.email}`;
}

/* =========================================================
   ICONS
========================================================= */

function renderIcon(name = "") {
  const icons = {
    logoMark: `
      <svg class="public-home-icon public-home-icon--logo" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <path d="M32 4.75c9.88 9.2 18.5 19.3 18.5 32.1 0 12.22-8.23 22.4-18.5 22.4s-18.5-10.18-18.5-22.4C13.5 24.05 22.12 13.95 32 4.75Z"></path>
        <path d="M32 17.2c4.9 5.18 8.58 11.12 8.58 18.16 0 6.8-3.8 12.44-8.58 12.44s-8.58-5.64-8.58-12.44c0-7.04 3.68-12.98 8.58-18.16Z"></path>
      </svg>
    `,

    menu: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h16"></path>
        <path d="M4 12h16"></path>
        <path d="M4 17h16"></path>
      </svg>
    `,

    close: `
      <svg class="public-home-icon public-home-icon--close" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.5 6.5 17.5 17.5"></path>
        <path d="M17.5 6.5 6.5 17.5"></path>
      </svg>
    `,

    arrow: `
      <svg class="public-home-icon public-home-icon--arrow" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M5 12h13"></path>
        <path d="m13 6 6 6-6 6"></path>
      </svg>
    `,

    whatsapp: `
      <svg class="public-home-icon public-home-icon--whatsapp" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M20.25 11.85a8.2 8.2 0 0 1-12.15 7.2L3.75 20.25l1.23-4.22a8.2 8.2 0 1 1 15.27-4.18Z"></path>
        <path d="M9.28 8.65c.16-.36.32-.37.48-.37h.4c.13 0 .32.05.49.25.17.2.65.7.65 1.7s-.67 1.98-.76 2.11c-.1.13-1.32 2.08-3.25 2.83-1.6.62-1.93.5-2.28.47-.35-.03-1.13-.46-1.29-.9-.16-.45-.16-.83-.11-.91.05-.08.18-.13.38-.22.2-.1 1.13-.56 1.31-.62.17-.07.3-.1.43.1.13.2.5.62.61.75.12.13.23.15.43.05.2-.1.82-.3 1.56-.96.58-.51.97-1.15 1.08-1.35.12-.2.01-.3-.08-.4-.09-.08-.2-.22-.3-.33-.1-.12-.13-.2-.2-.33-.07-.13-.03-.25.02-.35.05-.1.43-1.04.43-1.52Z"></path>
      </svg>
    `,

    phone: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.1 4.75h2.2c.55 0 1.02.37 1.16.9l.65 2.55a1.2 1.2 0 0 1-.32 1.13L9.7 10.42a10.85 10.85 0 0 0 3.88 3.88l1.09-1.09a1.2 1.2 0 0 1 1.13-.32l2.55.65c.53.14.9.61.9 1.16v2.2a1.6 1.6 0 0 1-1.75 1.6C10.95 17.91 6.09 13.05 5.5 6.5a1.6 1.6 0 0 1 1.6-1.75Z"></path>
      </svg>
    `,

    mail: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 6.75h14.5v10.5H4.75V6.75Z"></path>
        <path d="m5.25 7.25 6.75 5.5 6.75-5.5"></path>
      </svg>
    `,

    location: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19.25 10.5c0 5.25-7.25 9.75-7.25 9.75s-7.25-4.5-7.25-9.75a7.25 7.25 0 1 1 14.5 0Z"></path>
        <path d="M12 13.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z"></path>
      </svg>
    `,

    shield: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 3.75 19.25 6v5.5c0 4.42-2.95 7.28-7.25 8.75-4.3-1.47-7.25-4.33-7.25-8.75V6L12 3.75Z"></path>
        <path d="m8.75 12 2.15 2.15 4.35-4.65"></path>
      </svg>
    `,

    bolt: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M13.25 2.75 5.75 13h5L10.75 21.25 18.25 10h-5l.25-7.25Z"></path>
      </svg>
    `,

    home: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m3.75 11.25 8.25-7 8.25 7"></path>
        <path d="M6.25 10.25v9h11.5v-9"></path>
        <path d="M10 19.25v-5.5h4v5.5"></path>
      </svg>
    `,

    invoice: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.25 3.75h9.5v16.5l-2-1.2-2.75 1.2-2.75-1.2-2 1.2V3.75Z"></path>
        <path d="M9.25 8h5.5"></path>
        <path d="M9.25 11.75h5.5"></path>
        <path d="M9.25 15.5h3"></path>
      </svg>
    `,

    laptop: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6.25 5.75h11.5v8.5H6.25v-8.5Z"></path>
        <path d="M4.25 18.25h15.5l-2-4H6.25l-2 4Z"></path>
      </svg>
    `,

    chip: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8 8h8v8H8V8Z"></path>
        <path d="M9.25 2.75v3"></path>
        <path d="M14.75 2.75v3"></path>
        <path d="M9.25 18.25v3"></path>
        <path d="M14.75 18.25v3"></path>
        <path d="M2.75 9.25h3"></path>
        <path d="M2.75 14.75h3"></path>
        <path d="M18.25 9.25h3"></path>
        <path d="M18.25 14.75h3"></path>
      </svg>
    `,

    refresh: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M19.25 8.75V4.75h-4"></path>
        <path d="M18.58 5.42A8.25 8.25 0 1 0 20 12"></path>
        <path d="M4.75 15.25v4h4"></path>
      </svg>
    `,

    speed: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 16.25a8.25 8.25 0 1 1 14.5 0"></path>
        <path d="m12 14 4-4"></path>
        <path d="M12 14.25h.01"></path>
        <path d="M7.25 16.25h9.5"></path>
      </svg>
    `,

    wifi: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.25 9.25a12 12 0 0 1 15.5 0"></path>
        <path d="M7.25 12.25a7.5 7.5 0 0 1 9.5 0"></path>
        <path d="M10.25 15.25a3 3 0 0 1 3.5 0"></path>
        <path d="M12 18.25h.01"></path>
      </svg>
    `,

    diagnostic: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M7.25 4.75v6a4.75 4.75 0 0 0 9.5 0v-6"></path>
        <path d="M7.25 4.75h-1.5"></path>
        <path d="M16.75 4.75h1.5"></path>
        <path d="M12 15.5v1.75a3 3 0 0 0 3 3h.75"></path>
        <path d="M17.25 20.25a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"></path>
      </svg>
    `,

    chat: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4.75 5.75h14.5v9.5H9.5l-4.75 4v-13.5Z"></path>
      </svg>
    `,

    clipboard: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M8.75 5.75h6.5"></path>
        <path d="M9 3.75h6a1 1 0 0 1 1 1v1.5H8V4.75a1 1 0 0 1 1-1Z"></path>
        <path d="M6.25 5.75h11.5v14.5H6.25V5.75Z"></path>
        <path d="M9.25 11h5.5"></path>
        <path d="M9.25 15h4"></path>
      </svg>
    `,

    wrench: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14.25 6.25a5 5 0 0 0 6.25 6.25l-7.75 7.75a2.5 2.5 0 0 1-3.5 0l-5.5-5.5a2.5 2.5 0 0 1 0-3.5l7.75-7.75a5 5 0 0 0 2.75 2.75Z"></path>
        <path d="M7.25 14.25 9.75 16.75"></path>
      </svg>
    `,

    check: `
      <svg class="public-home-icon public-home-icon--check" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m5.25 12.5 4.25 4.25 9.25-10"></path>
      </svg>
    `,

    star: `
      <svg class="public-home-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m12 3.75 2.48 5.02 5.52.8-4 3.9.94 5.5L12 16.37l-4.94 2.6.94-5.5-4-3.9 5.52-.8L12 3.75Z"></path>
      </svg>
    `,
  };

  return icons[name] || "";
}

/* =========================================================
   DATA
========================================================= */

const NAV_ITEMS = [
  {
    label: "Inicio",
    href: "#inicio",
  },
  {
    label: "Servicios",
    href: "#servicios",
  },
  {
    label: "Cómo trabajo",
    href: "#como-trabajo",
  },
  {
    label: "Precios",
    href: "#precios",
  },
  {
    label: "Contacto",
    href: "#contacto",
  },
];

const TRUST_ITEMS = [
  {
    icon: "bolt",
    label: "Respuesta rápida",
  },
  {
    icon: "home",
    label: "Servicio a domicilio",
  },
  {
    icon: "invoice",
    label: "Se emiten facturas",
  },
];

const SERVICES = [
  {
    icon: "laptop",
    title: "Reparación de ordenadores y portátiles",
    text: "Diagnóstico y solución de fallos en equipos de sobremesa y portátiles.",
  },
  {
    icon: "chip",
    title: "Cambio de SSD, RAM y componentes",
    text: "Mejoras de hardware para ganar velocidad, estabilidad y vida útil.",
  },
  {
    icon: "refresh",
    title: "Reinstalación del sistema operativo",
    text: "Instalación limpia, configuración inicial y puesta a punto del equipo.",
  },
  {
    icon: "speed",
    title: "Optimización y mejora del rendimiento",
    text: "Limpieza, ajustes y optimización para que el equipo vuelva a ir fino.",
  },
  {
    icon: "wifi",
    title: "Configuración de WiFi, redes e impresoras",
    text: "Red doméstica, conexión de impresoras, periféricos y pequeños entornos.",
  },
  {
    icon: "diagnostic",
    title: "Diagnóstico y solución de incidencias",
    text: "Revisión clara del problema y propuesta de solución antes de tocar nada.",
  },
  {
    icon: "home",
    title: "Servicio a domicilio",
    text: "Me desplazo en Sant Vicenç de Castellet y alrededores.",
  },
  {
    icon: "invoice",
    title: "Se emiten facturas",
    text: "Servicio preparado para particulares, autónomos y pequeñas empresas.",
  },
];

const STEPS = [
  {
    icon: "chat",
    title: "Me cuentas el problema",
    text: "Por WhatsApp, llamada o formulario. Cuanto más claro lo expliques, antes afinamos.",
  },
  {
    icon: "clipboard",
    title: "Diagnóstico y presupuesto",
    text: "Te explico qué ocurre, qué opciones hay y qué merece la pena hacer.",
  },
  {
    icon: "wrench",
    title: "Reparación y solución",
    text: "Trabajo rápido, limpio y orientado a dejar el equipo estable.",
  },
];

const PRICE_CARDS = [
  {
    eyebrow: "Diagnóstico",
    title: "Revisión inicial",
    text: "Analizo el problema y te digo qué solución tiene antes de avanzar.",
    points: ["Sin compromiso", "Explicación clara", "Prioridad según urgencia"],
  },
  {
    eyebrow: "Mejora",
    title: "SSD, RAM y rendimiento",
    text: "Ideal para ordenadores lentos que todavía pueden dar mucha guerra.",
    points: ["Componentes adecuados", "Instalación limpia", "Optimización final"],
    featured: true,
  },
  {
    eyebrow: "Sistema",
    title: "Reinstalación y puesta a punto",
    text: "Sistema limpio, drivers, configuración base y equipo listo para usar.",
    points: ["Sistema operativo", "Drivers y aplicaciones", "Equipo preparado"],
  },
];

const FAQS = [
  {
    question: "¿Trabajas a domicilio?",
    answer:
      "Sí. Ofrezco servicio a domicilio en Sant Vicenç de Castellet y alrededores.",
  },
  {
    question: "¿Puedo pedir presupuesto sin compromiso?",
    answer:
      "Sí. Primero me cuentas el problema y te doy una orientación clara antes de avanzar.",
  },
  {
    question: "¿Emites factura?",
    answer:
      "Sí. Se emiten facturas para particulares, autónomos y empresas.",
  },
];

/* =========================================================
   RENDER HELPERS
========================================================= */

function renderLogo({ compact = false } = {}) {
  const logoSrc = safeAssetSrc(PUBLIC_AUTH_LOGO, PUBLIC_AUTH_LOGO);

  return `
    <span
      class="public-home-brand-mark"
      aria-hidden="true"
    >
      <img
        class="public-home-brand-logo"
        src="${escapeAttr(logoSrc)}"
        alt=""
        width="44"
        height="44"
        loading="eager"
        decoding="async"
        draggable="false"
      >
    </span>

    <span class="public-home-brand-copy">
      <span class="public-home-brand-name">
        <span>ONION</span><strong>SUPPORT</strong>
      </span>

      ${
        compact
          ? ""
          : `
            <span class="public-home-brand-subtitle">
              Servicio técnico informático
            </span>
          `
      }
    </span>
  `;
}

function renderNavLinks() {
  return NAV_ITEMS.map((item) => {
    const href = text(item.href, "#inicio");
    const label = text(item.label, "");

    return `
      <a
        class="public-home-nav-link"
        href="${escapeAttr(href)}"
        data-public-home-nav-link="true"
        data-public-home-scroll-link="true"
      >
        ${escapeHtml(label)}
      </a>
    `;
  }).join("");
}

function renderTrustItems() {
  return TRUST_ITEMS.map((item) => {
    return `
      <li
        class="public-home-trust-item"
        data-public-home-reveal="true"
      >
        <span class="public-home-trust-icon" aria-hidden="true">
          ${renderIcon(item.icon)}
        </span>

        <span>
          ${escapeHtml(item.label)}
        </span>
      </li>
    `;
  }).join("");
}

function renderServices() {
  return SERVICES.map((service, index) => {
    return `
      <article
        class="public-home-service-card"
        data-public-home-reveal="true"
        style="--public-home-reveal-index: ${escapeAttr(index)};"
      >
        <span class="public-home-service-icon" aria-hidden="true">
          ${renderIcon(service.icon)}
        </span>

        <h3>
          ${escapeHtml(service.title)}
        </h3>

        <p>
          ${escapeHtml(service.text)}
        </p>
      </article>
    `;
  }).join("");
}

function renderSteps() {
  return STEPS.map((step, index) => {
    const number = index + 1;

    return `
      <article
        class="public-home-step"
        data-public-home-reveal="true"
        style="--public-home-reveal-index: ${escapeAttr(index)};"
      >
        <span class="public-home-step-number" aria-hidden="true">
          ${escapeHtml(number)}
        </span>

        <span class="public-home-step-icon" aria-hidden="true">
          ${renderIcon(step.icon)}
        </span>

        <h3>
          ${escapeHtml(step.title)}
        </h3>

        <p>
          ${escapeHtml(step.text)}
        </p>
      </article>
    `;
  }).join("");
}

function renderPriceCards() {
  return PRICE_CARDS.map((card, index) => {
    const featured = Boolean(card.featured);

    return `
      <article
        class="public-home-price-card ${featured ? "public-home-price-card--featured" : ""}"
        data-public-home-reveal="true"
        data-featured="${featured ? "true" : "false"}"
        style="--public-home-reveal-index: ${escapeAttr(index)};"
      >
        ${
          featured
            ? `
              <span class="public-home-price-badge">
                Recomendado
              </span>
            `
            : ""
        }

        <p class="public-home-price-eyebrow">
          ${escapeHtml(card.eyebrow)}
        </p>

        <h3>
          ${escapeHtml(card.title)}
        </h3>

        <p>
          ${escapeHtml(card.text)}
        </p>

        <ul class="public-home-price-points">
          ${(card.points || [])
            .map((point) => {
              return `
                <li>
                  <span aria-hidden="true">
                    ${renderIcon("check")}
                  </span>

                  <span>
                    ${escapeHtml(point)}
                  </span>
                </li>
              `;
            })
            .join("")}
        </ul>

        <a
          class="public-home-price-link"
          href="${escapeAttr(
            whatsappHref(`Hola, vengo desde Onion Support. Quiero consultar sobre: ${card.title}.`)
          )}"
          target="_blank"
          rel="noopener noreferrer"
          data-public-home-cta="true"
        >
          Consultar
          ${renderIcon("arrow")}
        </a>
      </article>
    `;
  }).join("");
}

function renderFaqs() {
  return FAQS.map((faq, index) => {
    return `
      <details
        class="public-home-faq-item"
        data-public-home-reveal="true"
        ${index === 0 ? "open" : ""}
      >
        <summary>
          ${escapeHtml(faq.question)}
        </summary>

        <p>
          ${escapeHtml(faq.answer)}
        </p>
      </details>
    `;
  }).join("");
}

function renderContactCards() {
  const whatsapp = whatsappHref();

  return `
    <div class="public-home-contact-cards">
      <a
        class="public-home-contact-card public-home-contact-card--primary"
        href="${escapeAttr(whatsapp)}"
        target="_blank"
        rel="noopener noreferrer"
        data-public-home-cta="true"
      >
        <span class="public-home-contact-icon" aria-hidden="true">
          ${renderIcon("whatsapp")}
        </span>

        <span>
          <strong>WhatsApp</strong>
          <small>${escapeHtml(BUSINESS.phoneDisplay)}</small>
        </span>
      </a>

      <a
        class="public-home-contact-card"
        href="${escapeAttr(telHref())}"
        data-public-home-cta="true"
      >
        <span class="public-home-contact-icon" aria-hidden="true">
          ${renderIcon("phone")}
        </span>

        <span>
          <strong>Llamar</strong>
          <small>${escapeHtml(BUSINESS.phoneDisplay)}</small>
        </span>
      </a>

      <a
        class="public-home-contact-card"
        href="${escapeAttr(mailHref())}"
        data-public-home-cta="true"
      >
        <span class="public-home-contact-icon" aria-hidden="true">
          ${renderIcon("mail")}
        </span>

        <span>
          <strong>Email</strong>
          <small>${escapeHtml(BUSINESS.email)}</small>
        </span>
      </a>

      <div class="public-home-contact-card">
        <span class="public-home-contact-icon" aria-hidden="true">
          ${renderIcon("location")}
        </span>

        <span>
          <strong>${escapeHtml(BUSINESS.locationShort)}</strong>
          <small>${escapeHtml(BUSINESS.postal)}</small>
        </span>
      </div>
    </div>
  `;
}

/* =========================================================
   SECTIONS
========================================================= */

function renderHeader() {
  const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");

  return `
    <header
      class="public-home-nav"
      data-public-home-nav="true"
    >
      <div class="public-home-nav-inner">
        <a
          class="public-home-brand"
          href="#inicio"
          aria-label="${escapeAttr(BUSINESS.name)}"
          data-public-home-scroll-link="true"
        >
          ${renderLogo()}
        </a>

        <nav
          class="public-home-nav-panel"
          id="public-home-nav-panel"
          aria-label="Navegación principal"
          data-public-home-nav-panel="true"
        >
          <div
            class="public-home-nav-menu"
            data-public-home-menu="true"
          >
            ${renderNavLinks()}
          </div>

          <div class="public-home-nav-actions">
            <a
              class="public-home-login-link"
              href="${escapeAttr(loginHref)}"
              data-spa="true"
              data-router-link="true"
              data-route="${escapeAttr(loginHref)}"
              data-href="${escapeAttr(loginHref)}"
              data-public-home-login="true"
            >
              Iniciar sesión
            </a>

            <a
              class="public-home-nav-cta"
              href="${escapeAttr(whatsappHref())}"
              target="_blank"
              rel="noopener noreferrer"
              data-public-home-cta="true"
            >
              <span aria-hidden="true">
                ${renderIcon("whatsapp")}
              </span>

              <span>
                Solicitar diagnóstico
              </span>
            </a>
          </div>
        </nav>

        <button
          class="public-home-nav-toggle"
          type="button"
          aria-label="Abrir menú"
          aria-controls="public-home-nav-panel"
          aria-expanded="false"
          data-public-home-nav-toggle="true"
        >
          <span class="public-home-nav-toggle-icon public-home-nav-toggle-icon--open" aria-hidden="true">
            ${renderIcon("menu")}
          </span>

          <span class="public-home-nav-toggle-icon public-home-nav-toggle-icon--close" aria-hidden="true">
            ${renderIcon("close")}
          </span>
        </button>
      </div>
    </header>
  `;
}

function renderHero() {
  return `
    <section
      class="public-home-section public-home-hero"
      id="inicio"
      data-public-home-section="inicio"
      aria-labelledby="public-home-title"
    >
      <div class="public-home-hero-bg" aria-hidden="true"></div>

      <div class="public-home-hero-grid">
        <div class="public-home-hero-copy">
          <p
            class="public-home-kicker"
            data-public-home-reveal="true"
          >
            <span aria-hidden="true">
              ${renderIcon("shield")}
            </span>

            <span>
              Servicio técnico informático en ${escapeHtml(BUSINESS.locationShort)}
            </span>
          </p>

          <h1
            class="public-home-title"
            id="public-home-title"
            data-public-home-reveal="true"
          >
            Soluciones IT
            <span>rápidas, seguras y eficaces.</span>
          </h1>

          <p
            class="public-home-hero-text"
            data-public-home-reveal="true"
          >
            Reparación de ordenadores y portátiles, optimización,
            reinstalación del sistema, redes, impresoras y mucho más.
            Servicio a domicilio en ${escapeHtml(BUSINESS.locationFull)}.
            Se emiten facturas.
          </p>

          <div
            class="public-home-hero-actions"
            data-public-home-reveal="true"
          >
            <a
              class="public-home-button public-home-button--primary"
              href="${escapeAttr(whatsappHref())}"
              target="_blank"
              rel="noopener noreferrer"
              data-public-home-cta="true"
            >
              <span>Pedir presupuesto</span>
              ${renderIcon("arrow")}
            </a>

            <a
              class="public-home-button public-home-button--secondary"
              href="#servicios"
              data-public-home-scroll-link="true"
            >
              <span>Ver servicios</span>
              ${renderIcon("arrow")}
            </a>
          </div>

          <ul
            class="public-home-trust-list"
            aria-label="Ventajas principales"
          >
            ${renderTrustItems()}
          </ul>
        </div>

        <div
          class="public-home-hero-visual"
          aria-hidden="true"
          data-public-home-reveal="true"
        >
          <div class="public-home-tech-scene">
            <div class="public-home-tech-grid"></div>

            <div class="public-home-portrait-card">
              <div class="public-home-portrait-glow"></div>

              <div class="public-home-portrait" data-public-home-portrait="true">
                <div class="public-home-portrait-head"></div>
                <div class="public-home-portrait-body">
                  <span class="public-home-portrait-logo">
                    ${renderLogo({ compact: true })}
                  </span>
                </div>
              </div>
            </div>

            <div class="public-home-system-card public-home-system-card--secure">
              <span>${renderIcon("shield")}</span>
              <strong>System secure</strong>
            </div>

            <div class="public-home-system-card public-home-system-card--pc">
              <span class="public-home-pc-ring"></span>
              <span class="public-home-pc-ring"></span>
              <span class="public-home-pc-ring"></span>
            </div>

            <div class="public-home-code-panel">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderServiceSection() {
  return `
    <section
      class="public-home-section public-home-services"
      id="servicios"
      data-public-home-section="servicios"
      aria-labelledby="public-home-services-title"
    >
      <div
        class="public-home-section-head"
        data-public-home-reveal="true"
      >
        <p class="public-home-section-kicker">
          Servicios
        </p>

        <h2 id="public-home-services-title">
          ¿En qué puedo ayudarte?
        </h2>

        <p>
          Desde un portátil lento hasta una reinstalación completa:
          objetivo claro, diagnóstico honesto y solución limpia.
        </p>
      </div>

      <div class="public-home-service-grid">
        ${renderServices()}
      </div>
    </section>
  `;
}

function renderHowSection() {
  return `
    <section
      class="public-home-section public-home-how"
      id="como-trabajo"
      data-public-home-section="como-trabajo"
      aria-labelledby="public-home-how-title"
    >
      <div
        class="public-home-section-head"
        data-public-home-reveal="true"
      >
        <p class="public-home-section-kicker">
          Cómo trabajo
        </p>

        <h2 id="public-home-how-title">
          Claro, directo y sin marearte.
        </h2>

        <p>
          Primero entendemos el problema. Luego vemos la mejor solución.
          Y después se repara con cabeza.
        </p>
      </div>

      <div class="public-home-step-grid">
        ${renderSteps()}
      </div>
    </section>
  `;
}

function renderPricesSection() {
  return `
    <section
      class="public-home-section public-home-prices"
      id="precios"
      data-public-home-section="precios"
      aria-labelledby="public-home-prices-title"
    >
      <div
        class="public-home-section-head"
        data-public-home-reveal="true"
      >
        <p class="public-home-section-kicker">
          Precios
        </p>

        <h2 id="public-home-prices-title">
          Presupuesto claro antes de empezar.
        </h2>

        <p>
          Cada equipo y cada avería son distintos. Por eso primero se revisa
          el caso y se propone una solución con presupuesto sin compromiso.
        </p>
      </div>

      <div class="public-home-price-grid">
        ${renderPriceCards()}
      </div>
    </section>
  `;
}

function renderDiagnosticForm() {
  return `
    <form
      class="public-home-diagnostic-form"
      data-public-home-diagnostic-form="true"
      data-whatsapp-phone="${escapeAttr(BUSINESS.phoneInternational)}"
      autocomplete="on"
      novalidate
    >
      <div class="public-home-form-grid">
        <div class="public-home-field">
          <label for="public-home-name">
            Nombre
          </label>

          <input
            id="public-home-name"
            name="nombre"
            type="text"
            placeholder="Tu nombre"
            autocomplete="name"
            data-label="Nombre"
          >

          <p
            class="public-home-field-error"
            id="public-home-name-error"
            data-public-home-error-for="nombre"
            hidden
          ></p>
        </div>

        <div class="public-home-field">
          <label for="public-home-contact">
            Teléfono o email
          </label>

          <input
            id="public-home-contact"
            name="contacto"
            type="text"
            placeholder="Dónde te respondo"
            autocomplete="tel"
            data-label="Contacto"
            required
          >

          <p
            class="public-home-field-error"
            id="public-home-contact-error"
            data-public-home-error-for="contacto"
            hidden
          ></p>
        </div>

        <div class="public-home-field">
          <label for="public-home-device">
            Equipo
          </label>

          <select
            id="public-home-device"
            name="equipo"
            data-label="Equipo"
          >
            <option value="">Selecciona una opción</option>
            <option value="Ordenador portátil">Ordenador portátil</option>
            <option value="Ordenador sobremesa">Ordenador sobremesa</option>
            <option value="Red / WiFi / impresora">Red / WiFi / impresora</option>
            <option value="No lo tengo claro">No lo tengo claro</option>
          </select>

          <p
            class="public-home-field-error"
            id="public-home-device-error"
            data-public-home-error-for="equipo"
            hidden
          ></p>
        </div>

        <div class="public-home-field">
          <label for="public-home-urgency">
            Urgencia
          </label>

          <select
            id="public-home-urgency"
            name="urgencia"
            data-label="Urgencia"
          >
            <option value="Normal">Normal</option>
            <option value="Urgente">Urgente</option>
            <option value="Solo quiero presupuesto">Solo quiero presupuesto</option>
          </select>

          <p
            class="public-home-field-error"
            id="public-home-urgency-error"
            data-public-home-error-for="urgencia"
            hidden
          ></p>
        </div>

        <div class="public-home-field public-home-field--wide">
          <label for="public-home-problem">
            Cuéntame qué ocurre
          </label>

          <textarea
            id="public-home-problem"
            name="problema"
            rows="5"
            placeholder="Ejemplo: mi portátil va muy lento, tarda mucho en arrancar y se bloquea..."
            data-label="Problema"
            required
          ></textarea>

          <p
            class="public-home-field-error"
            id="public-home-problem-error"
            data-public-home-error-for="problema"
            hidden
          ></p>
        </div>
      </div>

      <p
        class="public-home-form-status"
        data-public-home-form-status="true"
        role="status"
        aria-live="polite"
        hidden
      ></p>

      <button
        class="public-home-button public-home-button--primary public-home-form-submit"
        type="submit"
        data-public-home-cta="true"
      >
        <span>Enviar por WhatsApp</span>
        ${renderIcon("whatsapp")}
      </button>

      <p class="public-home-form-note">
        Al enviar, se abrirá WhatsApp con el mensaje preparado. No se envía nada sin que lo revises antes.
      </p>
    </form>
  `;
}

function renderContactSection() {
  return `
    <section
      class="public-home-section public-home-contact"
      id="contacto"
      data-public-home-section="contacto"
      aria-labelledby="public-home-contact-title"
    >
      <div class="public-home-contact-grid">
        <div class="public-home-contact-copy">
          <p
            class="public-home-section-kicker"
            data-public-home-reveal="true"
          >
            Contacto
          </p>

          <h2
            id="public-home-contact-title"
            data-public-home-reveal="true"
          >
            Escríbeme y te respondo lo antes posible.
          </h2>

          <p data-public-home-reveal="true">
            Cuéntame qué le pasa a tu ordenador o qué necesitas configurar.
            Te daré la mejor solución posible y un presupuesto sin compromiso.
          </p>

          ${renderContactCards()}
        </div>

        <div
          class="public-home-contact-form-card"
          data-public-home-reveal="true"
        >
          <div class="public-home-contact-form-head">
            <span aria-hidden="true">
              ${renderIcon("diagnostic")}
            </span>

            <div>
              <h3>
                Solicitar diagnóstico
              </h3>

              <p>
                Déjame los datos básicos y se abrirá WhatsApp con el mensaje listo.
              </p>
            </div>
          </div>

          ${renderDiagnosticForm()}
        </div>
      </div>
    </section>
  `;
}

function renderFaqSection() {
  return `
    <section
      class="public-home-section public-home-faq"
      id="faq"
      data-public-home-section="faq"
      aria-labelledby="public-home-faq-title"
    >
      <div
        class="public-home-section-head"
        data-public-home-reveal="true"
      >
        <p class="public-home-section-kicker">
          Dudas rápidas
        </p>

        <h2 id="public-home-faq-title">
          Antes de escribirme.
        </h2>
      </div>

      <div class="public-home-faq-list">
        ${renderFaqs()}
      </div>
    </section>
  `;
}

function renderFooter() {
  const loginHref = safeInternalHref(BUSINESS.loginPath, "/login");

  return `
    <footer class="public-home-footer">
      <div class="public-home-footer-inner">
        <div class="public-home-footer-brand">
          ${renderLogo()}
        </div>

        <div class="public-home-footer-links">
          <a href="#servicios" data-public-home-scroll-link="true">
            Servicios
          </a>

          <a href="#como-trabajo" data-public-home-scroll-link="true">
            Cómo trabajo
          </a>

          <a href="#precios" data-public-home-scroll-link="true">
            Precios
          </a>

          <a href="#contacto" data-public-home-scroll-link="true">
            Contacto
          </a>

          <a
            href="${escapeAttr(loginHref)}"
            data-spa="true"
            data-router-link="true"
            data-route="${escapeAttr(loginHref)}"
            data-public-home-login="true"
          >
            Iniciar sesión
          </a>
        </div>

        <div class="public-home-footer-contact">
          <a
            href="${escapeAttr(whatsappHref())}"
            target="_blank"
            rel="noopener noreferrer"
            data-public-home-cta="true"
          >
            ${renderIcon("whatsapp")}
            <span>${escapeHtml(BUSINESS.phoneDisplay)}</span>
          </a>

          <a
            href="${escapeAttr(mailHref())}"
            data-public-home-cta="true"
          >
            ${renderIcon("mail")}
            <span>${escapeHtml(BUSINESS.email)}</span>
          </a>
        </div>
      </div>

      <div class="public-home-footer-bottom">
        <p>
          © 2025 ${escapeHtml(BUSINESS.name)}. Todos los derechos reservados.
        </p>

        <p>
          ${escapeHtml(BUSINESS.locationFull)} · Se emiten facturas.
        </p>
      </div>
    </footer>
  `;
}

function renderFloatingWhatsApp() {
  return `
    <a
      class="public-home-floating-whatsapp"
      href="${escapeAttr(whatsappHref())}"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar por WhatsApp al ${escapeAttr(BUSINESS.phoneDisplay)}"
      data-public-home-cta="true"
    >
      ${renderIcon("whatsapp")}
    </a>
  `;
}

/* =========================================================
   TEMPLATE
========================================================= */

export function createPublicHomeTemplate() {
  return renderPublicShell({
    view: "home",
    appName: APP_NAME,
    header: false,
    ariaLabelledBy: "public-home-title",

    body: `
      <div
        class="public-home"
        data-public-home="true"
        data-public-home-template-version="${escapeAttr(PUBLIC_HOME_TEMPLATE_VERSION)}"
        data-business-phone="${escapeAttr(BUSINESS.phoneDisplay)}"
        data-business-whatsapp="${escapeAttr(BUSINESS.phoneInternational)}"
      >
        <div
          class="public-home-background"
          aria-hidden="true"
        >
          <span class="public-home-bg-orb public-home-bg-orb--one"></span>
          <span class="public-home-bg-orb public-home-bg-orb--two"></span>
          <span class="public-home-bg-grid"></span>
          <span class="public-home-bg-noise"></span>
        </div>

        ${renderHeader()}

        <div
          class="public-home-content"
          data-public-home-main="true"
        >
          ${renderHero()}
          ${renderServiceSection()}
          ${renderHowSection()}
          ${renderPricesSection()}
          ${renderContactSection()}
          ${renderFaqSection()}
        </div>

        ${renderFooter()}
        ${renderFloatingWhatsApp()}
      </div>
    `,
  });
}

export function getPublicHomeTemplate() {
  return createPublicHomeTemplate();
}

export const getTemplate = createPublicHomeTemplate;

export default createPublicHomeTemplate;
